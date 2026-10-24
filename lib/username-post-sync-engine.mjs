import { createTweetSync } from "./tweet-sync-engine.mjs";
import { selectPaidRows } from "../scripts/import-paid-promotions.mjs";
import { paidAuthorProfiles } from "../scripts/paid-promotion-profiles.mjs";

export const EXCLUDED_USERNAMES = ["evrendag1284", "omukare_wanwan"];
export const SINCE = "2026-10-01";

export function buildUsernameQueue(profiles) {
  const unique = new Map();
  for (const profile of profiles) {
    const username = profile.username?.toLowerCase();
    if (!username || !/^[a-z0-9_]{1,15}$/.test(username) || EXCLUDED_USERNAMES.includes(username)) continue;
    unique.set(username, {
      id: username, username, name: profile.name ?? null, followers: profile.followers ?? null,
      fetchedPosts: 0, paidPosts: 0, skippedPosts: 0,
    });
  }
  return [...unique.values()].sort((a, b) => {
    if (a.followers == null && b.followers != null) return 1;
    if (b.followers == null && a.followers != null) return -1;
    return (b.followers ?? 0) - (a.followers ?? 0) || a.username.localeCompare(b.username);
  });
}

export function matchingUsernamePosts(items, username) {
  return items.filter((item) => {
    const author = item?.author?.username ?? item?.authorUsername;
    return typeof item?.id === "string" && /^\d+$/.test(item.id)
      && typeof author === "string" && author.toLowerCase() === username.toLowerCase()
      && item.isReply !== true && item.isRetweet !== true
      && Date.parse(item.createdAt) >= Date.parse(`${SINCE}T00:00:00Z`);
  });
}

export function createUsernamePostSync({ storageDir, startRun, getRun, getItems, getRunInput, db }) {
  return createTweetSync({
    storageDir, startRun, getRun, getItems, getRunInput, db,
    queue: async () => {
      const profiles = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await db(`author_profiles?select=username,name,followers&order=followers.desc.nullslast,username.asc&offset=${offset}&limit=1000`);
        const page = await response.json();
        profiles.push(...page);
        if (page.length < 1000) break;
      }
      return buildUsernameQueue(profiles);
    },
    validateRunInput: (input, job) => input?.searchTerms?.length === 1
      && input.searchTerms[0] === `from:${job.username} since:${SINCE}` && !input.tweetIds?.length,
    processItems: async (items, job, run) => {
      if (EXCLUDED_USERNAMES.includes(job.username)) throw new Error("Excluded account cannot be synced");
      const matching = matchingUsernamePosts(items, job.username);
      const unique = [...new Map(matching.map((item) => [item.id, item])).values()];
      const stamp = run.finishedAt || new Date().toISOString();
      const rows = selectPaidRows(unique, `apify-xquik-${job.username}-since-${SINCE}.json`, stamp);
      job.fetchedPosts = unique.length;
      job.paidPosts = 0;
      job.skippedPosts = unique.length - rows.length;
      if (!rows.length) {
        job.status = unique.length ? "not_paid" : "missing";
        const message = items.find((item) => typeof item?.message === "string")?.message;
        if (!unique.length && message) job.error = message.slice(0, 500);
        return;
      }
      const response = await db(`author_profiles?select=*&username=eq.${job.username}`);
      const profiles = paidAuthorProfiles(rows, await response.json(), stamp);
      for (let offset = 0; offset < rows.length; offset += 50) {
        await db("paid_promotion_posts?on_conflict=tweet_id", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal,missing=default" },
          body: JSON.stringify(rows.slice(offset, offset + 50)),
        });
      }
      await db("author_profiles?on_conflict=username", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(profiles),
      });
      job.paidPosts = rows.length;
      job.savedUsername = profiles[0].username;
      job.status = "paid";
    },
  });
}
