import type { ReactNode } from "react";
import type { Author, PaidPost } from "@/lib/authors";
import { VerifiedBadge } from "../../verified-badge";
import { LocalTime } from "./local-time";
import { PostMedia } from "./post-media";
import { QuotePost } from "./quote-post";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// Turns URLs, @mentions, #hashtags and $cashtags into links, like X does.
const TOKEN = /(https?:\/\/[^\s]+)|(@\w{1,15})|(#\w+)|(\$[A-Za-z][A-Za-z0-9_]{0,9})/g;

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const [token, url, mention, hashtag] = m;
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = url
      ? url
      : mention
        ? `https://x.com/${mention.slice(1)}`
        : hashtag
          ? `https://x.com/hashtag/${hashtag.slice(1)}`
          : `https://x.com/search?q=${encodeURIComponent(token)}`;
    out.push(
      <a
        key={m.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 text-accent hover:underline"
      >
        {url ? url.replace(/^https?:\/\/(www\.)?/, "") : token}
      </a>,
    );
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Avatar({ author, className }: { author: Author; className: string }) {
  const display = author.name || author.username;
  return author.profile?.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote X avatars, no optimizer needed
    <img src={author.profile.avatarUrl} alt="" className={`${className} shrink-0 rounded-full bg-border object-cover`} />
  ) : (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent`}
    >
      {display.slice(0, 2).toUpperCase()}
    </div>
  );
}

// Laid out like X's post detail view.
export function Post({ author, post }: { author: Author; post: PaidPost }) {
  const display = author.name || author.username;

  return (
    <article className="border-b border-border px-4 pt-3">
      <div className="flex items-center gap-2">
        <a href={`https://x.com/${author.username}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <Avatar author={author} className="size-10 text-sm" />
        </a>
        <a
          href={`https://x.com/${author.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group min-w-0 flex-1 leading-5"
        >
          <span className="flex items-center gap-1">
            <span className="truncate text-[15px] font-bold group-hover:underline">{display}</span>
            {author.verified && <VerifiedBadge className="size-[18px]" />}
          </span>
          <span className="block truncate text-[15px] text-muted">@{author.username}</span>
        </a>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on X"
          className="-mr-2 rounded-full p-2 text-muted hover:bg-accent/10 hover:text-accent"
        >
          <ExternalIcon />
        </a>
      </div>

      {post.text && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[17px] leading-6">{linkify(post.text)}</p>
      )}

      <PostMedia post={post} />
      {post.quote && <QuotePost quote={post.quote} />}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span className="flex items-center gap-1">
          <PaidIcon />
          Paid partnership
        </span>
        {post.brand && (
          <span className="rounded-full border border-border px-2 py-0.5 text-foreground">{post.brand}</span>
        )}
      </div>

      <p className="mt-3 text-[15px] text-muted">
        {post.postedAt && (
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            <LocalTime iso={post.postedAt} />
          </a>
        )}
        {post.postedAt && post.views != null && " · "}
        {post.views != null && (
          <>
            <span className="font-bold text-foreground">{compact.format(post.views)}</span> Views
          </>
        )}
      </p>

      <div className="mt-3 flex items-center justify-between border-y border-border px-1 py-2.5 text-[13px] text-muted">
        <Metric icon={<QuoteIcon />} value={post.quotes} label="Quotes" hover="group-hover:text-accent group-hover:bg-accent/10" href={`${post.url}/quotes`} />
        <Metric icon={<RepostIcon />} value={post.reposts} label="Reposts" hover="group-hover:text-emerald-500 group-hover:bg-emerald-500/10" href={`${post.url}/retweets`} />
        <Metric icon={<LikeIcon />} value={post.likes} label="Likes" hover="group-hover:text-pink-500 group-hover:bg-pink-500/10" href={`${post.url}/likes`} />
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on X"
          className="-m-2 rounded-full p-2 hover:bg-accent/10 hover:text-accent"
        >
          <ShareIcon />
        </a>
      </div>

      <div className="flex justify-end py-3 text-[15px] text-muted">
        <a href={`${post.url}/quotes`} target="_blank" rel="noopener noreferrer" className="hover:underline">
          View quotes ›
        </a>
      </div>
    </article>
  );
}

function Metric({
  icon,
  value,
  label,
  hover,
  href,
}: {
  icon: ReactNode;
  value: number | null;
  label: string;
  hover: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-1"
      title={value == null ? `${label} unavailable` : `${value.toLocaleString()} ${label.toLowerCase()}`}
    >
      <span className={`-m-2 rounded-full p-2 ${hover}`}>{icon}</span>
      <span className={`tabular-nums ${hover.split(" ")[0]}`}>{value == null ? "" : compact.format(value)}</span>
    </a>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "size-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function QuoteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </svg>
  );
}

function RepostIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 4 4 7l3 3" />
      <path d="M4 7h11a3 3 0 0 1 3 3v2" />
      <path d="m17 20 3-3-3-3" />
      <path d="M20 17H9a3 3 0 0 1-3-3v-2" />
    </svg>
  );
}

function LikeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7.3 4.5 4.5 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg {...iconProps} className="size-5">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...iconProps} className="size-5">
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

// Arrow-in-a-box, like the icon X shows next to "Paid partnership".
function PaidIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.5 4.5v2h4.59L7.3 15.29l1.41 1.42 5.79-5.8v4.59h2v-8z" />
    </svg>
  );
}


