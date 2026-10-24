"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pollSync, startBatch, type Batch, type SyncState } from "./actions";
import { BATCH_SIZE } from "./constants";

const POLL_MS = 4000;

type Slot = { offset: number; size: number; batch: Batch | undefined };

export function SyncPanel() {
  const [state, setState] = useState<SyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const busyRef = useRef(false);

  // Serialize every server call so a poll and a start never race each other.
  const run = useCallback(async (fn: () => Promise<SyncState>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setState(await fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAutoRun(false);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const slots: Slot[] = [];
  if (state) {
    const byOffset = new Map(state.batches.map((b) => [b.offset_start, b]));
    for (let offset = 0; offset < state.total; offset += BATCH_SIZE) {
      slots.push({ offset, size: Math.min(BATCH_SIZE, state.total - offset), batch: byOffset.get(offset) });
    }
  }
  const anyRunning = slots.some((s) => s.batch?.status === "running");
  const nextPending = slots.find((s) => !s.batch);
  const autoActive = autoRun && (anyRunning || nextPending != null);

  // Load on mount, poll while a run is in flight, and in auto mode start the
  // next batch as soon as the previous one finishes.
  useEffect(() => {
    let next: (() => Promise<SyncState>) | null = null;
    let delay = 0;
    if (!state) next = pollSync;
    else if (anyRunning) [next, delay] = [pollSync, POLL_MS];
    else if (autoRun && nextPending) next = () => startBatch(nextPending.offset);
    if (!next) return;

    const t = setTimeout(() => run(next), delay);
    return () => clearTimeout(t);
  }, [state, anyRunning, autoRun, nextPending, run]);

  if (!state) {
    return <p className="py-20 text-center text-muted">{error ?? "Loading sync status…"}</p>;
  }

  const done = slots.filter((s) => s.batch?.status === "succeeded");
  const requestedDone = done.reduce((n, s) => n + s.batch!.requested, 0);
  const pct = state.total ? Math.min(100, (requestedDone / state.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Accounts processed</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {requestedDone.toLocaleString()}
              <span className="text-lg text-muted"> / {state.total.toLocaleString()}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {state.profiles.toLocaleString()} profiles stored · {done.length} of {slots.length} batches done
            </p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={anyRunning || !nextPending}
              onClick={() => nextPending && run(() => startBatch(nextPending.offset))}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:border-accent disabled:opacity-50"
            >
              Run next batch
            </button>
            <button
              disabled={!autoActive && !nextPending}
              onClick={() => setAutoRun(!autoActive)}
              className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {autoActive ? "Pause after current" : "Run all remaining"}
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => (
          <BatchTile
            key={slot.offset}
            slot={slot}
            disabled={anyRunning}
            onStart={() => run(() => startBatch(slot.offset))}
          />
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLE = {
  pending: "text-muted",
  running: "text-accent",
  succeeded: "text-emerald-500",
  failed: "text-red-500",
} as const;

function BatchTile({ slot, disabled, onStart }: { slot: Slot; disabled: boolean; onStart: () => void }) {
  const { offset, size, batch } = slot;
  const status = batch?.status ?? "pending";
  const missing = batch?.status === "succeeded" ? batch.requested - batch.fetched : 0;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm">
          #{offset + 1}–{offset + size}
        </p>
        <span className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${STATUS_STYLE[status]}`}>
          {status === "running" && <span className="size-2 animate-pulse rounded-full bg-accent" />}
          {status}
        </span>
      </div>
      <p className="text-xs text-muted">
        offset {offset} · limit {BATCH_SIZE}
      </p>
      {batch?.status === "succeeded" && (
        <p className="text-sm">
          {batch.fetched} / {batch.requested} profiles
          {missing > 0 && <span className="text-muted"> · {missing} not found</span>}
        </p>
      )}
      {batch?.status === "running" && <p className="text-sm text-muted">Scraping {batch.requested} accounts…</p>}
      {batch?.status === "failed" && (
        <p className="line-clamp-3 text-xs text-red-500" title={batch.error ?? undefined}>
          {batch.error}
        </p>
      )}
      {status !== "running" && (
        <button
          disabled={disabled}
          onClick={onStart}
          className="mt-auto self-start text-sm font-medium text-accent hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {status === "pending" ? "Run" : "Re-run"}
        </button>
      )}
    </li>
  );
}
