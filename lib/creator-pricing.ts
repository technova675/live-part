import { cacheLife, cacheTag } from "next/cache";
import { supabase } from "./supabase";
import { twitterPricingRanges, hasAvailablePricing, type PricingRange } from "./pricing-ranges";

export type CreatorPricing = {
  retweet_rate: number | null;
  comment_rate: number | null;
  quote_rate: number | null;
  bundle_rate_min: number | null;
  bundle_rate_max: number | null;
  currency: string | null;
  bundle_currency: string | null;
  rate_ranges?: PricingRange[];
};

export type CreatorPricingRow = CreatorPricing & { username: string };

function normalizePricing<T extends CreatorPricing>(row: T & { source_rows?: unknown }) {
  const { source_rows, ...pricing } = row;
  return { ...pricing, rate_ranges: twitterPricingRanges(source_rows) };
}

export async function getCreatorPricingDirectory(): Promise<CreatorPricingRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("creator-pricing");

  // A sheet row with only blank rates does not count as available pricing.
  // Explicit zero (Free) rates do count.
  const fields = ["retweet_rate", "comment_rate", "quote_rate", "bundle_rate_min", "bundle_rate_max"];
  // Range-only quotes live in structured source data, so normalize all rows
  // before deciding availability. Raw source messages never reach the client.
  const path = `creator_pricing?select=username,${fields.join(",")},currency,bundle_currency,source_rows&order=username.asc`;
  const pricing: CreatorPricingRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await supabase(`${path}&offset=${offset}&limit=1000`);
    const rows: (CreatorPricingRow & { source_rows?: unknown })[] = await response.json();
    pricing.push(...rows.map((row) => ({ ...normalizePricing(row), username: row.username.toLowerCase() })).filter(hasAvailablePricing));
    if (rows.length < 1000) break;
  }
  return pricing;
}

export async function getCreatorPricing(username: string): Promise<CreatorPricing | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("creator-pricing");

  const handle = username.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
  const response = await supabase(
    `creator_pricing?select=retweet_rate,comment_rate,quote_rate,bundle_rate_min,bundle_rate_max,currency,bundle_currency,source_rows&username=eq.${encodeURIComponent(handle)}&limit=1`,
  );
  const rows: (CreatorPricing & { source_rows?: unknown })[] = await response.json();
  return rows[0] ? normalizePricing(rows[0]) : null;
}
