import Link from "next/link";
import { TweetSyncPanel } from "./sync-panel";

export default function TweetSyncPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-accent">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Paid tweet sync</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Check the 182 combined tweet IDs one at a time with xquik/x-tweet-scraper.
        Only confirmed paid promotions are saved, together with their author profiles.
      </p>
      <TweetSyncPanel />
    </main>
  );
}
