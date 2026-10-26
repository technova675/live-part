import Link from "next/link";
import { UsernamePostSyncPanel } from "./sync-panel";

export default function UsernamePostSyncPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">← Dashboard</Link>
      <Link href="/priced-post-sync" className="ml-6 text-sm text-accent hover:underline">251 priced creators sync →</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Creator posts sync</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Fetch posts since October 1, 2026 for each author profile, one account at a time,
        starting with the most followers. Replies and retweets are excluded.
        Save only confirmed paid promotions and update their author profiles.
      </p>
      <p className="mt-2 text-sm text-muted">Already completed manually: @evrendag1284 and @omukare_wanwan are excluded.</p>
      <UsernamePostSyncPanel />
    </main>
  );
}
