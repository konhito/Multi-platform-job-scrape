import { createHash } from "node:crypto";
import type { Job } from "./types";

const text = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const match = (html: string, expression: RegExp) => text(html.match(expression)?.[1] || "");

export async function fetchLinkedInJobs(term = "software engineer", geo = { location: "India", id: "102713980" }, lookbackSeconds = 86_400, start = 0): Promise<Job[]> {
  const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
  const params = new URLSearchParams({ keywords: term, location: geo.location, f_TPR: `r${lookbackSeconds}`, start: String(start) });
  if (geo.id) params.set("geoId", geo.id);
  url.search = params.toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`LinkedIn returned ${response.status}.`);
  const html = await response.text();
  const fetchedAt = new Date().toISOString();
  const jobs = html.split(/<div class="base-card /).slice(1).map((card) => {
    const externalId = card.match(/jobPosting:(\d+)/)?.[1] || "";
    const canonicalUrl = match(card, /base-card__full-link[^>]+href="([^"]+)/);
    const title = match(card, /base-search-card__title">([\s\S]*?)<\/h3>/);
    const company = match(card, /base-search-card__subtitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const location = match(card, /job-search-card__location">([\s\S]*?)<\/span>/) || null;
    const postedAt = card.match(/<time[^>]+datetime="([^"]+)/)?.[1] || null;
    if (!externalId || !canonicalUrl || !title || !company) return null;
    const companyLogoUrl = (card.match(/data-delayed-url="([^"]+)/)?.[1] || card.match(/<img[^>]+src="([^"]+)/)?.[1] || "").replace(/&amp;/g, "&") || null;
    return { id: `linkedin:${externalId}`, source: "linkedin", externalId, canonicalUrl, contentHash: createHash("sha256").update([title, company, location, postedAt].join("\u0000")).digest("hex"), title, company, companyLogoUrl, location, country: /india/i.test(location || "") ? "India" : null, category: null, jobType: null, salary: null, description: null, postedAt: postedAt ? new Date(postedAt).toISOString() : null, fetchedAt, active: true } satisfies Job;
  }).filter((job): job is NonNullable<typeof job> => job !== null);
  if (!jobs.length) throw new Error("LinkedIn returned no recognizable jobs.");
  return jobs;
}
