# Job Ingestion Assessment

This project demonstrates a resilient job-ingestion pipeline: scheduled source runs, discovery/detail extraction, normalization, deduplication, source health, and an operations dashboard.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the high-level design.
See [DECISIONS.md](DECISIONS.md) for the assessment's required design explanation.

## Why this does not use browser automation

Headless browsers, Playwright, and Selenium automate a browser; they do not provide permission to ingest a job platform's data or remove that platform's protections. Interactive job-search pages are designed for people and commonly lead automated runs into sign-in walls, CAPTCHA, email/phone verification, MFA, cookie-consent flows, or partial results. Using the logged-in path would require storing and operating an account, and that account's access is not a reusable public data feed.

These platforms can also identify and restrict automated traffic using signals such as request rate and timing, IP reputation, browser/device fingerprints, cookie and session state, JavaScript challenges, and non-human interaction patterns. Headless mode is only one signal: headed Playwright or Selenium is still automation and can receive a login page, challenge page, `429`, partial result set, or block page instead of job data. Proxy rotation, stealth plugins, fingerprint changes, and session reuse would be attempts to evade those controls, so this project deliberately does not use them.

Browser automation would also be operationally fragile: page markup and login flows change without notice, a browser run is much more expensive than a feed request, and a failed or partial UI response is hard to distinguish from a real empty result.

### Public guest URLs instead of login automation

When a platform intentionally exposes a public guest-search endpoint, the pipeline can use that endpoint conservatively for unauthenticated discovery. This is not the same as automating its normal job-search website: there is no browser login, interactive navigation, credential, cookie jar, or CAPTCHA-solving step.

#### LinkedIn

LinkedIn is the one non-sandbox job-network adapter included in the codebase. It uses the public guest-search endpoint:

```text
https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
```

The adapter sends a narrow keyword, location, and time-window query and extracts only public result-card fields: job ID, canonical public URL, title, company, location, and posted date. It does not request a member session or scrape a logged-in job-detail page. This gives the ingestion pipeline enough information to index a public listing and link the user back to its canonical source page without pretending to have member-only data.

The endpoint is not a promise of unlimited or permanent access. It can change, rate-limit, challenge, return different HTML, or stop returning public cards. The adapter treats an unrecognisable or empty card response as a failed source run rather than as proof that no jobs exist. The gateway uses low request limits, timeouts, validation, retry/backoff, and cooldowns; on failure it marks the source unhealthy and retains previously verified listings.

#### Indeed

Indeed search and job-detail pages are not used as a live scraper in this project. Their browser experience can be personalised by location and cookies, rendered dynamically, and can show consent, verification, login, or traffic-control flows. A Playwright/Selenium worker would have to load and interpret the changing UI, then decide whether the returned page is a result, an interstitial, or a block. That is unreliable, and retrying with different browser identities or proxies would be bypass behaviour.

The project therefore represents Indeed with a controlled sandbox adapter. It exercises the same normalization, deduplication, source-health, schema-change, and rate-limit paths as a real provider integration. Replacing it with a production adapter requires an official, licensed, or otherwise explicitly authorised Indeed feed—not a browser script.

#### Naukri

Naukri is likewise not collected through a browser session. Its interactive search flow may depend on user context, JavaScript state, and access controls, and detail pages may prompt for sign-in or present anti-automation measures. A successful manual page load is not evidence that a scheduled unattended worker has permission to collect it. Automating the login route would also create account-security responsibilities: credentials, MFA, session expiry, challenge recovery, and auditability.

For those reasons, Naukri remains a sandbox source in the assessment until a documented authorised feed is available. The real pipeline behaviour is still demonstrated safely: malformed results do not overwrite existing records, `429` responses trigger backoff, and repeated failures open a cooldown.

#### Wellfound

Wellfound is not driven through browser automation either. Public visibility of an individual page does not automatically create a supported bulk-ingestion interface. Search availability can vary by session, geography, consent state, and current product flow; a browser worker can be redirected to sign-in or verification instead of receiving consistent listing data. Parsing UI markup also couples the ingestion system to frontend redesigns rather than to a source contract.

Wellfound is therefore modelled as a sandbox provider. A future live adapter belongs behind the existing provider gateway only after an official API, licensed export, partnership feed, or written permission establishes the allowed access pattern and rate limits.

#### What the system does when public access changes

For every source, the pipeline validates the response before normalization. It never interprets a login page, CAPTCHA, block page, malformed HTML, or empty response as a successful zero-job sync. Instead it records the error, keeps the last verified records, exposes the source state in the operations UI, retries only within the configured backoff policy, and opens a cooldown after repeated failures. It never escalates to a headless browser, stored account, proxy rotation, fingerprint spoofing, or CAPTCHA-solving service.

