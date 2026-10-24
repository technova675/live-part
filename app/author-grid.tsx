"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Author } from "@/lib/authors";
import type { CreatorPricing, CreatorPricingRow } from "@/lib/creator-pricing";
import { pricingRates } from "@/lib/pricing-display";
import { PRICE_RANGES, isWholeDollarInput, matchesPricingAmount } from "@/lib/pricing-filter";
import { VerifiedBadge } from "./verified-badge";

const BATCH = 60;
const SORT_OPTIONS = {
  "followers-desc": "Followers: high to low",
  "followers-asc": "Followers: low to high",
  "posts-desc": "Posts: high to low",
  "posts-asc": "Posts: low to high",
} as const;
type SortOrder = keyof typeof SORT_OPTIONS;
type PricingFilter = "all" | "available" | "unavailable";
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const joined = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });

export function AuthorGrid({ authors, pricing }: { authors: Author[]; pricing: CreatorPricingRow[] }) {
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("followers-desc");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");
  const [priceRange, setPriceRange] = useState("all");
  const [exactPrice, setExactPrice] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [limit, setLimit] = useState(BATCH);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const priced = useMemo(() => new Map(pricing.map((row) => [row.username.toLowerCase(), row])), [pricing]);
  const pricingCount = useMemo(() => authors.filter((author) => priced.has(author.username.toLowerCase())).length, [authors, priced]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase().replace(/^@/, "");
    const range = PRICE_RANGES.find((range) => range.value === priceRange);
    const matches = authors.filter(
      (a) =>
        (!verifiedOnly || a.verified) &&
        (pricingFilter === "all" || priced.has(a.username.toLowerCase()) === (pricingFilter === "available")) &&
        (!range || matchesPricingAmount(priced.get(a.username.toLowerCase()), range.min, range.max)) &&
        (exactPrice === "" || matchesPricingAmount(priced.get(a.username.toLowerCase()), Number(exactPrice))) &&
        (!q || a.username.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q)),
    );
    const ascending = sortOrder.endsWith("asc");
    const byPosts = sortOrder.startsWith("posts");
    return matches.sort((a, b) => {
      const aValue = byPosts ? a.paidPosts : a.followers;
      const bValue = byPosts ? b.paidPosts : b.followers;
      // Unknown follower counts stay last in both directions.
      if (aValue == null && bValue != null) return 1;
      if (bValue == null && aValue != null) return -1;
      const difference = (aValue ?? 0) - (bValue ?? 0);
      return (ascending ? difference : -difference) || a.id.localeCompare(b.id);
    });
  }, [authors, deferredQuery, verifiedOnly, sortOrder, pricingFilter, priced, priceRange, exactPrice]);

  const visible = filtered.slice(0, limit);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || limit >= filtered.length) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        setLimit((current) => Math.min(current + BATCH, filtered.length));
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered, limit]);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-col gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(BATCH);
          }}
          placeholder="Search name or @handle"
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent sm:max-w-sm"
        />
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => {
              setVerifiedOnly(e.target.checked);
              setLimit(BATCH);
            }}
            className="size-4 accent-[var(--accent)]"
          />
          Verified only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0">Sort by</span>
          <select
            aria-label="Sort creators"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value as SortOrder);
              setLimit(BATCH);
            }}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent sm:flex-none"
          >
            {Object.entries(SORT_OPTIONS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0">Pricing</span>
          <select
            aria-label="Filter creators by pricing"
            value={pricingFilter}
            onChange={(event) => {
              setPricingFilter(event.target.value as PricingFilter);
              setLimit(BATCH);
            }}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent sm:flex-none"
          >
            <option value="all">All creators</option>
            <option value="available">Pricing available ({pricingCount.toLocaleString()})</option>
            <option value="unavailable">Pricing unavailable ({(authors.length - pricingCount).toLocaleString()})</option>
          </select>
        </label>
        <p className="text-sm text-muted sm:ml-auto">
          {filtered.length.toLocaleString()} of {authors.length.toLocaleString()} creators
          <span className="block text-xs">{pricingCount.toLocaleString()} with pricing</span>
        </p>
        <div className="flex w-full flex-wrap items-start gap-x-5 gap-y-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm">
            <span>Price range</span>
            <select
              aria-label="Filter by price range"
              value={priceRange}
              onChange={(event) => {
                setPriceRange(event.target.value);
                setExactPrice("");
                setPriceError(null);
                setLimit(BATCH);
              }}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
            >
              <option value="all">All prices</option>
              {PRICE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            </select>
          </label>
          <div>
            <label className="flex items-center gap-2 text-sm">
              <span>Exact price ($)</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Exact price in whole dollars"
                aria-invalid={priceError != null}
                aria-describedby={priceError ? "price-input-error" : undefined}
                value={exactPrice}
                placeholder="e.g. 10"
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isWholeDollarInput(value)) {
                    setPriceError("Enter whole dollars only, such as 10. No decimals or symbols.");
                    return;
                  }
                  setExactPrice(value);
                  setPriceRange("all");
                  setPriceError(null);
                  setLimit(BATCH);
                }}
                onPaste={(event) => {
                  if (!/^[0-9]+$/.test(event.clipboardData.getData("text"))) {
                    event.preventDefault();
                    setPriceError("Enter whole dollars only, such as 10. No decimals or symbols.");
                  }
                }}
                className="h-10 w-32 rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            {priceError && <p id="price-input-error" role="alert" className="mt-1 text-xs text-red-400">{priceError}</p>}
          </div>
          {(priceRange !== "all" || exactPrice !== "") && (
            <button onClick={() => { setPriceRange("all"); setExactPrice(""); setPriceError(null); setLimit(BATCH); }} className="h-10 text-sm text-accent hover:underline">Clear price filter</button>
          )}
          <p className="w-full text-xs text-muted">Matches any retweet, comment, quote, or bundle price. Bundle ranges match overlapping amounts.</p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-20 text-center text-muted">No creators match your filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((a, index) => (
            <AuthorCard key={a.id} author={a} rank={index + 1} pricing={priced.get(a.username.toLowerCase()) ?? null} />
          ))}
        </ul>
      )}

      {visible.length > 0 && (
        <div ref={loadMoreRef} role="status" className="mt-8 py-4 text-center text-sm text-muted">
          {limit < filtered.length ? "Loading more creators…" : "End of list"}
        </div>
      )}
    </>
  );
}

