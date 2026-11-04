import Link from "next/link";
import { UsernamePostSyncPanel } from "../username-post-sync/sync-panel";

export default function SeptPostSyncPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Priced creators · September paid posts</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Sync the saved batch of 336 creators who have available pricing and two or fewer confirmed
        paid posts, one account at a time, starting with the most followers. Fetch posts from
        September 1 up to (not including) October 1, 2026, excluding replies and retweets. Save only
        explicitly marked paid partnerships and update existing posts and author profiles without duplicates.
      </p>
      <p className="mt-2 text-sm text-muted">This batch has its own saved progress. The other syncs are separate.</p>
      <UsernamePostSyncPanel batch="sept" />
    </main>
  );
}
