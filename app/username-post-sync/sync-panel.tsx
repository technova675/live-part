"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { advanceUsernamePostSync, attachUsernamePostSyncRun, getUsernamePostSyncState, retryUsernamePostSync } from "./actions";
import { advancePricedPostSync, attachPricedPostSyncRun, getPricedPostSyncState, retryPricedPostSync } from "../priced-post-sync/actions";
import type { UsernamePostJob, UsernamePostSyncState } from "./types";

const complete = new Set(["paid", "not_paid", "unknown", "missing"]);
const labels: Record<UsernamePostJob["status"], string> = {
  pending: "Pending", starting: "Starting", running: "Fetching posts", paid: "Paid posts saved",
  not_paid: "No confirmed paid posts", unknown: "No paid label", missing: "No matching posts",
  failed: "Failed", start_unknown: "Run ID needed",
};

export function UsernamePostSyncPanel({ batch = "all" }: { batch?: "all" | "priced" }) {
  const getState = batch === "priced" ? getPricedPostSyncState : getUsernamePostSyncState;
  const advance = batch === "priced" ? advancePricedPostSync : advanceUsernamePostSync;
  const retry = batch === "priced" ? retryPricedPostSync : retryUsernamePostSync;
  const attach = batch === "priced" ? attachPricedPostSyncRun : attachUsernamePostSyncRun;
  const [state, setState] = useState<UsernamePostSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback((action: () => Promise<UsernamePostSyncState>) => {
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
    let action: (() => Promise<UsernamePostSyncState>) | undefined;
    let delay = 0;
    if (!state) action = getState;
    else if (active && !blocked) { action = () => advance(false); delay = 4000; }
    else if (autoRun && pending && !blocked && state.configured) action = () => advance(true);
    if (!action) return;
    const timer = setTimeout(() => run(action!), delay);
    return () => clearTimeout(timer);
  }, [state, busy, error, active, blocked, autoRun, pending, run, getState, advance]);

  if (!state) return <div className="mt-8 text-sm text-muted">{error ?? "Loading author profiles…"}{error && <button onClick={() => run(getState)} className="ml-3 text-accent">Retry loading</button>}</div>;
  const done = jobs.filter((job) => complete.has(job.status)).length;
  const fetched = jobs.reduce((sum, job) => sum + job.fetchedPosts, 0);
  const saved = jobs.reduce((sum, job) => sum + job.paidPosts, 0);
  const profiles = jobs.filter((job) => job.status === "paid").length;
  const canStart = state.configured && pending && !blocked && !active && !busy;
  const autoActive = autoRun && (active || pending) && !blocked;

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Accounts checked · followers high to low</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{done}<span className="text-lg text-muted"> / {jobs.length}</span></p>
            <p aria-live="polite" className="mt-1 text-sm text-muted">{fetched.toLocaleString()} matching posts fetched · {saved.toLocaleString()} paid posts saved · {profiles.toLocaleString()} profiles updated</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!canStart} onClick={() => run(() => advance(true))} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50">Run next account</button>
            <button disabled={!autoActive && !canStart && !active} onClick={() => setAutoRun(!autoActive)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{autoActive ? "Pause after current" : "Run all remaining"}</button>
            <button disabled={busy} onClick={() => run(getState)} className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-50">Refresh status</button>
          </div>
        </div>
        <progress aria-label="Accounts checked" value={done} max={jobs.length || 1} className="mt-4 h-2 w-full accent-[var(--accent)]" />
        <p className="mt-3 text-xs text-muted">Up to 1,000 tweets per account · $0.00015 per returned tweet, including unpaid tweets, before other Apify charges.</p>
        <p className="mt-1 text-xs text-muted">Keep this page open to continue. Progress and the initial follower order are saved on this server; accounts with unknown follower counts go last.</p>
        <p className="mt-1 text-xs text-muted">Search: from:username since:2026-10-01</p>
        {!state.configured && <p role="alert" className="mt-3 text-sm text-red-400">Apify or database configuration is missing on the server.</p>}
        {blocked && <p role="alert" className="mt-3 text-sm text-amber-400">Sync paused. Resolve the failed account or attach its interrupted run below.</p>}
        {jobs.length > 0 && done === jobs.length && <p role="status" className="mt-3 text-sm text-emerald-400">Sync complete. All accounts in this batch have been checked.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        {!jobs.length && <p className="mt-3 text-sm text-muted">No eligible author profiles found.</p>}
      </section>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs text-muted"><tr><th className="p-3">#</th><th className="p-3">Creator</th><th className="p-3">Followers at start</th><th className="p-3">Result</th><th className="p-3">Posts fetched / paid</th><th className="p-3">Apify run</th></tr></thead>
          <tbody>{jobs.map((job, index) => (
            <tr key={job.id} className="border-t border-border align-top">
              <td className="p-3 text-muted">{index + 1}</td>
              <td className="p-3"><a href={`https://x.com/${job.username}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@{job.username}</a>{job.name && <p className="mt-1 text-xs text-muted">{job.name}</p>}</td>
              <td className="p-3 tabular-nums">{job.followers?.toLocaleString() ?? "Unknown"}</td>
              <td className="max-w-sm p-3">
                <span className={job.status === "paid" ? "text-emerald-400" : ["failed", "start_unknown"].includes(job.status) ? "text-red-400" : job.status === "running" ? "text-accent" : "text-muted"}>{labels[job.status]}</span>
                {job.error && <p className="mt-1 break-words text-xs text-muted">{job.error}</p>}
                {job.status === "failed" && <button disabled={busy || active} onClick={() => run(async () => { await retry(job.id); return advance(true); })} className="mt-2 text-xs text-accent hover:underline disabled:opacity-50">Retry {job.runId ? "run / import" : "fetch"}</button>}
                {job.status === "start_unknown" && <RecoverRun disabled={busy} onAttach={(runId) => run(() => attach(job.id, runId))} />}
              </td>
              <td className="p-3 tabular-nums">{job.fetchedPosts} / <span className="text-emerald-400">{job.paidPosts}</span></td>
              <td className="p-3">{job.runId ? <a href={`https://console.apify.com/actors/runs/${job.runId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">View run ↗</a> : <span className="text-muted">—</span>}</td>
            </tr>
          ))}</tbody>
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
