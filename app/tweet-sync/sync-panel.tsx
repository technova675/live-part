"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { advanceTweetSync, attachTweetSyncRun, getTweetSyncState, retryTweetSync } from "./actions";
import type { TweetJob, TweetSyncState } from "./types";

const completed = new Set(["paid", "not_paid", "unknown", "missing"]);
const labels: Record<TweetJob["status"], string> = {
  pending: "Pending", starting: "Starting", running: "Fetching", paid: "Paid · saved",
  not_paid: "Not paid · skipped", unknown: "No paid label · skipped", missing: "Unavailable · skipped",
  failed: "Failed", start_unknown: "Run ID needed",
};

export function TweetSyncPanel() {
  const [state, setState] = useState<TweetSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback((action: () => Promise<TweetSyncState>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    startTransition(async () => {
      try {
        const next = await action();
        setState(next);
        setError(null);
        if (next.jobs.some((job) => ["failed", "start_unknown"].includes(job.status))) setAutoRun(false);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        setAutoRun(false);
      } finally { busyRef.current = false; setBusy(false); }
    });
  }, []);

  const jobs = state?.jobs ?? [];
  const active = jobs.some((job) => ["running", "starting"].includes(job.status));
  const blocked = jobs.some((job) => ["failed", "start_unknown"].includes(job.status));
  const pending = jobs.some((job) => job.status === "pending");

  useEffect(() => {
    if (busy || error) return;
    let action: (() => Promise<TweetSyncState>) | undefined;
    let delay = 0;
    if (!state) action = getTweetSyncState;
    else if (active && !blocked) { action = () => advanceTweetSync(false); delay = 4000; }
    else if (autoRun && pending && !blocked && state.configured) action = () => advanceTweetSync(true);
    if (!action) return;
    const timer = setTimeout(() => run(action!), delay);
    return () => clearTimeout(timer);
  }, [state, busy, error, active, blocked, autoRun, pending, run]);

  if (!state) return (
    <div className="mt-8 text-sm text-muted">
      {error ?? "Loading tweet queue…"}
      {error && <button onClick={() => run(getTweetSyncState)} className="ml-3 text-accent">Retry loading</button>}
    </div>
  );

  const done = jobs.filter((job) => completed.has(job.status)).length;
  const paid = jobs.filter((job) => job.status === "paid");
  const profiles = new Set(paid.map((job) => job.savedUsername)).size;
  const skipped = done - paid.length;
  const canStart = state.configured && pending && !blocked && !active && !busy;
  const autoActive = autoRun && (active || pending) && !blocked;

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Tweets checked</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{done}<span className="text-lg text-muted"> / {jobs.length}</span></p>
            <p aria-live="polite" className="mt-1 text-sm text-muted">{paid.length} paid posts saved · {profiles} author profiles saved · {skipped} skipped</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!canStart} onClick={() => run(() => advanceTweetSync(true))} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50">Run next tweet</button>
            <button disabled={!autoActive && !canStart && !active} onClick={() => setAutoRun(!autoActive)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{autoActive ? "Pause after current" : "Run all remaining"}</button>
            <button disabled={busy} onClick={() => run(getTweetSyncState)} className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-50">Refresh status</button>
          </div>
        </div>
        <progress aria-label="Tweets checked" value={done} max={jobs.length || 1} className="mt-4 h-2 w-full accent-[var(--accent)]" />
        <p className="mt-3 text-xs text-muted">$0.00015 per returned tweet · about $0.0273 for 182 results, before any other Apify charges.</p>
        <p className="mt-1 text-xs text-muted">Keep this page open to continue the loop. Progress is saved on this server; after reopening, resume with Run all remaining.</p>
        {!state.configured && <p role="alert" className="mt-3 text-sm text-red-400">Apify or database configuration is missing on the server.</p>}
        {blocked && <p role="alert" className="mt-3 text-sm text-amber-400">Sync paused. Resolve the failed tweet or attach the interrupted run below before continuing.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs text-muted"><tr><th className="p-3">#</th><th className="p-3">Tweet / creator</th><th className="p-3">Result</th><th className="p-3">Apify run</th></tr></thead>
          <tbody>
            {jobs.map((job, index) => (
              <tr key={job.id} className="border-t border-border align-top">
                <td className="p-3 text-muted">{index + 1}</td>
                <td className="p-3"><a href={`https://x.com/i/status/${job.id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline">{job.id}</a>{job.username && <p className="mt-1 text-xs text-muted">@{job.username}</p>}</td>
                <td className="max-w-md p-3">
                  <span className={job.status === "paid" ? "text-emerald-400" : ["failed", "start_unknown"].includes(job.status) ? "text-red-400" : job.status === "running" ? "text-accent" : "text-muted"}>{labels[job.status]}</span>
                  {job.error && <p className="mt-1 break-words text-xs text-muted">{job.error}</p>}
                  {job.status === "failed" && <button disabled={busy || active} onClick={() => run(async () => { await retryTweetSync(job.id); return advanceTweetSync(true); })} className="mt-2 text-xs text-accent hover:underline disabled:opacity-50">Retry {job.runId ? "run / import" : "fetch"}</button>}
                  {job.status === "start_unknown" && <RecoverRun disabled={busy} onAttach={(runId) => run(() => attachTweetSyncRun(job.id, runId))} />}
                </td>
                <td className="p-3">{job.runId ? <a href={`https://console.apify.com/actors/runs/${job.runId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">View run ↗</a> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecoverRun({ disabled, onAttach }: { disabled: boolean; onAttach: (id: string) => void }) {
  const [runId, setRunId] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); onAttach(runId.trim()); }} className="mt-2 flex flex-wrap gap-2">
      <input aria-label="Apify run ID" placeholder="Existing Apify run ID" value={runId} onChange={(event) => setRunId(event.target.value)} className="min-w-0 rounded border border-border bg-surface px-2 py-1 text-xs" />
      <button disabled={disabled || !runId.trim()} className="text-xs text-accent disabled:opacity-50">Attach run</button>
    </form>
  );
}
