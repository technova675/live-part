import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { selectPaidRows } from "../scripts/import-paid-promotions.mjs";
import { paidAuthorProfiles } from "../scripts/paid-promotion-profiles.mjs";

// One durable queue for this local application. A filesystem lock also serializes
// requests from multiple tabs/processes; a browser ref alone cannot prevent races.
export function createTweetSync({ queue, storageDir, startRun, getRun, getItems, getRunInput, db, processItems = undefined, validateRunInput = undefined }) {
  const statePath = join(storageDir, "state.json");
  const lockPath = join(storageDir, "queue.lock");
  const signature = Array.isArray(queue) ? queue.map((item) => item.id).join(",") : null;

  async function save(state) {
    const temp = `${statePath}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2));
    await rename(temp, statePath);
  }

  async function load() {
    let state;
    try { state = JSON.parse(await readFile(statePath, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      // Dynamic directories are snapshotted once, so profile updates cannot
      // reorder or repeat accounts halfway through a run.
      const initialQueue = typeof queue === "function" ? await queue() : queue;
      state = { signature: initialQueue.map((item) => item.id).join(","), jobs: initialQueue.map((item) => ({ ...item, status: "pending", runId: null, datasetId: null, error: null, stage: null, attempts: 0, savedUsername: null })) };
      await save(state);
    }
    if (signature != null && state.signature !== signature) throw new Error("Saved sync queue differs from the configured tweet IDs");
    // A crash during POST /runs has an unknown outcome. Never silently charge
    // for the same tweet again: let the user attach the run shown in Apify.
    for (const job of state.jobs) if (job.status === "starting") {
      job.status = "start_unknown";
      job.error = "The run-start response was interrupted. Attach its run ID from Apify to continue without starting another run.";
    }
    return state;
  }

  async function locked(fn) {
    await mkdir(storageDir, { recursive: true });
    let lock;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { lock = await open(lockPath, "wx"); break; }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const owner = JSON.parse(await readFile(lockPath, "utf8"));
          try { process.kill(owner.pid, 0); }
          catch (error) { if (error.code === "ESRCH") await unlink(lockPath); }
        } catch { /* Owner may still be writing its lock. */ }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!lock) throw new Error("Another sync request is still processing. Refresh status in a moment.");
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      return await fn(await load());
    } finally { await lock.close(); await unlink(lockPath); }
  }

  async function importPaid(items, job, run) {
    const matching = items.filter((item) => item?.id === job.id);
    if (!matching.length) {
      const diagnostic = items.find((item) => item?.message)?.message;
      job.status = "missing";
      job.error = typeof diagnostic === "string" ? diagnostic.slice(0, 500) : "The actor returned no matching tweet.";
      return;
    }
    const paid = matching.filter((item) => item.contentDisclosure?.advertising?.isPaidPromotion === true);
    if (!paid.length) {
      job.status = matching.some((item) => item.contentDisclosure?.advertising?.isPaidPromotion === false) ? "not_paid" : "unknown";
      return;
    }
    const stamp = run.finishedAt || new Date().toISOString();
    const rows = selectPaidRows(paid, `apify-xquik-${job.id}.json`, stamp);
    const handle = rows[0].raw.author?.username || rows[0].raw.authorUsername;
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) throw new Error("Paid tweet has an invalid author username");
    const response = await db(`author_profiles?select=*&username=eq.${handle.toLowerCase()}`);
    const profiles = paidAuthorProfiles(rows, await response.json(), stamp);
    // Upsert both entities. Retrying an interrupted import reuses the completed
    // actor run, and never creates duplicate post IDs or lowercase usernames.
    await db("paid_promotion_posts?on_conflict=tweet_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal,missing=default" }, body: JSON.stringify(rows),
    });
    await db("author_profiles?on_conflict=username", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(profiles),
    });
    job.status = "paid";
    job.savedUsername = profiles[0].username;
  }

  return {
    getState: () => locked(async (state) => { await save(state); return state.jobs; }),

    step: (startNext = false) => locked(async (state) => {
      if (state.jobs.some((job) => ["failed", "start_unknown"].includes(job.status))) return state.jobs;
      const running = state.jobs.find((job) => job.status === "running");
      if (running) {
        let stage = "poll";
        try {
          const run = await getRun(running.runId);
          if (run.status === "SUCCEEDED") {
            stage = "import";
            const items = await getItems(run.defaultDatasetId);
            if (!Array.isArray(items)) throw new Error("Unexpected actor dataset format");
            running.datasetId = run.defaultDatasetId;
            await writeFile(join(storageDir, `${running.id}.json`), JSON.stringify(items, null, 2));
            if (processItems) await processItems(items, running, run);
            else await importPaid(items, running, run);
            running.finishedAt = new Date().toISOString();
          } else if (!["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(run.status)) {
            stage = "actor";
            throw new Error(`Apify run ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`);
          }
          running.stage = null;
        } catch (error) {
          running.status = "failed";
          running.stage = stage;
          running.error = error.message;
        }
      } else if (startNext) {
        const next = state.jobs.find((job) => job.status === "pending");
        if (next) {
          next.status = "starting";
          next.attempts++;
          next.startedAt = new Date().toISOString();
          await save(state);
          try {
            // Do not retry this POST automatically if its response is lost.
            const run = await startRun(next.id);
            if (!run?.id) throw new Error("Actor start response did not contain a run ID");
            next.runId = run.id;
            next.datasetId = run.defaultDatasetId;
            next.status = "running";
          } catch (error) {
            next.status = error.status >= 400 && error.status < 500 && error.status !== 408 ? "failed" : "start_unknown";
            next.stage = "start";
            next.error = error.message;
          }
        }
      }
      await save(state);
      return state.jobs;
    }),

    retry: (id) => locked(async (state) => {
      const job = state.jobs.find((job) => job.id === id);
      if (!job || job.status !== "failed") throw new Error("Only a failed tweet can be retried");
      if (state.jobs.some((job) => ["running", "start_unknown"].includes(job.status))) throw new Error("Resolve the active run first");
      const reuse = job.runId && ["poll", "import"].includes(job.stage);
      job.status = reuse ? "running" : "pending";
      if (!reuse) { job.runId = null; job.datasetId = null; }
      job.error = null;
      job.stage = null;
      await save(state);
      return state.jobs;
    }),

    attachRun: (id, runId) => locked(async (state) => {
      const job = state.jobs.find((job) => job.id === id);
      if (!job || job.status !== "start_unknown" || !/^[a-zA-Z0-9]{5,40}$/.test(runId)) throw new Error("Invalid recovery request");
      const input = await getRunInput(runId);
      if (validateRunInput) {
        if (!validateRunInput(input, job)) throw new Error("That run does not match this account search");
      } else if (input?.tweetIds?.length !== 1 || input.tweetIds[0] !== id) throw new Error("That run does not look up this tweet ID");
      const run = await getRun(runId);
      job.runId = run.id;
      job.datasetId = run.defaultDatasetId;
      job.status = "running";
      job.error = null;
      await save(state);
      return state.jobs;
    }),
  };
}
