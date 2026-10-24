// Upserts tweets from Apify dataset JSON files into public.posts and public.post_media
// (safe to re-run; later files overwrite earlier ones). Reads both the "x-tweet-scraper"
// format (has contentDisclosure.advertising.isPaidPromotion = the Paid partnership label)
// and the older "twitter-scraper-lite" format.
//
// Usage: node --env-file=.env.local scripts/import-posts.mjs ggd/dataset_x-tweet-scraper_*.json
//   PAID_ONLY=1  import only posts carrying the Paid partnership label
//   DRY_RUN=1    print the mapped rows for the first tweet of each file and write nothing

import { readFileSync, statSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("Pass one or more dataset JSON files");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

const CHUNK = 200;
const dryRun = !!process.env.DRY_RUN;
const paidOnly = !!process.env.PAID_ONLY;

async function supabase(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res;
}

async function upsert(table, conflict, rows) {
  if (dryRun) return;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await supabase(`${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + CHUNK)),
    });
  }
}

// "Mon Oct 19 15:44:03 +0000 2026" -> ISO; both actors use Twitter's legacy date format.
function toIso(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const bigAvatar = (u) => u?.replace("_normal.", "_400x400.") ?? null;

// Map lower(username) -> paid_authors.id; PostgREST caps responses at 1000 rows.
const authors = new Map();
for (let from = 0; !dryRun; from += 1000) {
  const res = await supabase("paid_authors?select=id,author_username&order=id", {
    headers: { Range: `${from}-${from + 999}` },
  });
  const page = await res.json();
  for (const a of page) authors.set(a.author_username.toLowerCase(), a.id);
  if (page.length < 1000) break;
}

// Brand names already identified for paid posts (from the CSV import).
const brands = new Map();
for (let from = 0; !dryRun; from += 1000) {
  const res = await supabase("paid_posts?select=tweet_id,brand&order=tweet_id", { headers: { Range: `${from}-${from + 999}` } });
  const page = await res.json();
  for (const p of page) if (p.brand) brands.set(p.tweet_id, p.brand);
  if (page.length < 1000) break;
}

// --- Normalise the two actor formats -------------------------------------------------

// x-tweet-scraper: author.username, media[] with mediaUrl/mediaKey, contentDisclosure.
// twitter-scraper-lite: author.userName, extendedEntities.media[] with media_url_https/media_key.
const isLite = (t) => t.author?.userName !== undefined;

function authorOf(t) {
  const a = t.author ?? {};
  return {
    username: a.username ?? a.userName ?? t.authorUsername,
    id: a.id ?? t.authorId ?? null,
    name: a.name ?? t.authorName ?? null,
    avatar_url: bigAvatar(a.profilePictureOriginal ?? a.profilePicture ?? t.authorProfilePicture),
    blue_verified: a.isBlueVerified ?? t.authorIsBlueVerified ?? null,
  };
}

function textOf(t) {
  return t.noteTweet?.text || t.fullText || t.text || null;
}

function mediaOf(t) {
  const items = isLite(t) ? (t.extendedEntities?.media ?? []) : (t.media ?? []);
  return items
    .map((m) => ({
      key: m.mediaKey ?? m.media_key,
      type: m.type,
      url: m.mediaUrl ?? m.media_url_https,
      width: m.width ?? m.original_info?.width ?? null,
      height: m.height ?? m.original_info?.height ?? null,
      duration_ms: m.videoInfo?.durationMillis ?? m.video_info?.duration_millis ?? null,
      variants: (m.videoInfo?.variants ?? m.video_info?.variants ?? []).map((v) => ({
        content_type: v.contentType ?? v.content_type,
        bitrate: v.bitrate ?? null,
        url: v.url,
      })),
    }))
    .filter((m) => m.key && m.url);
}

// treg rows: counts are named favorites/retweets/replies/quotes/bookmarks/views, the
// author is user_info, media is {photo: [], video: []} (or [] when empty).
function fromTreg(t, row) {
  const u = t.user_info ?? {};
  const mediaGroups = Array.isArray(t.media) ? {} : (t.media ?? {});
  const media = [
    ...(mediaGroups.photo ?? []).map((m) => ({
      mediaKey: `3_${m.id}`,
      type: "photo",
      mediaUrl: m.media_url_https,
      width: m.sizes?.w ?? null,
      height: m.sizes?.h ?? null,
    })),
    ...(mediaGroups.video ?? []).map((m) => ({
      mediaKey: `7_${m.id}`,
      type: "video",
      mediaUrl: m.media_url_https,
      width: m.original_info?.width ?? null,
      height: m.original_info?.height ?? null,
      videoInfo: { durationMillis: m.duration ?? null, variants: m.variants ?? [] },
    })),
  ];
  const q = t.quoted;
  const screenName = t.screen_name ?? u.screen_name ?? row.author_username;
  return {
    id: t.tweet_id,
    type: "tweet",
    url: row.url ?? `https://x.com/${screenName}/status/${t.tweet_id}`,
    text: t.text,
    lang: t.lang,
    createdAt: t.created_at,
    source: t.source,
    replyCount: t.replies,
    retweetCount: t.retweets,
    likeCount: t.favorites,
    quoteCount: t.quotes,
    bookmarkCount: t.bookmarks,
    viewCount: t.views == null ? null : Number(t.views),
    isReply: !!t.in_reply_to_status_id_str,
    inReplyToId: t.in_reply_to_status_id_str ?? null,
    inReplyToUsername: t.in_reply_to_screen_name ?? null,
    isQuoteStatus: !!q,
    possiblySensitive: t.sensitive ?? null,
    conversationId: t.conversation_id ?? null,
    entities: t.entities ?? {},
    media,
    author: {
      username: screenName,
      id: u.rest_id ?? null,
      name: u.name ?? row.author_name ?? null,
      profilePicture: u.avatar ?? null,
      isBlueVerified: u.verified ?? row.author_blue_verified ?? null,
    },
    quotedTweetId: q?.tweet_id ?? row.quoted_post_id ?? null,
    quotedTweet: q
      ? fromTreg({ ...q, user_info: q.author ? { ...q.author, verified: q.author.blue_verified } : {}, screen_name: q.author?.screen_name }, {})
      : null,
    _treg: t,
  };
}

function paidFlag(t) {
  const v = t.contentDisclosure?.advertising?.isPaidPromotion;
  if (v === true || v === false) return v;
  if (typeof t._exportPaid === "boolean") return t._exportPaid;
  // The field is omitted (not false) on unlabelled posts in x-tweet-scraper output.
  return t.contentDisclosure !== undefined ? false : null;
}

function mediaRows(t) {
  return mediaOf(t).map((m, i) => {
    const best = m.variants
      .filter((v) => v.content_type === "video/mp4")
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    return {
      media_key: m.key,
      tweet_id: t.id,
      position: i,
      type: m.type,
      url: m.url,
      width: m.width,
      height: m.height,
      duration_ms: m.duration_ms,
      video_url: best?.url ?? null,
      variants: m.variants.length ? m.variants : null,
    };
  });
}

function quoted(q) {
  if (!q || !q.id) return null;
  return {
    id: q.id,
    url: q.url ?? null,
    text: textOf(q),
    created_at: toIso(q.createdAt),
    author: q.author ? authorOf(q) : null,
    media: mediaOf(q).map((m) => ({ type: m.type, url: m.url })),
    like_count: q.likeCount ?? null,
    view_count: q.viewCount ?? null,
  };
}

function postRow(t, scrapedAt) {
  const author = authorOf(t);
  const e = t.entities ?? {};
  const mentions = e.userMentions ?? e.user_mentions ?? [];
  return {
    tweet_id: t.id,
    author_id: authors.get(author.username?.toLowerCase()) ?? null,
    author_username: author.username,
    author_x_id: author.id,
    url: t.url ?? t.tweetUrl,
    text: textOf(t),
    is_note_tweet: !!t.isNoteTweet || !!t.noteTweet,
    lang: t.lang || null,
    posted_at: toIso(t.createdAt),
    source: t.source || null,
    reply_count: t.replyCount ?? null,
    retweet_count: t.retweetCount ?? null,
    like_count: t.likeCount ?? null,
    quote_count: t.quoteCount ?? null,
    bookmark_count: t.bookmarkCount ?? null,
    view_count: t.viewCount ?? null,
    is_reply: !!t.isReply,
    is_retweet: !!t.isRetweet,
    is_quote: !!(t.isQuoteStatus ?? t.isQuote),
    is_pinned: !!t.isPinned,
    possibly_sensitive: t.possiblySensitive ?? null,
    conversation_id: t.conversationId ?? null,
    in_reply_to_tweet_id: t.inReplyToId ?? null,
    in_reply_to_username: t.inReplyToUsername ?? null,
    quoted_tweet_id: t.quotedTweetId ?? t.quoteId ?? t.quotedTweet?.id ?? t.quote?.id ?? null,
    quoted_tweet: quoted(t.quotedTweet ?? t.quote),
    card: t.card && Object.keys(t.card).length ? t.card : null,
    hashtags: (e.hashtags ?? []).map((h) => h.text).filter(Boolean),
    cashtags: (e.symbols ?? []).map((s) => s.text).filter(Boolean),
    mentions: mentions.map((m) => m.screenName ?? m.screen_name).filter(Boolean),
    urls: (e.urls ?? []).map((u) => ({
      url: u.url,
      display_url: u.displayUrl ?? u.display_url,
      expanded_url: u.expandedUrl ?? u.expanded_url,
    })),
    is_paid_partnership: paidFlag(t),
    brand: brands.get(t.id) ?? null,
    scrape_mode: t.engagementMode ?? null,
    scrape_source_tweet_id: t.sourceTweetId ?? null,
    raw: t._treg ?? t,
    scraped_at: scrapedAt,
  };
}

let total = 0;
let totalPaid = 0;
const unknownAuthors = new Set();
for (const file of files) {
  // DB exports wrap the scraped tweet under `raw` (with is_paid_partnership alongside).
  // Rows with source "treg" use a third shape; fromTreg() rewrites them into the
  // x-tweet-scraper shape so the rest of the mapping is shared.
  const data = JSON.parse(readFileSync(file, "utf8")).map((r) => {
    if (r?.raw?.id) return { ...r.raw, _exportPaid: r.is_paid_partnership ?? null };
    if (r?.raw?.tweet_id) return { ...fromTreg(r.raw, r), _exportPaid: r.is_paid_partnership ?? null };
    return r;
  });
  // Fall back to the file's mtime when the dataset name has no timestamp.
  const m = file.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  const scrapedAt = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z` : statSync(file).mtime.toISOString();

  let tweets = data.filter((t) => t && (t.type === "tweet" || t.type === "reply") && t.id && authorOf(t).username);
  if (paidOnly) tweets = tweets.filter((t) => paidFlag(t) === true);
  // A file can list the same tweet twice; one upsert can't touch a row twice.
  tweets = [...new Map(tweets.map((t) => [t.id, t])).values()];
  const posts = tweets.map((t) => postRow(t, scrapedAt));
  const media = [...new Map(tweets.flatMap(mediaRows).map((m) => [m.media_key, m])).values()];
  for (const p of posts) if (!dryRun && p.author_id == null) unknownAuthors.add(p.author_username);
  const paid = posts.filter((p) => p.is_paid_partnership).length;

  if (dryRun && posts[0]) {
    const sample = posts.find((p) => p.is_paid_partnership && p.quoted_tweet) ?? posts[0];
    console.log(JSON.stringify({ ...sample, raw: "<omitted>" }, null, 1));
    console.log(JSON.stringify(media.find((x) => x.tweet_id === sample.tweet_id) ?? media[0], null, 1));
  }
  await upsert("posts", "tweet_id", posts);
  await upsert("post_media", "media_key", media);
  total += posts.length;
  totalPaid += paid;
  console.log(`${file}: ${posts.length} posts (${paid} paid partnership), ${media.length} media`);
}

console.log(`done: ${total} posts, ${totalPaid} paid partnership`);
if (unknownAuthors.size) {
  console.warn(`${unknownAuthors.size} authors not in paid_authors (stored with author_id null):`, [...unknownAuthors].slice(0, 20));
}
