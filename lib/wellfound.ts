import { createHash } from "node:crypto";
import type { Job } from "./types";

const clean = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export async function fetchWellfoundJobs(term?: string): Promise<Job[]> {
  const slug = term?.trim() ? term.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "web-developer";
  const response = await fetch(`https://wellfound.com/role/${slug || "web-developer"}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Wellfound returned ${response.status}.`);
  const html = await response.text();
  const fetchedAt = new Date().toISOString();
  const jobs = [...html.matchAll(/href="\/company\/[^\"]+"[\s\S]{0,800}?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]{0,3000}?href="(\/jobs\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,1600}?)(?=href="\/company\/|$)/g)].map((match) => {
    const [company, path, title, details] = [clean(match[1]), match[2], clean(match[3]), clean(match[4])];
    const prior = html.slice(Math.max(0, (match.index || 0) - 1000), match.index || 0);
    const companyLogoUrl = [...prior.matchAll(/<img[^>]+src="([^"]+)/g)].at(-1)?.[1] || null;
    const canonicalUrl = `https://wellfound.com${path}`;
    return { id: `wellfound:${createHash("sha256").update(canonicalUrl).digest("hex")}`, source: "wellfound", externalId: path, canonicalUrl, contentHash: createHash("sha256").update([title, company, details].join("\u0000")).digest("hex"), title, company, companyLogoUrl: companyLogoUrl?.startsWith("/") ? `https://wellfound.com${companyLogoUrl}` : companyLogoUrl, location: /india/i.test(details) ? "India" : null, country: /india/i.test(details) ? "India" : null, category: null, jobType: /full-time/i.test(details) ? "Full-time" : null, salary: details.match(/(?:₹|\$)\s?[\d,.]+[^<]{0,30}/)?.[0] || null, description: null, postedAt: null, fetchedAt, active: true } satisfies Job;
  }).filter((job) => job.title && job.company);
  if (!jobs.length) throw new Error("Wellfound returned no recognizable jobs.");
  return jobs;
}