function AuthorCard({ author, rank, pricing }: { author: Author; rank: number; pricing: CreatorPricing | null }) {
  const display = author.name || author.username;
  const p = author.profile;
  const rates = pricingRates(pricing);
  const meta = [
    p?.following != null && `${compact.format(p.following)} following`,
    p?.tweets != null && `${compact.format(p.tweets)} posts`,
    p?.joinedAt && `joined ${joined.format(new Date(p.joinedAt))}`,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        {p?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote X avatars, no optimizer needed
          <img
            src={p.avatarUrl}
            alt=""
            loading="lazy"
            className="size-11 shrink-0 rounded-full bg-border object-cover"
          />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
            {display.slice(0, 2).toUpperCase()}
          </div>
        )}
        <a
          href={`https://x.com/${author.username}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open @${author.username} on X`}
          className="group min-w-0 flex-1"
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold group-hover:text-accent group-hover:underline">{display}</span>
            {author.verified && <VerifiedBadge />}
          </span>
          <span className="block truncate text-sm text-muted group-hover:text-accent group-hover:underline">
            @{author.username}
          </span>
        </a>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-mono text-xs text-muted">#{rank}</span>

            <Link
              href={`/creator/${author.username}`}
              className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent hover:text-white"
            >
              {author.paidPosts} {author.paidPosts === 1 ? "post" : "posts"}
            </Link>
        </div>
      </div>

      {rates.length > 0 && (
        <Link
          href={`/creator/${author.username}#creator-pricing-heading`}
          className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
        >
          Pricing available
        </Link>
      )}

      {p?.bio && <p className="line-clamp-4 text-sm">{p.bio}</p>}

      {(p?.category || p?.location || p?.website) && (
        <div className="flex flex-col gap-0.5 text-xs text-muted">
          {p.category && <p className="truncate">{p.category}</p>}
          {p.location && <p className="truncate">📍 {p.location}</p>}
          {p.website && (
            <a
              href={p.website}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-accent hover:underline"
            >
              🔗 {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      )}

      {meta.length > 0 && <p className="text-xs text-muted">{meta.join(" · ")}</p>}

      {rates.length > 0 && (
        <dl aria-label="Partnership rates" className="grid grid-cols-2 gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          {rates.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 break-words text-base font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <Stat label="Followers" value={author.followers == null ? "—" : compact.format(author.followers)} />
        <Stat label="Paid posts" value={author.paidPosts.toLocaleString()} />
        <Stat label="Median views" value={author.medianViews == null ? "—" : compact.format(author.medianViews)} />
      </dl>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}



