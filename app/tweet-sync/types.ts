export type TweetJob = {
  id: string;
  username: string | null;
  status: "pending" | "starting" | "running" | "paid" | "not_paid" | "unknown" | "missing" | "failed" | "start_unknown";
  runId: string | null;
  datasetId: string | null;
  error: string | null;
  attempts: number;
  savedUsername: string | null;
};

export type TweetSyncState = { jobs: TweetJob[]; configured: boolean };
