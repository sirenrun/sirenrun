/**
 * Postgres schema for the indexer. Everything here is derived from program events or from
 * anonymous page visits; nothing is needed to settle a run, which stays fully onchain.
 * Amounts are tUSDC base units (6 decimals) as `numeric`, so sums never overflow.
 * Every statement is idempotent, so `migrate` runs on every start.
 */
export const SCHEMA = /* sql */ `
create table if not exists runs (
  arena smallint not null,
  nonce integer not null,
  runner text not null,
  entry_fee numeric not null default 0,
  bond numeric not null default 0,
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  t integer,
  outcomes text[],
  runner_fees numeric,
  runner_paid numeric,
  primary key (arena, nonce)
);
create index if not exists runs_runner on runs (runner);

create table if not exists trades (
  signature text not null,
  market smallint not null,
  arena smallint not null,
  nonce integer not null,
  side text not null,
  owner text not null,
  amount numeric not null,
  net numeric not null,
  shares numeric not null,
  at timestamptz not null default now(),
  primary key (signature, market)
);
create index if not exists trades_owner on trades (owner);
create index if not exists trades_run on trades (arena, nonce);
create index if not exists trades_at on trades (at);

create table if not exists claims (
  signature text not null,
  owner text not null,
  arena smallint not null,
  nonce integer not null,
  market smallint not null,
  paid numeric not null,
  at timestamptz not null default now(),
  primary key (signature, owner, arena, nonce, market)
);
create index if not exists claims_owner on claims (owner);

create table if not exists nitros (
  signature text primary key,
  arena smallint not null,
  nonce integer not null,
  runner text not null,
  fee numeric not null,
  at timestamptz not null default now()
);

-- Anonymous visitors: a random id the browser keeps, never an IP or user agent.
create table if not exists visitors (
  id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visits integer not null default 1
);

-- Wallets that connected to the app, whether or not they played.
create table if not exists wallets (
  address text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists indexer_state (
  key text primary key,
  value text not null
);
`;
