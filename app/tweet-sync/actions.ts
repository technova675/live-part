"use server";

import { join } from "node:path";
import { updateTag } from "next/cache";
import { createTweetSync } from "@/lib/tweet-sync-engine.mjs";
import queue from "@/lib/tweet-sync-queue.json";
import { startTweetScrape, getRun, getTweetDatasetItems, getTweetRunInput } from "@/lib/apify";
import { supabase } from "@/lib/supabase";
import type { TweetJob, TweetSyncState } from "./types";

const sync = createTweetSync({
  queue,
  storageDir: join(process.cwd(), ".tweet-sync"),
  startRun: startTweetScrape,
  getRun,
  getItems: getTweetDatasetItems,
  getRunInput: getTweetRunInput,
  db: supabase,
});

function result(jobs: TweetJob[]): TweetSyncState {
  return { jobs, configured: Boolean(process.env.APIFY_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) };
}

export async function getTweetSyncState(): Promise<TweetSyncState> {
  return result(await sync.getState());
}

export async function advanceTweetSync(startNext: boolean): Promise<TweetSyncState> {
  if (typeof startNext !== "boolean") throw new Error("Invalid sync request");
  const before = await sync.getState();
  const jobs = await sync.step(startNext);
  if (jobs.filter((job: TweetJob) => job.status === "paid").length > before.filter((job: TweetJob) => job.status === "paid").length) {
    updateTag("authors");
    updateTag("paid-promotion-posts");
  }
  return result(jobs);
}

export async function retryTweetSync(id: string): Promise<TweetSyncState> {
  return result(await sync.retry(id));
}

export async function attachTweetSyncRun(id: string, runId: string): Promise<TweetSyncState> {
  return result(await sync.attachRun(id, runId));
}
