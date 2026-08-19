export type Job = {
  id: string;
  source: string;
  externalId: string;
  canonicalUrl: string;
  contentHash: string;
  title: string;
  company: string;
  companyLogoUrl: string | null;
  location: string | null;
  country: string | null;
  category: string | null;
  jobType: string | null;
  salary: string | null;
  description: string | null;
  postedAt: string | null;
  fetchedAt: string;
  active: boolean;
};

export type SourceState = {
  source: string;
  enabled: boolean;
  health: "healthy" | "degraded" | "stale";
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastError: string | null;
};

export type SyncResult = {
  source: string;
  status: "completed" | "failed";
  persisted: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  error?: string;
};
