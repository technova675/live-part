"use server";

import { join } from "node:path";
import { updateTag } from "next/cache";
import { createUsernamePostSync } from "@/lib/username-post-sync-engine.mjs";
import queue from "@/lib/priced-post-sync-queue.json";
import { startUsernamePostScrape, getRun, getTweetDatasetItems, getTweetRunInput } from "@/lib/apify";
import { supabase } from "@/lib/supabase";
import type { UsernamePostJob, UsernamePostSyncState } from "../username-post-sync/types";

const sync = createUsernamePostSync({
  queue, storageDir: join(process.cwd(), ".priced-post-sync"),
  startRun: startUsernamePostScrape, getRun, getItems: getTweetDatasetItems,
  getRunInput: getTweetRunInput, db: supabase,
});

function result(jobs: UsernamePostJob[]): UsernamePostSyncState {
  return { jobs, configured: Boolean(process.env.APIFY_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) };
}

export async function getPricedPostSyncState(): Promise<UsernamePostSyncState> {
  return result(await sync.getState());
}

export async function advancePricedPostSync(startNext: boolean): Promise<UsernamePostSyncState> {
  if (typeof startNext !== "boolean") throw new Error("Invalid sync request");
  const before = await sync.getState();
  const jobs = await sync.step(startNext);
  if (jobs.filter((job: UsernamePostJob) => job.status === "paid").length > before.filter((job: UsernamePostJob) => job.status === "paid").length) {
    updateTag("authors");
    updateTag("paid-promotion-posts");
  }
  return result(jobs);
}

export async function retryPricedPostSync(username: string): Promise<UsernamePostSyncState> {
  return result(await sync.retry(username));
}

export async function attachPricedPostSyncRun(username: string, runId: string): Promise<UsernamePostSyncState> {
  return result(await sync.attachRun(username, runId));
}
