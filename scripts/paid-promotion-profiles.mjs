// Map Xquik author snapshots only from confirmed paid-promotion post rows.
export function paidAuthorProfiles(rows, existing = [], fetchedAt = new Date().toISOString()) {
  const stored = new Map(existing.map((profile) => [profile.username.toLowerCase(), profile]));
  const latest = new Map();
  for (const row of rows) {
    const tweet = row.raw;
    if (tweet?.contentDisclosure?.advertising?.isPaidPromotion !== true) continue;
    const username = tweet.author?.username ?? tweet.authorUsername;
    if (typeof username !== "string" || !/^[a-zA-Z0-9_]{1,15}$/.test(username)) {
      throw new Error(`Invalid paid-post author for tweet ${tweet.id}`);
    }
    const key = username.toLowerCase();
    const previous = latest.get(key);
    if (!previous || (Date.parse(row.posted_at) || 0) >= (Date.parse(previous.posted_at) || 0)) latest.set(key, row);
  }
  return [...latest].map(([username, row]) => {
    const tweet = row.raw;
    const author = tweet.author ?? {};
    const old = stored.get(username) ?? {};
    const created = author.createdAt ?? tweet.authorCreatedAt;
    const joined = created ? new Date(created) : null;
    const professional = author.professional ?? tweet.authorProfessional;
    return {
      username,
      screen_name: author.username ?? tweet.authorUsername,
      rest_id: author.id ?? tweet.authorId ?? old.rest_id ?? null,
      name: author.name ?? tweet.authorName ?? old.name ?? null,
      bio: author.description ?? author.profileBio?.description ?? tweet.authorDescription ?? old.bio ?? null,
      avatar_url: author.profilePictureOriginal ?? tweet.authorProfilePictureOriginal ?? (author.profilePicture ?? tweet.authorProfilePicture)?.replace("_normal.", "_400x400.") ?? old.avatar_url ?? null,
      banner_url: author.profileBannerUrl ?? author.coverPicture ?? tweet.authorProfileBannerUrl ?? tweet.authorCoverPicture ?? old.banner_url ?? null,
      location: author.location ?? tweet.authorLocation ?? old.location ?? null,
      website: author.profileBio?.entities?.url?.urls?.[0]?.expandedUrl ?? author.profileBio?.entities?.url?.urls?.[0]?.expanded_url ?? author.url ?? tweet.authorUrl ?? old.website ?? null,
      followers: author.followers ?? tweet.authorFollowers ?? old.followers ?? null,
      following: author.following ?? tweet.authorFollowing ?? old.following ?? null,
      tweets: author.statusesCount ?? tweet.authorStatusesCount ?? old.tweets ?? null,
      media_tweets: author.mediaCount ?? tweet.authorMediaCount ?? old.media_tweets ?? null,
      likes: author.favouritesCount ?? tweet.authorFavouritesCount ?? old.likes ?? null,
      blue_verified: author.isBlueVerified ?? tweet.authorIsBlueVerified ?? old.blue_verified ?? null,
      protected: author.protected ?? tweet.authorProtected ?? old.protected ?? null,
      can_dm: author.canDm ?? author.can_dm ?? old.can_dm ?? null,
      professional_type: professional?.professionalType ?? old.professional_type ?? null,
      professional_category: professional?.category?.[0]?.name ?? old.professional_category ?? null,
      account_created_at: joined && !isNaN(joined.getTime()) ? joined.toISOString() : old.account_created_at ?? null,
      raw: author,
      fetched_at: fetchedAt,
    };
  });
}
