// Server-only: uses APIFY_TOKEN. Never import from a client component.
import tweetInput from "./tweet-sync-input.json";
import usernameInput from "./username-post-sync-input.json";

const ACTOR = "kaitoeasyapi~premium-twitter-user-scraper-pay-per-result";
const API = "https://api.apify.com/v2";

export type ApifyRun = {
  id: string;
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMING-OUT" | "TIMED-OUT" | "ABORTING" | "ABORTED";
  statusMessage?: string;
  defaultDatasetId: string;
  defaultKeyValueStoreId?: string;
  finishedAt?: string;
};

async function apify<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN env var");

  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw Object.assign(new Error(`Apify error ${res.status}: ${await res.text()}`), { status: res.status });
  return res.json();
}

export async function startUserScrape(userNames: string[]): Promise<ApifyRun> {
  const { data } = await apify<{ data: ApifyRun }>(`/acts/${ACTOR}/runs`, {
    method: "POST",
    body: JSON.stringify({ user_names: userNames }),
  });
  return data;
}

export async function getRun(runId: string): Promise<ApifyRun> {
  const { data } = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`);
  return data;
}

export function getDatasetItems(datasetId: string): Promise<ApifyUser[]> {
  return apify<ApifyUser[]>(`/datasets/${datasetId}/items?clean=true&format=json`);
}

export async function startTweetScrape(tweetId: string): Promise<ApifyRun> {
  if (!/^\d+$/.test(tweetId)) throw new Error("Invalid tweet ID");
  const { data } = await apify<{ data: ApifyRun }>("/acts/xquik~x-tweet-scraper/runs", {
    method: "POST",
    body: JSON.stringify({ ...tweetInput, tweetIds: [tweetId] }),
  });
  return data;
}

export async function startUsernamePostScrape(username: string): Promise<ApifyRun> {
  const handle = username.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle) || ["evrendag1284", "omukare_wanwan"].includes(handle)) {
    throw new Error("Invalid or excluded username");
  }
  const { data } = await apify<{ data: ApifyRun }>("/acts/xquik~x-tweet-scraper/runs", {
    method: "POST",
    body: JSON.stringify({ ...usernameInput, searchTerms: [`from:${handle} since:2026-10-01`] }),
  });
  return data;
}

export function getTweetDatasetItems(datasetId: string): Promise<unknown[]> {
  return apify<unknown[]>(`/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=5000`);
}

export async function getTweetRunInput(runId: string): Promise<{ tweetIds?: string[]; searchTerms?: string[] }> {
  const run = await getRun(runId);
  if (!run.defaultKeyValueStoreId) throw new Error("Run input is unavailable");
  return apify(`/key-value-stores/${encodeURIComponent(run.defaultKeyValueStoreId)}/records/INPUT`);
}

// Subset of the actor's output we read. Everything is optional — suspended or
// missing accounts come back with most fields absent.
export type ApifyUser = {
  type?: string;
  rest_id?: string;
  core?: { screen_name?: string; name?: string; created_at?: string };
  avatar?: { image_url?: string };
  banner?: { image_url?: string };
  location?: { location?: string };
  profile_bio?: {
    description?: string;
    entities?: { url?: { urls?: { expanded_url?: string }[] } };
  };
  website?: { url?: string };
  relationship_counts?: { followers?: number; following?: number };
  tweet_counts?: { tweets?: number; media_tweets?: number };
  action_counts?: { favorites_count?: number };
  verification?: { is_blue_verified?: boolean };
  privacy?: { protected?: boolean };
  dm_permissions?: { can_dm?: boolean };
  professional?: { professional_type?: string; category?: { name?: string }[] };
};

export type ProfileRow = {
  username: string;
  screen_name: string;
  rest_id: string | null;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  website: string | null;
  followers: number | null;
  following: number | null;
  tweets: number | null;
  media_tweets: number | null;
  likes: number | null;
  blue_verified: boolean | null;
  protected: boolean | null;
  can_dm: boolean | null;
  professional_type: string | null;
  professional_category: string | null;
  account_created_at: string | null;
  raw: ApifyUser;
};

export function toProfileRow(u: ApifyUser): ProfileRow | null {
  const screenName = u.core?.screen_name;
  if (!screenName) return null;

  const createdAt = u.core?.created_at ? new Date(u.core.created_at) : null;

  return {
    username: screenName.toLowerCase(),
    screen_name: screenName,
    rest_id: u.rest_id ?? null,
    name: u.core?.name ?? null,
    bio: u.profile_bio?.description || null,
    // "_normal" is 48px; "_400x400" is the full-size avatar.
    avatar_url: u.avatar?.image_url?.replace("_normal.", "_400x400.") ?? null,
    banner_url: u.banner?.image_url ?? null,
    location: u.location?.location || null,
    website: u.profile_bio?.entities?.url?.urls?.[0]?.expanded_url ?? u.website?.url ?? null,
    followers: u.relationship_counts?.followers ?? null,
    following: u.relationship_counts?.following ?? null,
    tweets: u.tweet_counts?.tweets ?? null,
    media_tweets: u.tweet_counts?.media_tweets ?? null,
    likes: u.action_counts?.favorites_count ?? null,
    blue_verified: u.verification?.is_blue_verified ?? null,
    protected: u.privacy?.protected ?? null,
    can_dm: u.dm_permissions?.can_dm ?? null,
    professional_type: u.professional?.professional_type ?? null,
    professional_category: u.professional?.category?.[0]?.name ?? null,
    account_created_at: createdAt && !isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
    raw: u,
  };
}
