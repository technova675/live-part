import { postPresentation, normalizeQuotedPost, quoteLinkUrls } from "./post-media";
import { cacheLife, cacheTag } from "next/cache";
import { supabase } from "./supabase";
import { mergeCreatorDirectory, type CreatorRow, type SyncedProfileRow, type PromotionAuthorRow, type PaidPost } from "./paid-promotions";

export type { Author, Profile, PaidPost } from "./paid-promotions";

// Server-only: uses the Supabase service role key.
const PAGE_SIZE = 1000;

async function fetchAll<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await supabase(path, { headers: { Range: `${from}-${from + PAGE_SIZE - 1}` } });
    const page: T[] = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// Pages fetched concurrently once the total is known.
async function fetchAllParallel<T>(path: string): Promise<T[]> {
  const head = await supabase(path, { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } });
  const total = Number(head.headers.get("content-range")?.split("/")[1] ?? 0);
  const pages = await Promise.all(Array.from({ length: Math.ceil(total / PAGE_SIZE) }, async (_, index) => {
    const from = index * PAGE_SIZE;
    const res = await supabase(path, { headers: { Range: `${from}-${from + PAGE_SIZE - 1}` } });
    return res.json() as Promise<T[]>;
  }));
  return pages.flat();
}

const AUTHOR_CHUNK = 150;

// The full `author` JSON on every paid post is ~38 MB, but the directory only
// reads it from each creator's newest post. Load light rows first, then the
// author JSON for just those posts.
async function getPromotionAuthorRows(): Promise<PromotionAuthorRow[]> {
  const rows = await fetchAllParallel<Omit<PromotionAuthorRow, "author"> & { tweet_id: string }>(
    "paid_promotion_posts?select=tweet_id,author_username,author_name,author_followers,view_count&is_paid_promotion=eq.true&order=posted_at.desc.nullslast,tweet_id.desc",
  );
  const newest = new Map<string, string>();
  for (const row of rows) {
    const id = row.author_username.toLowerCase();
    if (!newest.has(id)) newest.set(id, row.tweet_id);
  }
  const ids = [...newest.values()];
  const chunks = await Promise.all(Array.from({ length: Math.ceil(ids.length / AUTHOR_CHUNK) }, async (_, index) => {
    const list = ids.slice(index * AUTHOR_CHUNK, (index + 1) * AUTHOR_CHUNK).map(encodeURIComponent).join(",");
    const res = await supabase(`paid_promotion_posts?select=tweet_id,author&tweet_id=in.(${list})`);
    return res.json() as Promise<{ tweet_id: string; author: PromotionAuthorRow["author"] }[]>;
  }));
  const authors = new Map(chunks.flat().map(row => [row.tweet_id, row.author]));
  return rows.map(({ tweet_id, ...row }) => ({ ...row, author: authors.get(tweet_id) ?? null }));
}

export async function getAuthors() {
  "use cache";
  cacheLife("minutes");
  cacheTag("authors", "paid-promotion-posts");

  const [creators, profiles, promotions] = await Promise.all([
    fetchAll<CreatorRow>(
      "paid_authors?select=author_username,author_name,author_followers,author_blue_verified&order=id.asc",
    ),
    fetchAll<SyncedProfileRow>(
      "author_profiles?select=username,name,bio,avatar_url,banner_url,location,website,followers,following,tweets,blue_verified,can_dm,professional_category,account_created_at,source&order=username.asc",
    ),
    getPromotionAuthorRows(),
  ]);
  return mergeCreatorDirectory(creators, profiles, promotions);
}

export async function getAuthor(username: string) {
  const lower = username.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(lower)) return undefined;
  return getAuthorByHandle(lower);
}

async function getAuthorByHandle(handle: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("authors", "paid-promotion-posts");

  // Metadata and the profile share this small cache entry. Do not load the
  // full directory (and every paid post) to render a single creator.
  const exactHandle = encodeURIComponent(handle.replace(/_/g, "\\_"));
  const [creators, profiles, promotions] = await Promise.all([
    fetchAll<CreatorRow>(
      `paid_authors?select=author_username,author_name,author_followers,author_blue_verified&author_username=ilike.${exactHandle}&order=id.asc`,
    ),
    fetchAll<SyncedProfileRow>(
      `author_profiles?select=username,name,bio,avatar_url,banner_url,location,website,followers,following,tweets,blue_verified,can_dm,professional_category,account_created_at,source&username=eq.${encodeURIComponent(handle)}&order=username.asc`,
    ),
    fetchAll<PromotionAuthorRow>(
      `paid_promotion_posts?select=author_username,author_name,author_followers,author,view_count&is_paid_promotion=eq.true&author_username=ilike.${exactHandle}&order=posted_at.desc.nullslast,tweet_id.desc`,
    ),
  ]);
  return mergeCreatorDirectory(creators, profiles, promotions)[0];
}

type PaidPostDetailRow = {
  tweet_id: string;
  url: string;
  posted_at: string | null;
  text: string | null;
  view_count: number | null;
  like_count: number | null;
  retweet_count: number | null;
  quote_count: number | null;
  media: unknown;
  card: unknown;
  entities: unknown;
  quoted_tweet: unknown;
  quoted_tweet_id: string | null;
};

export async function getPaidPosts(username: string): Promise<PaidPost[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("authors", "paid-promotion-posts");

  // Escape LIKE wildcards so underscores in X handles match literally.
  const handle = encodeURIComponent(username.replace(/[\\%_]/g, "\\$&"));
  const rows = await fetchAll<PaidPostDetailRow>(
    `paid_promotion_posts?select=tweet_id,url,posted_at,text,view_count,like_count,retweet_count,quote_count,media,card,entities,quoted_tweet,quoted_tweet_id&is_paid_promotion=eq.true&author_username=ilike.${handle}&order=posted_at.desc.nullslast,tweet_id.desc`,
  );
  return rows.map((row) => {
    const quote = normalizeQuotedPost(row.quoted_tweet, row.quoted_tweet_id);
    return {
      tweetId: row.tweet_id,
      url: row.url,
      postedAt: row.posted_at,
      // A paid label does not identify the sponsor; this table has no brand field.
      brand: null,
      ...postPresentation(row.text, row.media, row.card, row.entities, quoteLinkUrls(quote, row.entities)),
      quote,
      views: row.view_count,
      likes: row.like_count,
      reposts: row.retweet_count,
      quotes: row.quote_count,
    };
  });
}




