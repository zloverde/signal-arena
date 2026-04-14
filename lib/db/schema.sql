-- ============================================================
-- Signal Arena — Supabase Database Schema
-- Run this in Supabase SQL Editor to initialize the database
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- Agents
-- ============================================================
create table if not exists agents (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  api_key text not null unique,
  email text,
  created_at timestamptz default now(),
  reputation_score numeric default 1000,
  total_rounds integer default 0,
  total_wins integer default 0
);

create index if not exists idx_agents_api_key on agents(api_key);

-- ============================================================
-- Wallets
-- ============================================================
create table if not exists wallets (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references agents(id) on delete cascade,
  balance numeric not null default 1000, -- starting credits
  address text, -- future onchain wallet address
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_wallets_agent_id on wallets(agent_id);

-- ============================================================
-- Rounds
-- ============================================================
create table if not exists rounds (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'locked', 'resolved', 'cancelled')),
  regime text not null check (regime in ('stable_trend', 'mean_reversion', 'shock_event')),
  theta numeric not null check (theta >= 0.01 and theta <= 0.99),
  outcome integer check (outcome in (0, 1)),
  entry_fee numeric not null default 5,
  min_stake numeric not null default 10,
  max_stake numeric not null default 100,
  platform_fee_pct numeric not null default 0.05,
  prize_pool numeric not null default 0,
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  resolves_at timestamptz,
  category text not null default 'general',
  source_drift_seed integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_rounds_status on rounds(status);
create index if not exists idx_rounds_opens_at on rounds(opens_at);

-- ============================================================
-- Signals
-- ============================================================
create table if not exists signals (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  source_family text not null check (source_family in ('trend', 'fundamental', 'contrarian', 'insider', 'meta_reliability')),
  visibility text not null check (visibility in ('public', 'private', 'purchasable')),
  raw_estimate numeric not null,
  hidden_reliability numeric not null, -- never exposed via API
  visible_reliability_hint numeric not null,
  noise_level numeric not null,
  cost numeric not null default 0,
  message_text text not null,
  is_trap boolean not null default false
);

create index if not exists idx_signals_round_id on signals(round_id);
create index if not exists idx_signals_visibility on signals(visibility);

-- ============================================================
-- Private signal assignments
-- ============================================================
create table if not exists private_signal_assignments (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  signal_id uuid not null references signals(id) on delete cascade,
  delivered_at timestamptz default now(),
  unique(round_id, agent_id, signal_id)
);

create index if not exists idx_psa_round_agent on private_signal_assignments(round_id, agent_id);

-- ============================================================
-- Entries (submissions)
-- ============================================================
create table if not exists entries (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  probability_estimate numeric not null check (probability_estimate >= 0.01 and probability_estimate <= 0.99),
  stake numeric not null,
  fee_paid numeric not null default 0,
  submitted_at timestamptz default now(),
  unique(round_id, agent_id)
);

create index if not exists idx_entries_round_id on entries(round_id);
create index if not exists idx_entries_agent_id on entries(agent_id);

-- ============================================================
-- Purchases
-- ============================================================
create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  signal_id uuid not null references signals(id) on delete cascade,
  price_paid numeric not null,
  purchased_at timestamptz default now(),
  unique(round_id, agent_id, signal_id)
);

-- ============================================================
-- Outcomes
-- ============================================================
create table if not exists outcomes (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null unique references rounds(id) on delete cascade,
  realized_y integer not null check (realized_y in (0, 1)),
  theta numeric not null,
  regime text not null,
  resolved_at timestamptz default now()
);

-- ============================================================
-- Payouts
-- ============================================================
create table if not exists payouts (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  raw_score numeric not null,
  normalized_score numeric not null,
  payout_amount numeric not null,
  profit_loss numeric not null,
  created_at timestamptz default now()
);

create index if not exists idx_payouts_agent_id on payouts(agent_id);
create index if not exists idx_payouts_round_id on payouts(round_id);

-- ============================================================
-- Leaderboard (materialized view / snapshot table)
-- Updated after each round resolution
-- ============================================================
create table if not exists leaderboard_snapshots (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references agents(id) on delete cascade,
  agent_name text not null,
  total_rounds integer not null default 0,
  total_staked numeric not null default 0,
  total_profit numeric not null default 0,
  roi numeric not null default 0,
  avg_score numeric not null default 0,
  calibration_error numeric not null default 0, -- mean squared error
  reputation_score numeric not null default 1000,
  rank integer,
  updated_at timestamptz default now()
);

create unique index if not exists idx_leaderboard_agent_id on leaderboard_snapshots(agent_id);

-- ============================================================
-- Admin notes / audit log
-- ============================================================
create table if not exists admin_events (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  round_id uuid references rounds(id),
  agent_id uuid references agents(id),
  details jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security (RLS)
-- In production, enable RLS and set proper policies.
-- For MVP/local dev, leave disabled.
-- ============================================================
-- alter table agents enable row level security;
-- (add policies as needed when deploying to production)

-- ============================================================
-- Helper: update wallet timestamp trigger
-- ============================================================
create or replace function update_wallet_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger wallet_updated
  before update on wallets
  for each row execute function update_wallet_timestamp();
