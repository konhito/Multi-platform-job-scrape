import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { getRuntime, setRuntime } from "./memory";
import { fetchJobSpyJobs } from "./jobspy";
import { fetchLinkedInJobs } from "./linkedin";
import { fetchRemotiveJobs } from "./remotive";
import { fetchWellfoundJobs } from "./wellfound";
import type { Job, SourceState, SyncResult } from "./types";

export type RetryQueueItem = { id: string; source: string; statusCode: number; state: "queued" | "dead_letter" | "completed"; attempts: number; availableAt: string | null };

const asIso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;

export async function listJobs(filters: { source?: string; search?: string; country?: string } = {}): Promise<Job[]> {
  const database = sql;
  const rows = !database ? null : filters.source
    ? await database`select id, source, external_id, canonical_url, content_hash, title, company, company_logo_url, location, country, category, job_type, salary, description, posted_at, fetched_at, active from jobs where active = true and source = ${filters.source} order by posted_at desc nulls last limit 100`
    : await database`select id, source, external_id, canonical_url, content_hash, title, company, company_logo_url, location, country, category, job_type, salary, description, posted_at, fetched_at, active from jobs where active = true order by posted_at desc nulls last limit 100`;
  const all = !rows
    ? getRuntime()?.jobs || []
    : rows.map((row) => ({
    id: String(row.id), source: String(row.source), externalId: String(row.external_id), canonicalUrl: String(row.canonical_url), contentHash: String(row.content_hash),
    title: String(row.title), company: String(row.company), companyLogoUrl: row.company_logo_url ? String(row.company_logo_url) : null, location: row.location ? String(row.location) : null, description: row.description ? String(row.description) : null,
    country: row.country ? String(row.country) : null, category: row.category ? String(row.category) : null, jobType: row.job_type ? String(row.job_type) : null, salary: row.salary ? String(row.salary) : null,
    postedAt: asIso(row.posted_at), fetchedAt: asIso(row.fetched_at) || new Date().toISOString(), active: Boolean(row.active)
  }));
  const query = filters.search?.trim().toLowerCase();
  return all.filter((job) => (!filters.source || job.source === filters.source) && (!filters.country || job.country === filters.country) && (!query || [job.title, job.company, job.location, job.category, job.jobType].some((value) => value?.toLowerCase().includes(query))));
}

export async function listSources(): Promise<SourceState[]> {
  if (!sql) return getRuntime()?.sources || [];
  const rows = await sql`select source, enabled, health, last_success_at, consecutive_failures, cooldown_until, last_error from source_state order by source`;
  return rows.map((row) => ({
    source: String(row.source), enabled: Boolean(row.enabled), health: String(row.health) as SourceState["health"], lastSuccessAt: asIso(row.last_success_at),
    consecutiveFailures: Number(row.consecutive_failures), cooldownUntil: asIso(row.cooldown_until), lastError: row.last_error ? String(row.last_error) : null
  }));
}

