import type { CreatorPricing } from "./creator-pricing";

// Price slider stops in whole dollars. The last stop means "and up".
export const PRICE_STEPS = [0, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000];
export const MAX_PRICE_STEP = PRICE_STEPS.length - 1;

export function priceStepLabel(step: number) {
  return `$${PRICE_STEPS[step].toLocaleString("en-US")}${step === MAX_PRICE_STEP ? "+" : ""}`;
}

// Inclusive dollar bounds for a slider selection between two stops.
export function priceStepBounds(low: number, high: number) {
  return { min: PRICE_STEPS[low], max: high === MAX_PRICE_STEP ? Number.MAX_SAFE_INTEGER : PRICE_STEPS[high] };
}

// Histogram bands between neighboring stops; the last band is open-ended.
export const PRICE_BANDS = PRICE_STEPS.slice(0, -1).map((min, index) => ({
  min,
  max: index === MAX_PRICE_STEP - 1 ? Number.MAX_SAFE_INTEGER : PRICE_STEPS[index + 1] - 1,
}));

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
