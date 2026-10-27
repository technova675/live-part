import type { PostAttachment, LinkCard, QuotedPost } from "./post-media";

export type Profile = {
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  website: string | null;
  following: number | null;
  tweets: number | null;
  category: string | null;
  joinedAt: string | null;
  canDm?: boolean | null;
  source: string | null;
};

export type Author = {
  id: string;
  username: string;
  name: string | null;
  followers: number | null;
  verified: boolean;
  paidPosts: number;
  medianViews: number | null;
  profile: Profile | null;
};

export type PaidPost = {
  tweetId: string;
  url: string;
  postedAt: string | null;
  brand: string | null;
  text: string | null;
  views: number | null;
  likes: number | null;
  reposts: number | null;
  quotes: number | null;
  attachments: PostAttachment[];
  card: LinkCard | null;
  quote: QuotedPost | null;
};

type SourceAuthor = {
  name?: string;
  followers?: number;
  isBlueVerified?: boolean;
  profilePictureOriginal?: string;
  profilePicture?: string;
  profileBannerUrl?: string;
  coverPicture?: string;
  description?: string;
  location?: string;
  url?: string;
  following?: number;
  statusesCount?: number;
  createdAt?: string;
  canDm?: boolean;
  can_dm?: boolean;
  professional?: { category?: { name?: string }[] };
};

export type PromotionAuthorRow = {
  author_username: string;
  author_name: string | null;
  author_followers: number | null;
  author: SourceAuthor | null;
  view_count: number | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Rows arrive newest first, so each creator uses their latest scraped profile.
export function authorsFromPromotions(rows: PromotionAuthorRow[]): Author[] {
  const groups = new Map<string, { author: Author; views: number[] }>();
  for (const row of rows) {
    const id = row.author_username.toLowerCase();
    let group = groups.get(id);
    if (!group) {
      const source = row.author;
      const joined = source?.createdAt ? new Date(source.createdAt) : null;
      group = {
        views: [],
        author: {
          id,
          username: row.author_username,
          name: row.author_name ?? source?.name ?? null,
          followers: row.author_followers ?? source?.followers ?? null,
          verified: source?.isBlueVerified === true,
          paidPosts: 0,
          medianViews: null,
          profile: source ? {
            bio: source.description ?? null,
            avatarUrl: source.profilePictureOriginal ?? source.profilePicture?.replace("_normal.", "_400x400.") ?? null,
            bannerUrl: source.profileBannerUrl ?? source.coverPicture ?? null,
            location: source.location ?? null,
            website: source.url ?? null,
            following: source.following ?? null,
            tweets: source.statusesCount ?? null,
            category: source.professional?.category?.[0]?.name ?? null,
            joinedAt: joined && !isNaN(joined.getTime()) ? joined.toISOString() : null,
            canDm: source.canDm ?? source.can_dm ?? null,
            source: null,
          } : null,
        },
      };
      groups.set(id, group);
    }
    group.author.paidPosts++;
    if (row.view_count != null) group.views.push(row.view_count);
  }
  return [...groups.values()]
    .map(({ author, views }) => ({ ...author, medianViews: median(views) }))
    .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1) || a.id.localeCompare(b.id));
}

export type CreatorRow = {
  author_username: string;
  author_name: string | null;
  author_followers: number | null;
  author_blue_verified: boolean | null;
};

export type SyncedProfileRow = {
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  website: string | null;
  followers: number | null;
  following: number | null;
  tweets: number | null;
  blue_verified: boolean | null;
  professional_category: string | null;
  account_created_at: string | null;
  can_dm?: boolean | null;
  source: string | null;
};

// Keep the complete directory; only confirmed promotion rows contribute statistics.
export function mergeCreatorDirectory(
  creators: CreatorRow[],
  profiles: SyncedProfileRow[],
  promotions: PromotionAuthorRow[],
): Author[] {
  const authors = new Map(authorsFromPromotions(promotions).map((author) => [author.id, author]));
  const synced = new Map(profiles.map((profile) => [profile.username.toLowerCase(), profile]));
  for (const creator of creators) {
    const id = creator.author_username.toLowerCase();
    const promotion = authors.get(id);
    const profile = synced.get(id);
    authors.set(id, {
      id,
      username: creator.author_username,
      name: profile?.name ?? creator.author_name ?? promotion?.name ?? null,
      followers: profile?.followers ?? creator.author_followers ?? promotion?.followers ?? null,
      verified: profile?.blue_verified ?? creator.author_blue_verified ?? promotion?.verified ?? false,
      paidPosts: promotion?.paidPosts ?? 0,
      medianViews: promotion?.medianViews ?? null,
      profile: profile ? {
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        bannerUrl: profile.banner_url,
        location: profile.location,
        website: profile.website,
        following: profile.following,
        tweets: profile.tweets,
        category: profile.professional_category,
        joinedAt: profile.account_created_at,
        canDm: profile.can_dm ?? null,
        source: profile.source,
      } : promotion?.profile ?? null,
    });
  }
  // Profiles are also a source of directory membership, including newly
  // imported users who have neither a legacy creator row nor paid posts yet.
  // Apply every synced profile so promotion-only creators get fresh fields too.
  for (const profile of profiles) {
    const id = profile.username.toLowerCase();
    const previous = authors.get(id);
    authors.set(id, {
      id,
      username: previous?.username ?? profile.username,
      name: profile.name ?? previous?.name ?? null,
      followers: profile.followers ?? previous?.followers ?? null,
      verified: profile.blue_verified ?? previous?.verified ?? false,
      paidPosts: previous?.paidPosts ?? 0,
      medianViews: previous?.medianViews ?? null,
      profile: {
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        bannerUrl: profile.banner_url,
        location: profile.location,
        website: profile.website,
        following: profile.following,
        tweets: profile.tweets,
        category: profile.professional_category,
        joinedAt: profile.account_created_at,
        canDm: profile.can_dm ?? null,
        source: profile.source,
      },
    });
  }
  return [...authors.values()].sort(
    (a, b) => (b.followers ?? -1) - (a.followers ?? -1) || a.id.localeCompare(b.id),
  );
}


