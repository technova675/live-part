"use server";

import { join } from "node:path";
import { updateTag } from "next/cache";
import { createUsernamePostSync } from "@/lib/username-post-sync-engine.mjs";
import { startUsernamePostScrape, getRun, getTweetDatasetItems, getTweetRunInput } from "@/lib/apify";
import { supabase } from "@/lib/supabase";
import type { UsernamePostJob, UsernamePostSyncState } from "./types";

const sync = createUsernamePostSync({
  storageDir: join(process.cwd(), ".username-post-sync"),
  startRun: startUsernamePostScrape,
  getRun,
  getItems: getTweetDatasetItems,
  getRunInput: getTweetRunInput,
  db: supabase,
});

function result(jobs: UsernamePostJob[]): UsernamePostSyncState {
  return { jobs, configured: Boolean(process.env.APIFY_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) };
}

export async function getUsernamePostSyncState(): Promise<UsernamePostSyncState> {
  return result(await sync.getState());
}

export async function advanceUsernamePostSync(startNext: boolean): Promise<UsernamePostSyncState> {
  if (typeof startNext !== "boolean") throw new Error("Invalid sync request");
  const before = await sync.getState();
  const jobs = await sync.step(startNext);
  if (jobs.filter((job: UsernamePostJob) => job.status === "paid").length > before.filter((job: UsernamePostJob) => job.status === "paid").length) {
    updateTag("authors");
    updateTag("paid-promotion-posts");
  }
  return result(jobs);
}

export async function retryUsernamePostSync(username: string): Promise<UsernamePostSyncState> {
  return result(await sync.retry(username));
}

export async function attachUsernamePostSyncRun(username: string, runId: string): Promise<UsernamePostSyncState> {
  return result(await sync.attachRun(username, runId));
}
