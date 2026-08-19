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
