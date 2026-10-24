import type { QuotedPost } from "@/lib/post-media";
import { VerifiedBadge } from "../../verified-badge";
import { PostMedia } from "./post-media";

import { LocalTime } from "./local-time";

export function QuotePost({ quote }: { quote: QuotedPost }) {
  return (
    <section aria-label={`Quoted post${quote.username ? ` by @${quote.username}` : ""}`} className="mt-3 overflow-hidden rounded-2xl border border-border">
      <div className="px-3 pt-3">
        <a href={quote.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-[13px] leading-5 hover:underline">
          {quote.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- original quoted-author avatar
            <img src={quote.avatarUrl} alt="" loading="lazy" className="mr-1 size-5 shrink-0 rounded-full object-cover" />
          ) : <span className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">{quote.name.slice(0, 1).toUpperCase()}</span>}
          <span className="truncate font-bold">{quote.name}</span>
          {quote.verified && <VerifiedBadge className="size-3.5" />}
          {quote.username && <span className="truncate text-muted">@{quote.username}</span>}
          {quote.postedAt && <span className="shrink-0 text-muted">· <LocalTime iso={quote.postedAt} dateOnly /></span>}
        </a>
        <a href={quote.url} target="_blank" rel="noopener noreferrer" className="mt-1 mb-3 block whitespace-pre-wrap break-words text-[14px] leading-5">
          <span className="line-clamp-5">{quote.text || "View quoted post on X ↗"}</span>
        </a>
      </div>
      <PostMedia post={quote} embedded />
    </section>
  );
}

