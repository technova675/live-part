"use client";

import { useTransition } from "react";
import { refreshDashboardData } from "./actions";
import { useState } from "react";

export function RefreshData() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError(false);
          try { await refreshDashboardData(); }
          catch { setError(true); }
        })}
        className="rounded-lg border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh data"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-400">Could not refresh data. Please try again.</p>}
    </div>
  );
}
