// Adapt the alternate scraper format while keeping the user's classification auditable.
function normalizeTweet(tweet) {
  const source = tweet.author ?? {};
  const profileBio = source.profileBio ?? source.profile_bio;
  const website = profileBio?.entities?.url?.urls?.[0]?.expandedUrl
    ?? profileBio?.entities?.url?.urls?.[0]?.expanded_url
    ?? source.entities?.url?.urls?.[0]?.expanded_url;
  // This scraper's author.url is the X profile, not the author's external website.
  const externalUrl = source.url && !/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(source.url) ? source.url : null;
  const media = tweet.media ?? tweet.extendedEntities?.media ?? [];
  const quoted = tweet.quotedTweet ?? tweet.quoted_tweet;
  return {
    ...tweet,
    author: {
      ...source,
      username: source.username ?? source.userName,
      profileBio,
      url: website ?? externalUrl,
    },
    isQuoteStatus: tweet.isQuoteStatus ?? tweet.isQuote ?? !!quoted,
    quotedTweetId: tweet.quotedTweetId ?? quoted?.id ?? null,
    quotedTweet: quoted?.id ? normalizeTweet(quoted) : null,
    media: media.map((item) => ({
      ...item,
      mediaKey: item.mediaKey ?? item.media_key,
      mediaUrl: item.mediaUrl ?? item.media_url_https,
      width: item.width ?? item.original_info?.width ?? item.sizes?.large?.w ?? null,
      height: item.height ?? item.original_info?.height ?? item.sizes?.large?.h ?? null,
      videoVariants: (item.videoVariants ?? item.videoInfo?.variants ?? item.video_info?.variants ?? []).map((variant) => ({
        ...variant,
        contentType: variant.contentType ?? variant.content_type,
      })),
    })),
  };
}

export function userConfirmedPaidTweet(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Expected a tweet object");
  const normalized = normalizeTweet(source);
  return {
    ...normalized,
    contentDisclosure: {
      ...source.contentDisclosure,
      advertising: { ...source.contentDisclosure?.advertising, isPaidPromotion: true },
    },
    _import: {
      paidPromotionSource: "user-confirmed",
      sourceRecord: source,
    },
  };
}
