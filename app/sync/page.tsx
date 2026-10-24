import Link from "next/link";
import { SyncPanel } from "./sync-panel";

export default function SyncPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-6">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Profile sync</h1>
        <p className="mt-1 text-sm text-muted">
          Fetches full X profiles for paid_authors in batches of 100 via Apify (premium-twitter-user-scraper)
        </p>
      </header>
      <SyncPanel />
    </main>
  );
}
