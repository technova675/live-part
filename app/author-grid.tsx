"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Author } from "@/lib/authors";
import type { CreatorPricing, CreatorPricingRow } from "@/lib/creator-pricing";
import { pricingRates } from "@/lib/pricing-display";
import { MAX_PRICE_STEP, PRICE_BANDS, isWholeDollarInput, matchesPricingAmount, priceStepBounds } from "@/lib/pricing-filter";
import { PriceRangeFilter } from "./price-range-filter";
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
type ContactFilter = "all" | "messaged" | "not_contacted";
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const joined = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const sourcesFor = (source: string | null | undefined) => source?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];

export function AuthorGrid({ authors, pricing, messagedUsernames }: { authors: Author[]; pricing: CreatorPricingRow[]; messagedUsernames: string[] }) {
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dmOpenOnly, setDmOpenOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("followers-desc");
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [priceLow, setPriceLow] = useState(0);
  const [priceHigh, setPriceHigh] = useState(MAX_PRICE_STEP);
  const [exactPrice, setExactPrice] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [limit, setLimit] = useState(BATCH);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const priced = useMemo(() => new Map(pricing.map((row) => [row.username.toLowerCase(), row])), [pricing]);
  const pricingCount = useMemo(() => authors.filter((author) => priced.has(author.username.toLowerCase())).length, [authors, priced]);
  const messaged = useMemo(() => new Set(messagedUsernames.map(username => username.toLowerCase())), [messagedUsernames]);
  const messagedCount = useMemo(() => authors.filter(author => messaged.has(author.username.toLowerCase())).length, [authors, messaged]);
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const author of authors) {
      for (const source of sourcesFor(author.profile?.source)) {
        counts.set(source, (counts.get(source) ?? 0) + 1);
      }
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [authors]);
  const priceBandCounts = useMemo(() => PRICE_BANDS.map((band) => pricing.filter((row) => matchesPricingAmount(row, band.min, band.max)).length), [pricing]);
  const priceRangeActive = priceLow > 0 || priceHigh < MAX_PRICE_STEP;
  const sourcedCount = useMemo(() => authors.filter((author) => sourcesFor(author.profile?.source).length > 0).length, [authors]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase().replace(/^@/, "");
    const range = priceRangeActive ? priceStepBounds(priceLow, priceHigh) : null;
    const matches = authors.filter(
      (a) =>
        (!verifiedOnly || a.verified) &&
        (!dmOpenOnly || a.profile?.canDm === true) &&
        (contactFilter === "all" || messaged.has(a.username.toLowerCase()) === (contactFilter === "messaged")) &&
        (sourceFilter === "all" || (sourceFilter === "none" ? sourcesFor(a.profile?.source).length === 0 : sourcesFor(a.profile?.source).includes(sourceFilter))) &&
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
  }, [authors, deferredQuery, verifiedOnly, dmOpenOnly, sortOrder, pricingFilter, priced, priceRangeActive, priceLow, priceHigh, exactPrice, contactFilter, messaged, sourceFilter]);

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

  const filtersActive = verifiedOnly || dmOpenOnly || pricingFilter !== "all" || contactFilter !== "all" || sourceFilter !== "all" || priceRangeActive || exactPrice !== "";
  const clearPrice = () => { setPriceLow(0); setPriceHigh(MAX_PRICE_STEP); setExactPrice(""); setPriceError(null); setLimit(BATCH); };
  const clearFilters = () => {
    setVerifiedOnly(false);
    setDmOpenOnly(false);
    setPricingFilter("all");
    setContactFilter("all");
    setSourceFilter("all");
    clearPrice();
  };
  const selectClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent";
  const sectionClass = "border-t border-border px-5 py-4";
  const headingClass = "mb-3 text-xs font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside aria-label="Filters" className="w-full shrink-0 rounded-xl border border-border bg-surface lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-72 lg:overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-bold">Filters</h2>
          {filtersActive && <button onClick={clearFilters} className="text-sm text-accent hover:underline">Clear all</button>}
        </div>
        <div className={sectionClass}>
          <p className={headingClass}>Show</p>
          <div className="flex flex-col gap-2.5">
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
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dmOpenOnly}
                onChange={(event) => {
                  setDmOpenOnly(event.target.checked);
                  setLimit(BATCH);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              DM open only
            </label>
          </div>
        </div>
        <label className={`block ${sectionClass}`}>
          <span className={`block ${headingClass}`}>Pricing</span>
          <select
            aria-label="Filter creators by pricing"
            value={pricingFilter}
            onChange={(event) => {
              setPricingFilter(event.target.value as PricingFilter);
              setLimit(BATCH);
            }}
            className={selectClass}
          >
            <option value="all">All creators</option>
            <option value="available">Pricing available ({pricingCount.toLocaleString()})</option>
            <option value="unavailable">Pricing unavailable ({(authors.length - pricingCount).toLocaleString()})</option>
          </select>
        </label>
        <label className={`block ${sectionClass}`}>
          <span className={`block ${headingClass}`}>Contact status</span>
          <select
            aria-label="Filter creators by contact status"
            value={contactFilter}
            onChange={(event) => {
              setContactFilter(event.target.value as ContactFilter);
              setLimit(BATCH);
            }}
            className={selectClass}
          >
            <option value="all">All contact statuses</option>
            <option value="messaged">Already messaged ({messagedCount.toLocaleString()})</option>
            <option value="not_contacted">Not contacted ({(authors.length - messagedCount).toLocaleString()})</option>
          </select>
        </label>
        <label className={`block ${sectionClass}`}>
          <span className={`block ${headingClass}`}>Source</span>
          <select
            aria-label="Filter creators by source"
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value);
              setLimit(BATCH);
            }}
            className={selectClass}
          >
            <option value="all">All sources</option>
            {sourceCounts.map(([source, count]) => <option key={source} value={source}>{source} ({count.toLocaleString()})</option>)}
            <option value="none">No source ({(authors.length - sourcedCount).toLocaleString()})</option>
          </select>
        </label>
        <div className={sectionClass}>
          <PriceRangeFilter
            low={priceLow}
            high={priceHigh}
            counts={priceBandCounts}
            onChange={(low, high) => {
              setPriceLow(low);
              setPriceHigh(high);
              setExactPrice("");
              setPriceError(null);
              setLimit(BATCH);
            }}
          />
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block">Exact price ($)</span>
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
                setPriceLow(0);
                setPriceHigh(MAX_PRICE_STEP);
                setPriceError(null);
                setLimit(BATCH);
              }}
              onPaste={(event) => {
                if (!/^[0-9]+$/.test(event.clipboardData.getData("text"))) {
                  event.preventDefault();
                  setPriceError("Enter whole dollars only, such as 10. No decimals or symbols.");
                }
              }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          {priceError && <p id="price-input-error" role="alert" className="mt-1 text-xs text-red-400">{priceError}</p>}
          {(priceRangeActive || exactPrice !== "") && (
            <button onClick={clearPrice} className="mt-3 text-sm text-accent hover:underline">Clear price filter</button>
          )}
          <p className="mt-3 text-xs text-muted">Matches any listed price. Quoted price ranges match overlapping amounts.</p>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 mb-6 flex flex-col gap-3 border-b border-border bg-background/90 py-4 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
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
          <p className="text-sm text-muted sm:ml-auto sm:text-right">
            {filtered.length.toLocaleString()} of {authors.length.toLocaleString()} creators
            <span className="block text-xs">{pricingCount.toLocaleString()} with pricing · {messagedCount.toLocaleString()} messaged · {(authors.length - messagedCount).toLocaleString()} not contacted</span>
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="py-20 text-center text-muted">No creators match your filters.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4">
            {visible.map((a, index) => (
              <AuthorCard key={a.id} author={a} rank={index + 1} pricing={priced.get(a.username.toLowerCase()) ?? null} messaged={messaged.has(a.username.toLowerCase())} />
            ))}
          </ul>
        )}

        {visible.length > 0 && (
          <div ref={loadMoreRef} role="status" className="mt-8 py-4 text-center text-sm text-muted">
            {limit < filtered.length ? "Loading more creators…" : "End of list"}
          </div>
        )}
      </section>
    </div>
  );
}

function AuthorCard({ author, rank, pricing, messaged }: { author: Author; rank: number; pricing: CreatorPricing | null; messaged: boolean }) {
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

      {(messaged || rates.length > 0 || p?.canDm === true || p?.source) && <div className="flex flex-wrap items-center gap-2">
      {sourcesFor(p?.source).map((source) => (
        <span key={source} className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-xs font-medium text-violet-300">
          Source: {source}
        </span>
      ))}
      {p?.canDm === true && (
        <span title="Direct messages are open" className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
          DM open
        </span>
      )}
      {messaged && (
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-300">
          Messaged
        </span>
      )}
      {rates.length > 0 && (
        <Link
          href={`/creator/${author.username}#creator-pricing-heading`}
          className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
        >
          Pricing available
        </Link>
      )}
      </div>}

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
            <div key={label} className={label.length > 32 ? "col-span-2" : undefined}>
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



