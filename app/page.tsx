"use client";

import { useEffect, useMemo, useState } from "react";
import "./retry.css";
import "./filters.css";
import "./logos.css";

type Job = { id: string; title: string; company: string; companyLogoUrl: string | null; location: string | null; country: string | null; category: string | null; jobType: string | null; salary: string | null; postedAt: string | null; source: string; canonicalUrl: string };
type Source = { source: string; health: "healthy" | "degraded" | "stale"; lastSuccessAt: string | null; lastError: string | null };
type Stage = "new" | "saved" | "applied" | "interview" | "offer" | "dismissed";
type Triage = Record<string, { stage: Stage }>;
type Retry = { id: string; statusCode: number; state: "queued" | "dead_letter"; availableAt: string | null };

const stages: Stage[] = ["new", "saved", "applied", "interview", "offer", "dismissed"];
const keywordOptions = ["software engineer", "frontend developer", "backend developer", "full stack developer", "data scientist", "data analyst", "devops engineer", "product manager", "ui ux designer", "cyber security analyst"];
const sourceLabel = (source: string) => source;
const ago = (value: string | null) => value ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round((new Date(value).getTime() - Date.now()) / 3_600_000), "hour") : "Unknown";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState("");
  const [country, setCountry] = useState("India");
  const [search, setSearch] = useState("software engineer");
  const [activeSearch, setActiveSearch] = useState("");
  const [lookback, setLookback] = useState("86400");
  const [triage, setTriage] = useState<Triage>({});
  const [retries, setRetries] = useState<Retry[]>([]);
  const [retryDialog, setRetryDialog] = useState<Retry | null>(null);
  const [queueFlowSeen, setQueueFlowSeen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("India is selected by default. Run a live sync to load jobs.");
  const presetKeyword = keywordOptions.includes(search);

  const refresh = async () => {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (country) params.set("country", country);
    if (activeSearch.trim()) params.set("search", activeSearch.trim());
    const [jobsResponse, sourcesResponse, retryResponse] = await Promise.all([fetch(`/api/jobs?${params}`), fetch("/api/sources"), fetch("/api/retry/linkedin")]);
    if (jobsResponse.ok) setJobs((await jobsResponse.json()).jobs);
    if (sourcesResponse.ok) setSources((await sourcesResponse.json()).sources);
    if (retryResponse.ok) setRetries((await retryResponse.json()).retries);
  };

  useEffect(() => { void refresh(); }, [source, country, activeSearch]);
  useEffect(() => { const saved = localStorage.getItem("relay-triage"); if (saved) setTriage(JSON.parse(saved)); }, []);
  useEffect(() => { setQueueFlowSeen(localStorage.getItem("relay-queue-flow-seen") === "true"); }, []);
  const updateTriage = (id: string, next: Partial<Triage[string]>) => setTriage((current) => {
    const previous = current[id] ?? { stage: "new" as Stage };
    const value = { ...previous, ...next };
    const result = { ...current, [id]: value }; localStorage.setItem("relay-triage", JSON.stringify(result)); return result;
  });
  const sync = async () => {
    setSyncing(true); setNotice("Syncing live job sources...");
    try { const linkedIn = new URLSearchParams({ keywords: search || "software engineer", location: country || "India", lookback }); const responses = await Promise.all(["remotive", `linkedin?${linkedIn}`, "indeed", "wellfound"].map((source) => fetch(`/api/sync/${source}`, { method: "POST" }))); const results = await Promise.all(responses.map((response) => response.json())); const failed = results.filter((result) => result.status === "failed"); setNotice(`Fetched ${results.reduce((total, result) => total + result.fetched, 0)} live listings.${failed.length ? ` ${failed.length} source${failed.length === 1 ? "" : "s"} unavailable.` : ""}`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Sync failed."); }
    finally { setSyncing(false); }
  };
  const searchAll = async () => {
    setSyncing(true); setNotice("Searching all platforms...");
    try { const query = new URLSearchParams({ keywords: search || "software engineer", location: country || "India", lookback }); const responses = await Promise.all(["linkedin", "indeed", "wellfound", "remotive"].map((source) => fetch(`/api/sync/${source}?${query}`, { method: "POST" }))); const results = await Promise.all(responses.map((response) => response.json())); const failed = results.filter((result) => result.status === "failed"); setActiveSearch(search.trim()); setNotice(`Searched all platforms for “${search || "software engineer"}”.${failed.length ? ` ${failed.length} source${failed.length === 1 ? "" : "s"} unavailable.` : ""}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Search failed."); }
    finally { setSyncing(false); }
  };
  const testLinkedInFailure = async (statusCode: 403 | 404 | 429) => {
    const response = await fetch("/api/retry/linkedin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ statusCode }) });
    const result = await response.json(); if (response.ok) setRetryDialog(result.retry); setNotice(response.ok ? statusCode === 429 ? "LinkedIn 429 queued for a delayed direct retry." : `LinkedIn ${statusCode} sent to dead-letter review.` : result.error || "Failure test failed."); await refresh();
  };
  useEffect(() => { void sync(); }, []);
  const counts = useMemo(() => stages.reduce((total, stage) => ({ ...total, [stage]: Object.values(triage).filter((item) => item.stage === stage).length }), {} as Record<Stage, number>), [triage]);

  return <main>
    <header className="topbar"><a className="wordmark" href="#top">relay<span>.</span></a><p>Job ingestion and triage</p><button className="sync" type="button" onClick={sync} disabled={syncing}>{syncing ? "Syncing..." : "Run public sync"}</button></header>
    <section className="intro" id="top"><div><p className="eyebrow">Operations / live sources</p><h1>Find jobs.<br />Keep the signal.</h1></div><p className="lede">Live jobs from LinkedIn, Indeed, Wellfound, and Remotive. Triage is local to this browser.</p></section>
    <section className="metrics"><div><span>Visible jobs</span><strong>{jobs.length}</strong><small>{notice}</small></div><div><span>Saved / applied</span><strong>{counts.saved} / {counts.applied}</strong><small>Stored locally in this browser</small></div><div><span>Interviews / offers</span><strong>{counts.interview} / {counts.offer}</strong><small>Candidate workflow state</small></div></section>
    <section className="search-tools" aria-label="Job search"><label>Job keyword<select value={presetKeyword ? search : "__custom__"} onChange={(event) => setSearch(event.target.value === "__custom__" ? "" : event.target.value)}>{keywordOptions.map((keyword) => <option key={keyword} value={keyword}>{keyword}</option>)}<option value="__custom__">Custom keyword…</option></select></label>{!presetKeyword && <label>Custom keyword<input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. platform engineer" /></label>}<label>Posted within<select value={lookback} onChange={(event) => setLookback(event.target.value)}><option value="86400">Last 24 hours</option><option value="604800">Last 7 days</option><option value="2592000">Last month</option></select></label><label>Location<select value={country} onChange={(event) => setCountry(event.target.value)}><option>India</option><option value="">All countries</option></select></label><button className="sync" type="button" onClick={searchAll} disabled={syncing}>Search</button></section>
    <section className="inventory-filters" aria-label="Inventory filters"><label>Show results from<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">All platforms</option><option value="linkedin">LinkedIn</option><option value="indeed">Indeed</option><option value="wellfound">Wellfound</option><option value="remotive">Remotive</option></select></label></section>
    <section className="workspace"><div className="jobs-panel"><div className="section-head"><div><p className="eyebrow">Normalized inventory</p><h2>Job triage</h2></div><small>{jobs.length} result{jobs.length === 1 ? "" : "s"}</small></div><div className="job-list">{jobs.map((job) => { const item = triage[job.id] || { stage: "new" as Stage }; const initials = job.company.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase(); return <article className="job" key={job.id}><div className="job-title"><div className="company-heading"><span className="job-logo" aria-hidden="true"><span className="job-logo-fallback">{initials}</span>{job.companyLogoUrl && <img src={job.companyLogoUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span><div><strong>{job.canonicalUrl ? <a href={job.canonicalUrl} target="_blank" rel="noreferrer">{job.title}</a> : job.title}</strong><p>{job.company} <span>·</span> {sourceLabel(job.source)}</p></div></div><select value={item.stage} onChange={(event) => updateTriage(job.id, { stage: event.target.value as Stage })} aria-label={`Stage for ${job.title}`}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></div><dl><div><dt>Location</dt><dd>{job.location || "Remote"}</dd></div><div><dt>Category</dt><dd>{job.category || "Not supplied"}</dd></div><div><dt>Type</dt><dd>{job.jobType || "Not supplied"}</dd></div><div><dt>Salary</dt><dd>{job.salary || "Not supplied"}</dd></div><div><dt>Posted</dt><dd>{ago(job.postedAt)}</dd></div></dl></article>; })}{jobs.length === 0 && <p className="empty">No matching jobs. Try All countries or another platform.</p>}</div></div>
      <aside className="ops-panel"><div className="section-head"><div><p className="eyebrow">Source operations</p><h2>Signal health</h2></div><span className="live">Live</span></div><div className="source-list">{sources.filter((item) => item.source !== "glassdoor" && item.source !== "google").map((item) => { const retry = item.source === "linkedin" ? retries.find((entry) => entry.statusCode === 429) || retries[0] : null; return <article className="source" key={item.source}><i className={`status ${item.health}`} /><div><strong>{sourceLabel(item.source)}</strong><small>{item.lastError || (item.lastSuccessAt ? `Last sync ${ago(item.lastSuccessAt)}` : "Not synced yet")}</small>{retry && <button className={`retry-view${queueFlowSeen ? "" : " retry-view-attention"}`} type="button" onClick={() => { setQueueFlowSeen(true); localStorage.setItem("relay-queue-flow-seen", "true"); setRetryDialog(retry); }}>View queue flow</button>}</div><span className={item.health}>{item.health}</span>{item.source === "linkedin" && <details className="retry-tools"><summary>Test failure flow</summary><button type="button" onClick={() => testLinkedInFailure(429)}>429 rate limit</button><button type="button" onClick={() => testLinkedInFailure(403)}>403 forbidden</button><button type="button" onClick={() => testLinkedInFailure(404)}>404 not found</button></details>}</article>; })}</div><p className="run-note">Live results use direct public endpoints. The proxy-switch step is visual-only.</p></aside></section>
    {retryDialog && <div className="retry-dialog-backdrop" onClick={() => setRetryDialog(null)}><section className="retry-dialog" role="dialog" aria-modal="true" aria-label="LinkedIn retry flow" onClick={(event) => event.stopPropagation()}><button className="retry-close" type="button" onClick={() => setRetryDialog(null)}>Close</button><p className="eyebrow">LinkedIn / failure flow</p><h2>{retryDialog.statusCode} response</h2><div className={`retry-flow retry-flow-large ${retryDialog.state}`}><span>Request</span><i>→</i><span>{retryDialog.statusCode}</span><i>→</i><span>{retryDialog.state === "queued" ? "Retry queue" : "Dead-letter queue"}</span>{retryDialog.state === "queued" && <><i>→</i><span>Proxy switch (simulated)</span><i>→</i><span>Direct retry</span></>}</div><p>{retryDialog.state === "queued" ? `Queued until ${retryDialog.availableAt ? new Date(retryDialog.availableAt).toLocaleTimeString() : "the retry window"}. The proxy step is animation-only.` : "Stored in the dead-letter queue for review; access and missing-route errors are not retried automatically."}</p></section></div>}
  </main>;
}
