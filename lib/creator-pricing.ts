import { cacheLife, cacheTag } from "next/cache";
import { supabase } from "./supabase";

export type CreatorPricing = {
  retweet_rate: number | null;
  comment_rate: number | null;
  quote_rate: number | null;
  bundle_rate_min: number | null;
  bundle_rate_max: number | null;
  currency: string | null;
  bundle_currency: string | null;
};

export type CreatorPricingRow = CreatorPricing & { username: string };

export async function getCreatorPricingDirectory(): Promise<CreatorPricingRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("creator-pricing");

  // A sheet row with only blank rates does not count as available pricing.
  // Explicit zero (Free) rates do count.
  const fields = ["retweet_rate", "comment_rate", "quote_rate", "bundle_rate_min", "bundle_rate_max"];
  const path = `creator_pricing?select=username,${fields.join(",")},currency,bundle_currency&or=(${fields.map((field) => `${field}.not.is.null`).join(",")})&order=username.asc`;
  const pricing: CreatorPricingRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await supabase(`${path}&offset=${offset}&limit=1000`);
    const rows: CreatorPricingRow[] = await response.json();
    pricing.push(...rows.map((row) => ({ ...row, username: row.username.toLowerCase() })));
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
    `creator_pricing?select=retweet_rate,comment_rate,quote_rate,bundle_rate_min,bundle_rate_max,currency,bundle_currency&username=eq.${encodeURIComponent(handle)}&limit=1`,
  );
  const rows: CreatorPricing[] = await response.json();
  return rows[0] ?? null;
}
