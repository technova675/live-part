"use server";

import { updateTag } from "next/cache";
import { getDatasetItems, getRun, startUserScrape, toProfileRow, type ProfileRow } from "@/lib/apify";
import { countRows, supabase } from "@/lib/supabase";
import { BATCH_SIZE } from "./constants";

export type Batch = {
  offset_start: number;
  status: "running" | "succeeded" | "failed";
  run_id: string | null;
  requested: number;
  fetched: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type SyncState = {
  total: number;
  profiles: number;
  batches: Batch[];
};

const BATCH_COLUMNS = "offset_start,status,run_id,requested,fetched,error,started_at,finished_at";

async function getBatches(): Promise<Batch[]> {
  const res = await supabase(`author_sync_batches?select=${BATCH_COLUMNS}&order=offset_start.asc`);
  return res.json();
}

async function saveBatch(batch: Partial<Batch> & { offset_start: number; dataset_id?: string | null }) {
  await supabase("author_sync_batches?on_conflict=offset_start", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
}

async function getState(): Promise<SyncState> {
  const [total, profiles, batches] = await Promise.all([
    countRows("paid_authors"),
    countRows("author_profiles"),
    getBatches(),
  ]);
  return { total, profiles, batches };
}

// Checks every running batch against Apify, stores profiles for finished runs,
// and returns the current progress.
export async function pollSync(): Promise<SyncState> {
  const running = (await getBatches()).filter((b) => b.status === "running" && b.run_id);
  let stored = false;

  for (const batch of running) {
    try {
      const run = await getRun(batch.run_id!);
      if (run.status === "SUCCEEDED") {
        const items = await getDatasetItems(run.defaultDatasetId);
        // Dedupe by username: one upsert can't touch the same row twice.
        const rows = new Map<string, ProfileRow>();
        for (const item of items) {
          const row = toProfileRow(item);
          if (row) rows.set(row.username, row);
        }
        if (rows.size > 0) {
          await supabase("author_profiles?on_conflict=username", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([...rows.values()].map((r) => ({ ...r, fetched_at: new Date().toISOString() }))),
          });
          stored = true;
        }
        await saveBatch({
          offset_start: batch.offset_start,
          status: "succeeded",
          fetched: rows.size,
          error: null,
          finished_at: new Date().toISOString(),
        });
      } else if (!["READY", "RUNNING"].includes(run.status)) {
        await saveBatch({
          offset_start: batch.offset_start,
          status: "failed",
          error: `Apify run ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`,
          finished_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      await saveBatch({
        offset_start: batch.offset_start,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        finished_at: new Date().toISOString(),
      });
    }
  }

  if (stored) updateTag("authors");
  return getState();
}

// Equivalent of: select author_username from paid_authors order by id offset <offset> limit 100
// (ordered by id so batches stay stable between runs), then hands the names to Apify.
export async function startBatch(offset: number): Promise<SyncState> {
  if (!Number.isInteger(offset) || offset < 0 || offset % BATCH_SIZE !== 0) {
    throw new Error(`Invalid batch offset ${offset}`);
  }

  const existing = (await getBatches()).find((b) => b.offset_start === offset);
  if (existing?.status === "running") return getState();

  const res = await supabase(
    `paid_authors?select=author_username&order=id.asc&offset=${offset}&limit=${BATCH_SIZE}`,
  );
  const names = [...new Set((await res.json()).map((r: { author_username: string }) => r.author_username))] as string[];
  if (names.length === 0) throw new Error(`No authors at offset ${offset}`);

  try {
    const run = await startUserScrape(names);
    await saveBatch({
      offset_start: offset,
      status: "running",
      run_id: run.id,
      dataset_id: run.defaultDatasetId,
      requested: names.length,
      fetched: 0,
      error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    });
  } catch (e) {
    await saveBatch({
      offset_start: offset,
      status: "failed",
      requested: names.length,
      error: e instanceof Error ? e.message : String(e),
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
  }

  return getState();
}
