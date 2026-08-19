import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { Job } from "./types";

const run = promisify(execFile);
const sources = new Set(["indeed", "glassdoor", "google"]);
type Listing = { url: string; title: string; company: string; company_logo: string; location: string; description: string; job_type: string; date_posted: string; min_amount: string; max_amount: string; currency: string; interval: string };

const iso = (value: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
const salary = (job: Listing) => [job.min_amount, job.max_amount].filter(Boolean).join(" - ") + (job.currency ? ` ${job.currency}` : "") + (job.interval ? ` / ${job.interval}` : "") || null;

export async function fetchJobSpyJobs(source: string, term = "software engineer", location = "India", lookbackSeconds = 86_400): Promise<Job[]> {
  if (!sources.has(source)) throw new Error("Unsupported JobSpy source.");
  const hoursOld = Math.max(1, Math.round(lookbackSeconds / 3_600));
  const { stdout } = await run(process.env.PYTHON_BIN || "python", [resolve(process.cwd(), "scripts", "jobspy_worker.py"), source, term, location, String(hoursOld)], { timeout: 90_000, maxBuffer: 2_000_000 });
  const listings = JSON.parse(stdout) as Listing[];
  if (!Array.isArray(listings) || !listings.length) throw new Error(`${source} returned no jobs.`);
  const fetchedAt = new Date().toISOString();
  return listings.map((job) => {
    const postedAt = iso(job.date_posted);
    return { id: `${source}:${createHash("sha256").update(job.url).digest("hex")}`, source, externalId: job.url, canonicalUrl: job.url, contentHash: createHash("sha256").update([job.title, job.company, job.location, job.description, postedAt].join("\u0000")).digest("hex"), title: job.title, company: job.company, companyLogoUrl: job.company_logo || null, location: job.location || null, country: /india/i.test(job.location) ? "India" : "India", category: null, jobType: job.job_type || null, salary: salary(job), description: job.description || null, postedAt, fetchedAt, active: true } satisfies Job;
  });
}