In short: a public guest URL may be used only for the specific platform and discovery data it intentionally exposes. LinkedIn's JobGuest URL is not permission to collect from Indeed, Naukri, or Wellfound. Those platforms remain controlled sandbox sources until an official, licensed, or explicitly authorised feed is available.

## Rate-limit policy

When a source responds with `429 Too Many Requests`, the provider gateway:

1. Records the source as rate-limited and honors `Retry-After` when supplied.
2. Schedules one exponential-backoff retry.
3. Opens a cooldown after repeated failures.
4. Continues serving retained results and other authorized sources.

The system does not rotate proxies, sessions, or identities to bypass a provider's access limits. A production fallback is an approved alternative feed or a provider integration with explicit permission.

## Run locally

```powershell
npm.cmd install
$env:DATABASE_URL = "your Neon pooled connection string" # required to persist
npm.cmd run db:migrate
npm.cmd run dev
```

Open `http://localhost:3000`, select **Run public sync**, then use the sandbox controls to demonstrate `429`, schema-change, empty-response, and recovery behavior. The real source is Remotive and retains source attribution in each job record.

## Deploy

1. Create a Neon database and set `DATABASE_URL` in the deployment host.
2. Run `npm.cmd run db:migrate` once with that same value.
3. Deploy to Vercel and set a random `CRON_SECRET`. The included `vercel.json` runs the permitted-source sync every six hours; Vercel sends that secret as the cron request's bearer token.
4. Run one manual public sync in the deployed UI and confirm listings and source state persist after a refresh.

# Multi-platform-job-scrape

---

# Job Ingestion Platform - High-Level Design

## Goal

Ingest job listings from authorized public feeds or APIs, normalize them, preserve reliable search results, and make source health visible. The assessment demo uses one live permitted feed plus controlled sandbox adapters for LinkedIn, Indeed, Naukri, and Wellfound scenarios.

## Architecture

```text
                              ┌──────────────────────┐
                              │       Web UI          │
                              │ Jobs + Source Ops     │
                              └──────────┬───────────┘
                                         │ HTTPS
                              ┌──────────▼───────────┐
                              │     Backend API       │
                              │ /jobs /sources /runs  │
                              └───────┬───────┬──────┘
                                      │       │
                  read listings ─────┘       └───── manual sync request
                                      │
                           ┌──────────▼───────────┐
                           │    PostgreSQL DB      │
                           │ jobs, source_runs,    │
                           │ source_state          │
                           └──────────┬───────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │         Ingestion Orchestrator          │
                  │ scheduler + queue + sync run lifecycle  │
                  └───────────────────┬────────────────────┘
                                      │
             ┌────────────────────────▼────────────────────────┐
             │               Provider Gateway                    │
             │ allowlist · timeouts · per-source limits · logs  │
             │ retries/backoff · circuit breaker · validation    │
             └───────┬──────────────────┬───────────────────────┘
                     │                  │
        ┌────────────▼───────┐  ┌───────▼────────────────────┐
        │ Live permitted feed │  │ Sandbox provider adapters   │
        │ public API / RSS    │  │ LinkedIn · Indeed · Naukri  │
        └─────────────────────┘  │ Wellfound failure fixtures  │
                                 └────────────────────────────┘
```

## Components

### Web UI

- Searchable, filterable job listings.
- Source Operations panel: health, last sync, counts, last error, next retry.
- Sandbox controls to trigger success, rate-limit, empty-response, and schema-change scenarios.

### Backend API

```text
GET  /api/jobs?source=&search=&page=
GET  /api/sources
GET  /api/runs?source=
POST /api/sync/:source
POST /api/sandbox/:source/scenario
```

### Ingestion Orchestrator

- Starts an independent sync run per enabled source on a conservative schedule.
- Does not let one source failure block other sources.
- Records a `source_run` before and after each attempt.

### Provider Gateway

The policy boundary for every provider integration:

- Only enabled, authorized API/RSS sources may be called.
- Each source has a request limit, timeout, and retry policy.
- Validates raw responses before normalization.
- Opens a circuit breaker after repeated failures, then waits for a cooldown before retrying.
- Produces structured logs and source-health updates.

### Source Adapters

- `publicApi`: real permitted feed/API used in the deployed demo.
- `linkedinSandbox`, `indeedSandbox`, `naukriSandbox`, `wellfoundSandbox`: controlled fixtures that exercise the same ingestion contract and failure paths.
- A future official/licensed provider feed replaces only its adapter; the rest of the system remains unchanged.

## Sync Flow

```text
1. Scheduler starts a source sync run.
2. Gateway checks enabled status and cooldown.
3. Adapter fetches from its authorized feed or sandbox fixture.
4. Normalizer converts raw data to the common Job shape.
5. Validator rejects malformed records.
6. Dedupe/upsert writes new or changed jobs.
7. Metrics, errors, and source health are stored.
8. UI reads jobs and operational status through the API.
```

