export type PricingRange = { kind: "tweet" | "retweet" | "like" | "comment" | "quote" | "short_quote" | "long_quote" | "retweet_comment" | "retweet_like_bookmark" | "repost_quote" | "quote_comment" | "quote_comment_like" | "quote_like_comment_bookmark" | "quote_retweet_comment_bookmark" | "like_retweet_quote_comment" | "like_comment_bookmark" | "repost_like_comment" | "repost_like_comment_bookmark" | "like_comment_repost_bookmark_quote" | "custom_tweet" | "text_post" | "video_post" | "listicle_post" | "thread" | "article" | "three_tweets" | "package" | "weekly_project_package" | "special_tweet"; label: string; min: number; max: number };

// Only explicitly classified Twitter source records supply Twitter ranges.
// Ignore Instagram prices and unstructured numbers in message text.
export function twitterPricingRanges(sourceRows: unknown): PricingRange[] {
  const ranges = new Map<string, PricingRange>();
  if (!Array.isArray(sourceRows)) return [];
  for (const source of sourceRows) {
    const parsed = source?.parsed_rates;
    if (!parsed || (source.platform ?? parsed.platform) !== "twitter" || parsed.currency !== "USD") continue;
    for (const [kind, label] of [
      ["tweet", "Tweet"],
      ["retweet", "Retweet"],
      ["like", "Like"],
      ["comment", "Comment"],
      ["quote", "Quote"],
      ["short_quote", "Short quote tweet"],
      ["long_quote", "Long quote tweet"],
      ["retweet_comment", "Retweet + comment"],
      ["retweet_like_bookmark", "Retweet + like + bookmark"],
      ["repost_quote", "Repost + quote post"],
      ["quote_comment", "Quote tweet + comment"],
      ["quote_comment_like", "Quote tweet + comment + like"],
      ["quote_like_comment_bookmark", "Quote tweet + like + comment + bookmark"],
      ["quote_retweet_comment_bookmark", "Quote tweet + retweet + comment + bookmark"],
      ["like_retweet_quote_comment", "Like + retweet + quote tweet + comment"],
      ["like_comment_bookmark", "Like + comment + bookmark"],
      ["repost_like_comment", "Repost + like + comment"],
      ["repost_like_comment_bookmark", "Repost + like + comment + bookmark"],
      ["like_comment_repost_bookmark_quote", "Like + comment + repost + bookmark + quote repost"],
      ["custom_tweet", "Custom X post"],
      ["text_post", "Text post"],
      ["video_post", "Video post"],
      ["listicle_post", "Listicle post"],
      ["thread", "Thread"],
      ["article", "Article"],
      ["three_tweets", "3 tweets"],
      ["package", "Bundle"],
      ["weekly_project_package", "Weekly: daily tweet + retweet + bio"],
      ["special_tweet", typeof parsed.special_tweet_label === "string" && parsed.special_tweet_label.trim() ? `${parsed.special_tweet_label} (per tweet)` : "Brand / product tweet"],
    ] as const) {
      const min = parsed[`${kind}_rate_min`];
      const max = parsed[`${kind}_rate_max`];
      if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) continue;
      ranges.set(kind, { kind, label, min, max });
    }
  }
  return [...ranges.values()];
}

export function hasAvailablePricing(pricing: {
  retweet_rate: number | null; comment_rate: number | null; quote_rate: number | null;
  bundle_rate_min: number | null; bundle_rate_max: number | null; rate_ranges?: PricingRange[];
  flexible_pricing?: boolean;
}) {
  return [pricing.retweet_rate, pricing.comment_rate, pricing.quote_rate, pricing.bundle_rate_min, pricing.bundle_rate_max].some(value => value != null)
    || Boolean(pricing.rate_ranges?.length) || Boolean(pricing.flexible_pricing);
}
