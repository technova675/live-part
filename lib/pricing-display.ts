import type { CreatorPricing } from "./creator-pricing";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function amount(value: number) {
  return value === 0 ? "Free" : usd.format(value);
}

export function pricingRates(pricing: CreatorPricing | null) {
  const rates: { label: string; value: string }[] = [];
  if (!pricing) return rates;

  for (const [label, value] of [
    ["Retweet", pricing.retweet_rate],
    ["Comment", pricing.comment_rate],
    ["Quote", pricing.quote_rate],
  ] as const) {
    if (value != null) rates.push({ label, value: amount(value) });
  }

  const min = pricing.bundle_rate_min;
  const max = pricing.bundle_rate_max;
  if (min != null || max != null) {
    const value = min != null && max != null
      ? min === max ? amount(min) : `${amount(min)} – ${amount(max)}`
      : min != null ? `From ${amount(min)}` : `Up to ${amount(max!)}`;
    rates.push({ label: "Bundle (all 3)", value });
  }
  return rates;
}
