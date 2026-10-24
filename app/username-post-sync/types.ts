import type { TweetJob } from "../tweet-sync/types";

export type UsernamePostJob = TweetJob & {
  username: string;
  name: string | null;
  followers: number | null;
  fetchedPosts: number;
  paidPosts: number;
  skippedPosts: number;
};

export type UsernamePostSyncState = { jobs: UsernamePostJob[]; configured: boolean };
