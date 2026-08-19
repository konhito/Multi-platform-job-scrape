import { createHash } from "node:crypto";
import type { Job } from "./types";

type RemotiveListing = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  candidate_required_location?: string;
  category?: string;
  job_type?: string;
  salary?: string;
  description?: string;
  publication_date?: string;
};

type RemotiveResponse = { jobs?: RemotiveListing[] };

export async function fetchRemotiveJobs(limit = 20, term?: string): Promise<Job[]> {
  const search = term?.trim() ? `&search=${encodeURIComponent(term.trim())}` : "";
  const response = await fetch(`https://remotive.com/api/remote-jobs?category=software-dev&limit=${limit}${search}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Remotive returned ${response.status}.`);

  const body = await response.json() as RemotiveResponse;
  if (!Array.isArray(body.jobs) || body.jobs.length === 0) throw new Error("Remotive returned no jobs.");
  const fetchedAt = new Date().toISOString();

  return body.jobs.map((listing) => {
    const description = listing.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
    const contentHash = createHash("sha256")
      .update([listing.title, listing.company_name, listing.candidate_required_location, description, listing.publication_date].join("\u0000"))
      .digest("hex");
    return {
      id: `remotive:${listing.id}`,
      source: "remotive",
      externalId: String(listing.id),
      canonicalUrl: listing.url,
      contentHash,
      title: listing.title,
      company: listing.company_name,
      companyLogoUrl: listing.company_logo || null,
      location: listing.candidate_required_location || null,
      country: /india/i.test(listing.candidate_required_location || "") ? "India" : null,
      category: listing.category || null,
      jobType: listing.job_type || null,
      salary: listing.salary || null,
      description,
      postedAt: listing.publication_date ? new Date(listing.publication_date).toISOString() : null,
      fetchedAt,
      active: true
    };
  });
}
