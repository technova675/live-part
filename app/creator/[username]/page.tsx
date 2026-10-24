import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAuthor, getPaidPosts, type Author } from "@/lib/authors";
import { getCreatorPricing } from "@/lib/creator-pricing";
import { VerifiedBadge } from "../../verified-badge";
import { Avatar, Post } from "./post";
import { Pricing } from "./pricing";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const joined = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: PageProps<"/creator/[username]">): Promise<Metadata> {
  const { username } = await params;
  const author = await getAuthor(username);
  return { title: author ? `${author.name || author.username} (@${author.username}) · Paid partnerships` : "Creator not found" };
}

export default function CreatorPage({ params }: PageProps<"/creator/[username]">) {
  return (
    <main className="mx-auto min-h-full w-full max-w-[600px] border-x border-border">
      <Suspense fallback={<ProfileSkeleton />}>
        {params.then(({ username }) => (
          <Creator username={username} />
        ))}
      </Suspense>
    </main>
  );
}

async function Creator({ username }: { username: string }) {
  const author = await getAuthor(decodeURIComponent(username));
  if (!author) notFound();
  const [posts, pricing] = await Promise.all([
    getPaidPosts(author.username),
    getCreatorPricing(author.username),
  ]);

  return (
    <>
      <TopBar title={author.name || author.username} subtitle={`${posts.length} paid ${posts.length === 1 ? "post" : "posts"}`} />
      <ProfileHeader author={author} />
      <Pricing pricing={pricing} />

      <nav className="flex border-b border-border">
        <span className="relative flex-1 py-4 text-center text-[15px] font-bold">
          Paid partnerships
          <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-28 rounded-full bg-accent" />
        </span>
      </nav>

      {posts.length === 0 ? (
        <p className="px-8 py-16 text-center text-muted">No paid partnership posts found for @{author.username}.</p>
      ) : (
        posts.map((post) => <Post key={post.tweetId} author={author} post={post} />)
      )}
    </>
  );
}

function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-[53px] items-center gap-6 bg-background/85 px-4 backdrop-blur">
      <Link href="/" aria-label="Back to dashboard" className="-ml-2 rounded-full p-2 hover:bg-foreground/10">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold leading-6">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}

function ProfileHeader({ author }: { author: Author }) {
  const p = author.profile;
  const display = author.name || author.username;

  return (
    <section className="border-b border-border">
      {p?.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote X banners, no optimizer needed
        <img src={p.bannerUrl} alt="" className="aspect-[3/1] w-full bg-border object-cover" />
      ) : (
        <div className="aspect-[3/1] w-full bg-border" />
      )}

      <div className="px-4 pb-4">
        <div className="flex items-start justify-between">
          <Avatar
            author={author}
            className="-mt-10 size-20 sm:-mt-[67px] sm:size-[134px] border-4 border-background text-3xl"
          />
          <a
            href={`https://x.com/${author.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 rounded-full border border-border px-4 py-1.5 text-[15px] font-bold hover:bg-foreground/10"
          >
            View on X
          </a>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <h2 className="truncate text-xl font-extrabold">{display}</h2>
          {author.verified && <VerifiedBadge className="size-5" />}
        </div>
        <p className="text-[15px] text-muted">@{author.username}</p>

        {p?.bio && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-5">{p.bio}</p>}

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[15px] text-muted">
          {p?.category && <span>{p.category}</span>}
          {p?.location && <span>📍 {p.location}</span>}
          {p?.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              🔗 {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
          {p?.joinedAt && <span>📅 Joined {joined.format(new Date(p.joinedAt))}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
          {p?.following != null && <Count value={p.following} label="Following" />}
          {author.followers != null && <Count value={author.followers} label="Followers" />}
          <Count value={author.paidPosts} label="Paid posts" />
          {author.medianViews != null && <Count value={author.medianViews} label="Median views" />}
        </div>
      </div>
    </section>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-bold">{compact.format(value)}</span> <span className="text-muted">{label}</span>
    </span>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[53px]" />
      <div className="aspect-[3/1] w-full bg-border" />
      <div className="px-4 pb-4">
        <div className="-mt-10 size-20 sm:-mt-[67px] sm:size-[134px] rounded-full border-4 border-background bg-border" />
        <div className="mt-3 h-5 w-40 rounded bg-border" />
        <div className="mt-2 h-4 w-24 rounded bg-border" />
        <div className="mt-4 h-4 w-full rounded bg-border" />
      </div>
    </div>
  );
}

