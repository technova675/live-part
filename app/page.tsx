import Link from "next/link";
import { getAuthors } from "@/lib/authors";
import { getCreatorPricingDirectory } from "@/lib/creator-pricing";
import { getMessagedCreatorUsernames } from "@/lib/creator-outreach";
import { AuthorGrid } from "./author-grid";
import { RefreshData } from "./refresh-data";

export default async function Home() {
  const [authors, pricing, messagedUsernames] = await Promise.all([getAuthors(), getCreatorPricingDirectory(), getMessagedCreatorUsernames()]);

  return (
    <main className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paid Partnership Creators</h1>
          <p className="mt-1 text-sm text-muted">
            All tracked X creators · post counts include confirmed paid promotions only
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <RefreshData />
          {process.env.NODE_ENV === "development" && <Link href="/dm-outreach" className="hover:text-accent">DM outreach →</Link>}
          <Link href="/priced-post-sync" className="hover:text-accent">Priced creators sync →</Link>
          <Link href="/username-post-sync" className="hover:text-accent">Creator posts sync →</Link>
          <Link href="/tweet-sync" className="hover:text-accent">Paid tweet sync →</Link>
          <Link href="/sync" className="hover:text-accent">Profile sync →</Link>
        </div>
      </header>
      <AuthorGrid authors={authors} pricing={pricing} messagedUsernames={messagedUsernames} />
    </main>
  );
}
