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
