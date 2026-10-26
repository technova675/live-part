import Link from "next/link";
import { UsernamePostSyncPanel } from "../username-post-sync/sync-panel";

export default function PricedPostSyncPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Priced creators · zero-post sync</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Sync the saved batch of 251 creators who had available pricing and zero confirmed paid posts,
        one account at a time, starting with the most followers. Fetch tweets since October 1, 2026,
        excluding replies and retweets. Save only explicitly marked paid partnerships and update
        existing posts and author profiles without duplicates.
      </p>
      <p className="mt-2 text-sm text-muted">This batch has its own saved progress. The main creator-post sync is separate.</p>
      <UsernamePostSyncPanel batch="priced" />
    </main>
  );
}
