"use server";

import { join } from "node:path";
import { updateTag } from "next/cache";
import { createUsernamePostSync } from "@/lib/username-post-sync-engine.mjs";
import queue from "@/lib/sept-post-sync-queue.json";
import { startSeptPostScrape, SEPT_SINCE, SEPT_UNTIL } from "@/lib/sept-post-scrape";
import { getRun, getTweetDatasetItems, getTweetRunInput } from "@/lib/apify";
import { supabase } from "@/lib/supabase";
import type { UsernamePostJob, UsernamePostSyncState } from "../username-post-sync/types";

const SINCE = SEPT_SINCE;
const UNTIL = SEPT_UNTIL;

const sync = createUsernamePostSync({
  queue, since: SINCE, until: UNTIL, storageDir: join(process.cwd(), ".sept-post-sync"),
  startRun: startSeptPostScrape,
  getRun, getItems: getTweetDatasetItems, getRunInput: getTweetRunInput, db: supabase,
});

function result(jobs: UsernamePostJob[]): UsernamePostSyncState {
  return { jobs, configured: Boolean(process.env.APIFY_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) };
}

export async function getSeptPostSyncState(): Promise<UsernamePostSyncState> {
  return result(await sync.getState());
}

export async function advanceSeptPostSync(startNext: boolean): Promise<UsernamePostSyncState> {
  if (typeof startNext !== "boolean") throw new Error("Invalid sync request");
  const before = await sync.getState();
  const jobs = await sync.step(startNext);
  if (jobs.filter((job: UsernamePostJob) => job.status === "paid").length > before.filter((job: UsernamePostJob) => job.status === "paid").length) {
    updateTag("authors");
    updateTag("paid-promotion-posts");
  }
  return result(jobs);
}

export async function retrySeptPostSync(username: string): Promise<UsernamePostSyncState> {
  return result(await sync.retry(username));
}

export async function attachSeptPostSyncRun(username: string, runId: string): Promise<UsernamePostSyncState> {
  return result(await sync.attachRun(username, runId));
}
