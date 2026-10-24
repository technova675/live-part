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

export async function getAuthors() {
  "use cache";
  cacheLife("minutes");
  cacheTag("authors", "paid-promotion-posts");

  const [creators, profiles, promotions] = await Promise.all([
    fetchAll<CreatorRow>(
      "paid_authors?select=author_username,author_name,author_followers,author_blue_verified&order=id.asc",
    ),
    fetchAll<SyncedProfileRow>(
      "author_profiles?select=username,name,bio,avatar_url,banner_url,location,website,followers,following,tweets,blue_verified,professional_category,account_created_at&order=username.asc",
    ),
    fetchAll<PromotionAuthorRow>(
      "paid_promotion_posts?select=author_username,author_name,author_followers,author,view_count&is_paid_promotion=eq.true&order=posted_at.desc.nullslast,tweet_id.desc",
    ),
  ]);
  return mergeCreatorDirectory(creators, profiles, promotions);
}

export async function getAuthor(username: string) {
  const lower = username.toLowerCase();
  return (await getAuthors()).find((author) => author.username.toLowerCase() === lower);
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




