create table if not exists jobs (
  id text primary key,
  source text not null,
  external_id text not null,
  canonical_url text not null,
  content_hash text not null,
  title text not null,
  company text not null,
  company_logo_url text,
  location text,
  country text,
  category text,
  job_type text,
  salary text,
  description text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  unique (source, external_id)
);

alter table jobs add column if not exists country text;
alter table jobs add column if not exists company_logo_url text;
alter table jobs add column if not exists category text;
alter table jobs add column if not exists job_type text;
alter table jobs add column if not exists salary text;

create table if not exists source_state (
  source text primary key,
  enabled boolean not null default true,
  health text not null default 'healthy',
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  cooldown_until timestamptz,
  last_error text
);

create table if not exists crawl_runs (
  id text primary key,
  source text not null references source_state(source),
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  discovered_count integer not null default 0,
  fetched_count integer not null default 0,
  parsed_count integer not null default 0,
  rejected_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_message text
);

create table if not exists retry_queue (
  id text primary key,
  source text not null references source_state(source),
  status_code integer not null,
  state text not null,
  attempts integer not null default 0,
  available_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
