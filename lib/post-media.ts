export type PostAttachment = {
  type: "photo" | "video" | "animated_gif";
  imageUrl: string;
  width: number | null;
  height: number | null;
  videoUrl: string | null;
  shortUrl: string | null;
  alt: string;
};

export type LinkCard = {
  url: string;
  imageUrl: string | null;
  title: string;
  description: string | null;
  domain: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function httpUrl(value: unknown): string | null {
  const candidate = string(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ["https:", "http:"].includes(url.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

function bindingText(value: unknown): string | null {
  const obj = object(value);
  return string(value) ?? string(obj.stringValue) ?? string(obj.string_value);
}

function bindingImage(value: unknown): string | null {
  const obj = object(value);
  return httpUrl(obj.url) ?? httpUrl(object(obj.imageValue ?? obj.image_value).url) ?? httpUrl(value);
}

export function normalizeAttachments(media: unknown): PostAttachment[] {
  if (!Array.isArray(media)) return [];
  return media.flatMap((item): PostAttachment[] => {
    const m = object(item);
    if (!["photo", "video", "animated_gif"].includes(String(m.type))) return [];
    const imageUrl = httpUrl(m.mediaUrl ?? m.media_url_https);
    if (!imageUrl) return [];
    const info = object(m.videoInfo ?? m.video_info);
    const variants = m.videoVariants ?? info.variants;
    const mp4s = (Array.isArray(variants) ? variants : [])
      .map(object)
      .filter((variant) => (variant.contentType ?? variant.content_type) === "video/mp4" && httpUrl(variant.url))
      .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0));
    return [{
      type: m.type as PostAttachment["type"],
      imageUrl,
      width: typeof m.width === "number" && m.width > 0 ? m.width : null,
      height: typeof m.height === "number" && m.height > 0 ? m.height : null,
      videoUrl: httpUrl(mp4s[0]?.url),
      shortUrl: httpUrl(m.url),
      alt: string(m.extAltText ?? m.ext_alt_text ?? m.altText) ?? "Post attachment",
    }];
  });
}

export function normalizeCard(card: unknown, entities: unknown): LinkCard | null {
  const c = object(card);
  if (!Object.keys(c).length) return null;
  const rawBindings = c.bindingValues ?? c.binding_values;
  const bindings = Array.isArray(rawBindings)
    ? Object.fromEntries(rawBindings.map((item) => { const entry = object(item); return [String(entry.key), entry.value]; }))
    : object(rawBindings);
  const shortUrl = httpUrl(c.url) ?? httpUrl(bindings.cardUrl ?? bindings.card_url) ?? httpUrl(c.id);
  const urls = object(entities).urls;
  const matching = (Array.isArray(urls) ? urls.map(object) : []).find((entity) => entity.url === shortUrl);
  const url = httpUrl(matching?.expandedUrl ?? matching?.expanded_url)
    ?? httpUrl(bindingText(bindings.cardUrl ?? bindings.card_url)) ?? shortUrl;
  if (!url) return null;
  const imageKeys = ["photoImageFullSizeOriginal", "summaryPhotoImageOriginal", "photoImageFullSize", "summaryPhotoImage", "thumbnailImageOriginal", "thumbnailImage", "photo_image_full_size", "summary_photo_image", "thumbnail_image"];
  const imageUrl = imageKeys.map((key) => bindingImage(bindings[key])).find(Boolean) ?? bindingImage(c.image) ?? null;
  const domain = bindingText(bindings.domain) ?? new URL(url).hostname.replace(/^www\./, "");
  return {
    url,
    imageUrl,
    title: bindingText(bindings.title) ?? string(c.title) ?? domain,
    description: bindingText(bindings.description) ?? string(c.description),
    domain,
  };
}

export function postPresentation(text: string | null, media: unknown, card: unknown, entities: unknown, hiddenUrls: string[] = []) {
  const attachments = normalizeAttachments(media);
  // Media takes precedence; link previews appear only on posts without attachments.
  const preview = attachments.length ? null : normalizeCard(card, entities);
  const hidden = new Set([...hiddenUrls, ...attachments.map((attachment) => attachment.shortUrl).filter(Boolean)]);
  if (preview) {
    const c = object(card);
    const bindings = object(c.bindingValues ?? c.binding_values);
    for (const candidate of [c.url, c.id, bindingText(bindings.cardUrl ?? bindings.card_url)]) {
      const url = httpUrl(candidate);
      if (url) hidden.add(url);
    }
  }
  const displayText = text?.replace(/https?:\/\/[^\s]+/g, (url) => hidden.has(url) ? "" : url)
    .replace(/[ \t]+$/gm, "").trim() ?? null;
  return { text: displayText, attachments, card: preview };
}

export type QuotedPost = {
  tweetId: string;
  url: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  postedAt: string | null;
  text: string | null;
  attachments: PostAttachment[];
  card: LinkCard | null;
};

export function normalizeQuotedPost(value: unknown, fallbackId: string | null = null): QuotedPost | null {
  const tweet = object(value);
  const id = string(tweet.id) ?? string(tweet.tweet_id) ?? fallbackId;
  if (!id) return null;
  const author = object(tweet.author);
  const username = string(author.username ?? author.userName ?? tweet.authorUsername);
  const created = string(tweet.createdAt ?? tweet.created_at);
  const date = created ? new Date(created) : null;
  return {
    tweetId: id,
    url: httpUrl(tweet.url ?? tweet.tweetUrl) ?? `https://x.com/i/status/${encodeURIComponent(id)}`,
    username,
    name: string(author.name ?? tweet.authorName) ?? username ?? "Quoted post",
    avatarUrl: httpUrl(author.profilePictureOriginal ?? author.profilePicture ?? tweet.authorProfilePicture),
    verified: (author.isBlueVerified ?? tweet.authorIsBlueVerified) === true,
    postedAt: date && !isNaN(date.getTime()) ? date.toISOString() : null,
    ...postPresentation(
      string(object(tweet.noteTweet).text) ?? string(tweet.fullText ?? tweet.text),
      tweet.media ?? object(tweet.extendedEntities).media,
      tweet.card,
      tweet.entities,
    ),
  };
}

// Hide only links represented by the embedded quote, preserving unrelated links.
export function quoteLinkUrls(quote: QuotedPost | null, entities: unknown): string[] {
  if (!quote) return [];
  const hidden = [quote.url];
  const urls = object(entities).urls;
  for (const value of Array.isArray(urls) ? urls : []) {
    const entity = object(value);
    const expanded = httpUrl(entity.expandedUrl ?? entity.expanded_url);
    if (!expanded) continue;
    const url = new URL(expanded);
    if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) && url.pathname.endsWith(`/status/${quote.tweetId}`)) {
      const short = httpUrl(entity.url);
      if (short) hidden.push(short);
    }
  }
  return hidden;
}


