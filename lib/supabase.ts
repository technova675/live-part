// Server-only: uses the Supabase service role key. Never import from a client component.

export async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    // Keep the request lifetime inside its caller's cache scope. An explicit
    // signal opts out of React's fetch deduplication; use cache dedupes the
    // completed data functions instead of sharing pending Response bodies.
    signal: init.signal ?? AbortSignal.timeout(60_000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res;
}

// Exact row count of a table via the Content-Range header ("0-0/1509").
export async function countRows(table: string): Promise<number> {
  const res = await supabase(`${table}?select=*`, {
    method: "HEAD",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
}
