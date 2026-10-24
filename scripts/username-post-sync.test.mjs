import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildUsernameQueue, createUsernamePostSync } from "../lib/username-post-sync-engine.mjs";

const tweet = (id, username = "low", flag = true, date = "2026-10-10T00:00:00Z") => ({
  id, author: { username, followers: 100 }, createdAt: date, text: "Post",
  url: `https://x.com/${username}/status/${id}`, contentDisclosure: { advertising: { isPaidPromotion: flag } },
});

async function harness(t, items, profiles = [{ username: "low", followers: 100 }, { username: "high", followers: 1 }], failProfile = false) {
  const storageDir = await mkdtemp(join(tmpdir(), "username-post-sync-"));
  t.after(() => rm(storageDir, { recursive: true, force: true }));
  const starts = [], posts = new Map(), dbProfiles = new Map(profiles.map((p) => [p.username, { ...p, bio: "Preserve existing bio" }]));
  let directoryReads = 0;
  const deps = {
    storageDir,
    startRun: async (username) => { starts.push(username); return { id: `run${username}`, defaultDatasetId: username }; },
    getRun: async (id) => ({ id, status: "SUCCEEDED", defaultDatasetId: id.slice(3) }),
    getItems: async (id) => items[id] ?? [],
    getRunInput: async (id) => ({ searchTerms: [`from:${id.slice(3)} since:2026-10-01`] }),
    db: async (path, init = {}) => {
      if (path.includes("&order=")) {
        directoryReads++;
        const offset = Number(path.match(/offset=(\d+)/)[1]);
        return Response.json(profiles.slice(offset, offset + 1000));
      }
      if (!init.method) return Response.json([...dbProfiles.values()].filter((p) => path.endsWith(`eq.${p.username}`)));
      assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
      const rows = JSON.parse(init.body);
      if (path.startsWith("paid_promotion_posts")) {
        assert.ok(rows.length <= 50);
        for (const row of rows) posts.set(row.raw.id, row);
      } else {
        if (failProfile) { failProfile = false; throw new Error("Profile write interrupted"); }
        for (const row of rows) dbProfiles.set(row.username, row);
      }
      return new Response(null, { status: 204 });
    },
  };
  return { sync: createUsernamePostSync(deps), deps, starts, posts, dbProfiles, reads: () => directoryReads };
}

test("queue excludes both manual accounts, normalizes/deduplicates handles and sorts followers descending", () => {
  const queue = buildUsernameQueue([
    { username: "high", followers: 300 }, { username: "Low", followers: 0 },
    { username: "EVRENDAG1284", followers: 0 }, { username: "omukare_wanwan", followers: 0 },
    { username: "unknown", followers: null }, { username: "low", followers: 0 },
    { username: "alpha", followers: 300 }, { username: "bad-name", followers: 1 },
  ]);
  assert.deepEqual(queue.map((p) => p.username), ["alpha", "high", "low", "unknown"]);
});

test("only requested-author paid posts within dates and excluding replies/retweets are upserted", async (t) => {
  const missing = tweet("103"); delete missing.contentDisclosure;
  const h = await harness(t, { low: [
    tweet("100", "LOW"), tweet("100", "LOW"), tweet("101"), tweet("102", "low", false), missing,
    tweet("104", "low", "true"), tweet("200", "other"), tweet("201", "low", true, "2026-09-30T23:59:59Z"),
    { ...tweet("202"), isReply: true }, { ...tweet("203"), isRetweet: true },
  ] });
  await h.sync.step(true);
  const jobs = await h.sync.step(true);
  assert.equal(jobs[0].status, "paid");
  assert.equal(jobs[0].fetchedPosts, 5);
  assert.equal(jobs[0].paidPosts, 2);
  assert.equal(jobs[0].skippedPosts, 3);
  assert.deepEqual([...h.posts.keys()], ["100", "101"]);
  assert.equal(h.dbProfiles.get("low").bio, "Preserve existing bio");
  assert.equal(h.dbProfiles.get("low").followers, 100);
  assert.deepEqual(h.starts, ["low"]);
  assert.equal(jobs[1].status, "pending");
});

test("pagination loads all profiles and queue remains stable after profile changes/reload", async (t) => {
  const profiles = Array.from({ length: 1001 }, (_, i) => ({ username: `user${i}`, followers: 1001 - i }));
  const h = await harness(t, {}, profiles);
  const initial = await h.sync.getState();
  assert.equal(initial.length, 1001);
  assert.equal(initial[0].username, "user0");
  assert.equal(h.reads(), 2);
  profiles.reverse();
  profiles.push({ username: "newprofile", followers: 0 });
  const reload = await createUsernamePostSync(h.deps).getState();
  assert.deepEqual(reload, initial);
  assert.equal(h.reads(), 2);
});

test("multiple batches and partial import retries reuse the run without duplicate posts", async (t) => {
  const h = await harness(t, { low: Array.from({ length: 55 }, (_, i) => tweet(String(100 + i))) }, undefined, true);
  await h.sync.step(true);
  let jobs = await h.sync.step(false);
  assert.equal(jobs[0].status, "failed");
  assert.equal(h.posts.size, 55);
  await h.sync.retry("low");
  jobs = await h.sync.step(false);
  assert.equal(jobs[0].paidPosts, 55);
  assert.equal(jobs[0].status, "paid");
  assert.equal(h.posts.size, 55);
  assert.deepEqual(h.starts, ["low"]);
});

test("accounts without paid posts complete without writes and without starting the next automatically", async (t) => {
  const h = await harness(t, { low: [tweet("100", "low", false)] });
  await h.sync.step(true);
  let jobs = await h.sync.step(false);
  assert.equal(jobs[0].status, "not_paid");
  assert.equal(h.posts.size, 0);
  await h.sync.step(false);
  assert.deepEqual(h.starts, ["low"]);
  await h.sync.step(true);
  jobs = await h.sync.step(false);
  assert.equal(jobs[1].status, "missing");
  assert.deepEqual(h.starts, ["low", "high"]);
});

test("username actor template preserves the requested filters and date", async () => {
  const input = JSON.parse(await readFile(new URL("../lib/username-post-sync-input.json", import.meta.url), "utf8"));
  assert.deepEqual(input.searchTerms, ["from:evrendag1284 since:2026-10-01"]);
  assert.deepEqual(input.tweetTypes, { excludeReplies: true, excludeRetweets: true });
  assert.equal(input.maxItems, 1000);
  assert.equal(input.topMetric, "views");
  assert.equal(input.includeSearchTerms, true);
  assert.equal(input.mode, "legacy");
  assert.equal(input.tweetIds, undefined);
});