async function syncSource(source: string, fetchJobs: () => Promise<Job[]>): Promise<SyncResult> {
  if (!sql) {
    try {
      const jobs = await fetchJobs();
      const current = getRuntime();
      setRuntime({
        jobs: [...(current?.jobs || []).filter((job) => job.source !== source), ...jobs],
        sources: [...(current?.sources || []).filter((item) => item.source !== source), { source, enabled: true, health: "healthy", lastSuccessAt: new Date().toISOString(), consecutiveFailures: 0, cooldownUntil: null, lastError: null }]
      });
      return { source, status: "completed", persisted: false, fetched: jobs.length, inserted: jobs.length, updated: 0, duplicates: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      const current = getRuntime();
      setRuntime({ sources: [...(current?.sources || []).filter((item) => item.source !== source), { source, enabled: true, health: "degraded", lastSuccessAt: null, consecutiveFailures: 1, cooldownUntil: null, lastError: message }] });
      return { source, status: "failed", persisted: false, fetched: 0, inserted: 0, updated: 0, duplicates: 0, error: message };
    }
  }

  const runId = randomUUID();
  await sql`insert into source_state (source, enabled, health) values (${source}, true, 'healthy') on conflict (source) do nothing`;
  await sql`insert into crawl_runs (id, source, status) values (${runId}, ${source}, 'running')`;
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  let jobs: Job[] = [];
  try {
    jobs = await fetchJobs();
    for (const job of jobs) {
      const existing = await sql`select content_hash from jobs where source = ${job.source} and external_id = ${job.externalId}`;
      if (existing.length === 0) {
        await sql`insert into jobs (id, source, external_id, canonical_url, content_hash, title, company, company_logo_url, location, country, category, job_type, salary, description, posted_at, fetched_at, active) values (${job.id}, ${job.source}, ${job.externalId}, ${job.canonicalUrl}, ${job.contentHash}, ${job.title}, ${job.company}, ${job.companyLogoUrl}, ${job.location}, ${job.country}, ${job.category}, ${job.jobType}, ${job.salary}, ${job.description}, ${job.postedAt}, ${job.fetchedAt}, true)`;
        inserted++;
      } else if (String(existing[0].content_hash) !== job.contentHash) {
        await sql`update jobs set canonical_url = ${job.canonicalUrl}, content_hash = ${job.contentHash}, title = ${job.title}, company = ${job.company}, company_logo_url = ${job.companyLogoUrl}, location = ${job.location}, country = ${job.country}, category = ${job.category}, job_type = ${job.jobType}, salary = ${job.salary}, description = ${job.description}, posted_at = ${job.postedAt}, fetched_at = ${job.fetchedAt}, active = true where source = ${job.source} and external_id = ${job.externalId}`;
        updated++;
      } else {
        await sql`update jobs set company_logo_url = ${job.companyLogoUrl}, fetched_at = ${job.fetchedAt}, active = true where source = ${job.source} and external_id = ${job.externalId}`;
        duplicates++;
      }
    }
    const now = new Date().toISOString();
    await sql`update crawl_runs set status = 'completed', finished_at = ${now}, discovered_count = ${jobs.length}, fetched_count = ${jobs.length}, parsed_count = ${jobs.length}, inserted_count = ${inserted}, updated_count = ${updated}, duplicate_count = ${duplicates} where id = ${runId}`;
    await sql`update source_state set health = 'healthy', last_success_at = ${now}, consecutive_failures = 0, cooldown_until = null, last_error = null where source = ${source}`;
    return { source, status: "completed", persisted: true, fetched: jobs.length, inserted, updated, duplicates };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await sql`update crawl_runs set status = 'failed', finished_at = now(), error_message = ${message} where id = ${runId}`;
    await sql`update source_state set health = 'degraded', consecutive_failures = consecutive_failures + 1, last_error = ${message} where source = ${source}`;
    return { source, status: "failed", persisted: true, fetched: jobs.length, inserted, updated, duplicates, error: message };
  }
}

export const syncRemotive = (term?: string) => syncSource("remotive", () => fetchRemotiveJobs(20, term));
export const syncLinkedIn = (term?: string, location?: string, lookbackSeconds = 86_400) => syncSource("linkedin", () => fetchLinkedInJobs(term || "software engineer", { location: location || "India", id: location === "India" || !location ? "102713980" : "" }, lookbackSeconds));
export const syncJobSpy = (source: "indeed" | "glassdoor" | "google", term?: string, lookbackSeconds = 86_400) => syncSource(source, () => fetchJobSpyJobs(source, term, "India", lookbackSeconds));
export const syncWellfound = (term?: string) => syncSource("wellfound", () => fetchWellfoundJobs(term));

export async function queueSourceFailure(source: "linkedin", statusCode: 403 | 404 | 429): Promise<RetryQueueItem> {
  const retryable = statusCode === 429;
  const item: RetryQueueItem = { id: randomUUID(), source, statusCode, state: retryable ? "queued" : "dead_letter", attempts: 0, availableAt: retryable ? new Date(Date.now() + 60_000).toISOString() : null };
  if (!sql) return item;
  await sql`insert into source_state (source, enabled, health, consecutive_failures, last_error) values (${source}, true, 'degraded', 1, ${`${statusCode} test failure`}) on conflict (source) do update set health = 'degraded', consecutive_failures = source_state.consecutive_failures + 1, last_error = excluded.last_error`;
  await sql`insert into retry_queue (id, source, status_code, state, attempts, available_at) values (${item.id}, ${source}, ${statusCode}, ${item.state}, ${item.attempts}, ${item.availableAt})`;
  return item;
}

export async function listRetryQueue(source: string): Promise<RetryQueueItem[]> {
  if (!sql) return [];
  const rows = await sql`select id, source, status_code, state, attempts, available_at from retry_queue where source = ${source} and state <> 'completed' order by created_at desc limit 5`;
  return rows.map((row) => ({ id: String(row.id), source: String(row.source), statusCode: Number(row.status_code), state: String(row.state) as RetryQueueItem["state"], attempts: Number(row.attempts), availableAt: asIso(row.available_at) }));
}

export async function processQueuedRetries() {
  const database = sql;
  if (!database) return [];
  const rows = await database`select id, source, attempts from retry_queue where state = 'queued' and available_at <= now() order by available_at limit 3`;
  return Promise.all(rows.map(async (row) => {
    const source = String(row.source);
    const result = source === "linkedin" ? await syncLinkedIn() : { status: "failed" as const };
    if (result.status === "completed") await database`update retry_queue set state = 'completed', completed_at = now(), attempts = attempts + 1 where id = ${String(row.id)}`;
    else await database`update retry_queue set attempts = attempts + 1, available_at = now() + interval '6 hours' where id = ${String(row.id)}`;
    return result;
  }));
}