## Data Model

```text
Job
- id, source, externalId, canonicalUrl
- title, company, location, description
- postedAt, fetchedAt, rawPayloadHash

SourceState
- source, enabled, health
- lastSuccessAt, consecutiveFailures, cooldownUntil
- lastError

SourceRun
- id, source, startedAt, finishedAt, status
- fetchedCount, validCount, insertedCount, duplicateCount
- errorCode, errorMessage
```

Uniqueness: prefer `source + externalId`; fall back to a canonical URL hash.

## Failure Behaviour

```text
transient error       -> retry with exponential backoff
repeated failure      -> mark degraded, open circuit, cooldown
schema mismatch       -> mark stale, retain previous jobs, surface error
empty payload         -> flag suspicious, do not delete existing jobs
successful later sync -> restore health to healthy
```

## Source Lifecycle

```text
healthy
  └─ transient failure → retrying → healthy

healthy
  └─ repeated failure → degraded → circuit-open/cooldown
                                  └─ successful later sync → healthy

healthy
  └─ empty payload / schema mismatch → stale
                                      └─ retain old jobs + surface alert
```

## Demo Operations Screen

```text
[ Jobs search/filter table                            ]

[ Source Operations ]
Public RSS       Healthy    synced 2m ago   24 fetched
LinkedIn demo    Degraded   retry in 8m     429 rate limit
Indeed demo      Stale      schema mismatch last run

[ Trigger sandbox scenario: Success | 429 | Empty | Schema change ]
```

## Deployment

One deployable backend service serves the API and UI, backed by PostgreSQL. This is intentionally a single service for the assessment: it demonstrates the full ingestion lifecycle without unnecessary microservices.

## Compliance Boundary

The Provider Gateway supports authorized feeds, official or licensed APIs, and controlled sandbox data. It does not attempt to bypass CAPTCHA, account restrictions, platform terms, or bot-detection controls.

---

# Ingestion Decisions and Source Boundaries

## Why browser automation is not the collection strategy

Automating a job site's interactive web pages with a headless browser, Playwright, or Selenium is not a reliable or permitted substitute for a source integration. Playwright and Selenium control a browser; they do not grant an application access to a platform's data or remove the platform's controls.

Interactive job-search pages are designed for people and often sit behind an account flow. A run may be redirected to sign in, receive a login wall after a small number of results, or require CAPTCHA, email/phone verification, MFA, or consent prompts before it can continue. The credentialed path would require storing and operating a user or service account, and the resulting access would be account-scoped rather than a reusable public data feed.

Platforms can also detect and restrict automated traffic. Signals can include request volume and cadence, IP reputation, browser and device fingerprinting, cookie/session state, JavaScript challenges, and interaction patterns that differ from normal users. Headless mode is only one possible signal: running Playwright in headed mode or Selenium does not make automated collection authorised or dependable. A response can therefore become a challenge page, a login page, a partial result set, a `429`, or a block page instead of job data.

Trying to evade those controls with proxy rotation, stealth plugins, browser-fingerprint changes, or session reuse would be fragile and outside this project's compliance boundary. It also produces an operationally poor pipeline: UI markup and search flows change without notice, each browser run costs far more than a feed request, and failures are difficult to distinguish from a genuine empty result.

## Guest/public discovery URLs

Where a platform intentionally exposes a public guest-search endpoint, the pipeline may use that endpoint conservatively for unauthenticated discovery. This project uses LinkedIn's guest-search URL:

```text
https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
```

The adapter in `lib/linkedin.ts` sends a narrow search query to that URL and only extracts the public result-card fields needed for discovery. It does not submit credentials, persist cookies, drive the login UI, or work around an access control.

A guest URL is not a promise of unrestricted access. It can change, return a rate limit or challenge page, or be withdrawn. The gateway therefore applies low request limits, timeouts, validation, retry/backoff, and a cooldown. If it stops returning valid public cards, the run is marked unhealthy and the last verified listings remain available; the system does not escalate to browser automation.

Not every job platform has an equivalent guest endpoint, and this assessment does not claim that LinkedIn's URL authorises collection from Indeed, Naukri, or Wellfound. Those providers are represented by controlled sandbox adapters until an official, licensed, or otherwise explicitly authorised feed is available.

## Decision

Use authorised APIs, RSS feeds, licensed integrations, or explicitly public guest-discovery URLs when available. Treat browser-based login automation and bot-control evasion as unsupported. This keeps the ingestion pipeline observable, inexpensive, and compliant while preserving a clear replacement path for future approved provider adapters.
