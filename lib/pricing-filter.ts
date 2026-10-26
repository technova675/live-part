import type { CreatorPricing } from "./creator-pricing";

export const PRICE_RANGES = [
  { value: "0-9", label: "$0 – $9", min: 0, max: 9 },
  { value: "10-50", label: "$10 – $50", min: 10, max: 50 },
  { value: "51-100", label: "$51 – $100", min: 51, max: 100 },
  ...Array.from({ length: 9 }, (_, index) => {
    const min = 101 + index * 100;
    const max = 200 + index * 100;
    return { value: `${min}-${max}`, label: `$${min.toLocaleString("en-US")} – $${max.toLocaleString("en-US")}`, min, max };
  }),
  { value: "1001-2000", label: "$1,001 – $2,000", min: 1001, max: 2000 },
  { value: "2001-5000", label: "$2,001 – $5,000", min: 2001, max: 5000 },
  { value: "5001+", label: "$5,001+", min: 5001, max: Number.MAX_SAFE_INTEGER },
];

export function isWholeDollarInput(value: string) {
  return value === "" || (/^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)));
}

export function matchesPricingAmount(pricing: CreatorPricing | undefined, min: number, max = min) {
  if (!pricing) return false;
  if (pricing.rate_ranges?.some(range => range.min <= max && range.max >= min)) return true;
  const rates = [pricing.rate_ranges?.some(range => range.kind === "retweet") ? null : pricing.retweet_rate, pricing.comment_rate, pricing.rate_ranges?.some(range => range.kind === "quote") ? null : pricing.quote_rate];
  if (rates.some((rate) => rate != null && rate >= min && rate <= max)) return true;

  const low = pricing.bundle_rate_min;
  const high = pricing.bundle_rate_max;
  if (low == null && high == null) return false;
  // Bundle ranges match when the requested amount/range overlaps them.
  return (low ?? 0) <= max && (high ?? Number.MAX_SAFE_INTEGER) >= min;
}
