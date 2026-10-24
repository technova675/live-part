import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTweetSync } from "../lib/tweet-sync-engine.mjs";

const tweet = (id, flag = true, author = "DataChaz") => ({
  id, text: "Example tweet", url: `https://x.com/${author}/status/${id}`,
  createdAt: "2026-09-16T22:22:07Z", author: { username: author, id: "author-id", followers: 42 },
  ...(flag === undefined ? {} : { contentDisclosure: { advertising: { isPaidPromotion: flag } } }),
});

async function harness(t, items, options = {}) {
  const storageDir = await mkdtemp(join(tmpdir(), "paid-tweet-sync-"));
  t.after(() => rm(storageDir, { recursive: true, force: true }));
  const queue = options.queue ?? [{ id: "100", username: "DataChaz" }, { id: "200", username: "other" }];
  const posts = new Map(), profiles = new Map(), starts = [], calls = [];
  profiles.set("datachaz", { username: "datachaz", name: "Stored name", bio: "Keep this biography", avatar_url: "https://example.com/avatar.png" });
  let failProfile = options.failProfile ?? false;
  const deps = {
    queue, storageDir,
    startRun: async (id) => { starts.push(id); if (options.startError) throw new Error("Connection interrupted"); return { id: `run${id}`, defaultDatasetId: `dataset${id}` }; },
    getRun: async (id) => ({ id, status: "SUCCEEDED", defaultDatasetId: `dataset${id.slice(3)}` }),
    getRunInput: async (id) => ({ tweetIds: [id.slice(3)] }),
    getItems: async (id) => items[id.slice(7)] ?? [],
    db: async (path, init = {}) => {
      calls.push({ path, init });
      if (!init.method) return Response.json([...profiles.values()].filter((p) => path.endsWith(`eq.${p.username}`)));
      const rows = JSON.parse(init.body);
      assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
      if (path.startsWith("paid_promotion_posts")) for (const row of rows) posts.set(row.raw.id, row);
      else {
        if (failProfile) { failProfile = false; throw new Error("Temporary profile save failure"); }
        for (const row of rows) profiles.set(row.username, row);
      }
      return new Response(null, { status: 204 });
    },
  };
  return { sync: createTweetSync(deps), deps, posts, profiles, starts, calls };
}

test("sequential queue, explicit paid import, profile merge and refresh persistence", async (t) => {
  const h = await harness(t, { "100": [tweet("100")], "200": [tweet("200", true, "BrandNew")] });
  let jobs = await h.sync.step(true);
  assert.equal(jobs[0].status, "running");
  assert.deepEqual(h.starts, ["100"]);
  jobs = await createTweetSync(h.deps).getState();
  assert.equal(jobs[0].runId, "run100");
  jobs = await h.sync.step(true);
  assert.equal(jobs[0].status, "paid");
  assert.equal(jobs[1].status, "pending");
  assert.equal(h.profiles.get("datachaz").bio, "Keep this biography");
  assert.equal(h.profiles.get("datachaz").followers, 42);
  assert.equal(h.posts.size, 1);
  // Pausing/polling does not start another tweet.
  await h.sync.step(false);
  assert.deepEqual(h.starts, ["100"]);
  await h.sync.step(true);
  jobs = await h.sync.step(false);
  assert.equal(jobs[1].status, "paid");
  assert.equal(h.profiles.get("brandnew").screen_name, "BrandNew");
  assert.equal(h.posts.size, 2);
});

test("false, absent and string paid flags never write posts or profiles", async (t) => {
  for (const [flag, status] of [[false, "not_paid"], [null, "unknown"], ["true", "unknown"]]) {
    const h = await harness(t, { "100": [tweet("100", flag)] });
    await h.sync.step(true);
    const jobs = await h.sync.step(false);
    assert.equal(jobs[0].status, status);
    assert.equal(h.posts.size, 0);
    assert.equal(h.calls.filter((call) => call.init.method).length, 0);
  }
});

test("empty/unrelated actor rows cannot import a different tweet", async (t) => {
  const h = await harness(t, { "100": [tweet("999"), { message: "Unavailable result" }] });
  await h.sync.step(true);
  const jobs = await h.sync.step(false);
  assert.equal(jobs[0].status, "missing");
  assert.equal(h.posts.size, 0);
});

test("partial import retry reuses the run and upserts duplicate output once", async (t) => {
  const h = await harness(t, { "100": [tweet("100"), tweet("100")] }, { failProfile: true });
  await h.sync.step(true);
  let jobs = await h.sync.step(false);
  assert.equal(jobs[0].status, "failed");
  assert.equal(h.posts.size, 1);
  await h.sync.step(true);
  assert.deepEqual(h.starts, ["100"]);
  await h.sync.retry("100");
  jobs = await h.sync.step(true);
  assert.equal(jobs[0].status, "paid");
  assert.equal(h.posts.size, 1);
  assert.deepEqual(h.starts, ["100"]);
});

test("lost start response blocks new charges and supports attaching the existing run", async (t) => {
  const h = await harness(t, { "100": [tweet("100")] }, { startError: true });
  let jobs = await h.sync.step(true);
  assert.equal(jobs[0].status, "start_unknown");
  await h.sync.step(true);
  assert.equal(h.starts.length, 1);
  await assert.rejects(h.sync.attachRun("100", "run999"), /does not look up/);
  await h.sync.attachRun("100", "run100");
  jobs = await h.sync.step(false);
  assert.equal(jobs[0].status, "paid");
  assert.equal(h.starts.length, 1);
});

test("concurrent clients cannot start overlapping actor runs", async (t) => {
  const h = await harness(t, { "100": [tweet("100")] });
  await Promise.all([h.sync.step(true), createTweetSync(h.deps).step(true)]);
  assert.deepEqual(h.starts, ["100"]);
  const jobs = await h.sync.getState();
  assert.equal(jobs[0].status, "paid");
  assert.equal(jobs[1].status, "pending");
});
