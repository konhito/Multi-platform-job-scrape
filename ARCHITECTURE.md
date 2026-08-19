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

See [DECISIONS.md](DECISIONS.md) for why browser automation is not an alternative to authorised access, and how the LinkedIn public guest-search URL is bounded in this assessment.
