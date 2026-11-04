// Server-only: starts the September 2026 post search for one creator.
// The query is fixed here on purpose so this batch never depends on the shared October helper.
import usernameInput from "./username-post-sync-input.json";
import type { ApifyRun } from "./apify";

export const SEPT_SINCE = "2026-09-01";
export const SEPT_UNTIL = "2026-10-01";

export function septSearchTerm(handle: string) {
  return `from:${handle} since:${SEPT_SINCE} until:${SEPT_UNTIL}`;
}

export async function startSeptPostScrape(username: string): Promise<ApifyRun> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN env var");
  const handle = username.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle) || ["evrendag1284", "omukare_wanwan"].includes(handle)) {
    throw new Error("Invalid or excluded username");
  }
  const response = await fetch("https://api.apify.com/v2/acts/xquik~x-tweet-scraper/runs", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...usernameInput, searchTerms: [septSearchTerm(handle)] }),
  });
  if (!response.ok) throw Object.assign(new Error(`Apify error ${response.status}: ${await response.text()}`), { status: response.status });
  return (await response.json()).data;
}
