-- TruthPass persistence and sensor protocol v1.1.6
-- Apply this migration to Supabase project ref: isdoylgyneijwrzmemou

alter table if exists public.verification_history
  add column if not exists details jsonb;

create index if not exists verification_history_user_created_idx
  on public.verification_history (user_id, created_at desc);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

create table if not exists public.sensor_telemetry (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  sensor_id text not null,
  observed_at timestamptz not null default now(),
  metric text not null,
  value numeric not null,
  unit text not null,
  quality_status text not null default 'pending' check (quality_status in ('pending','accepted','rejected')),
  evidence_hash text,
  chain_tx_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sensor_telemetry_batch_time_idx
  on public.sensor_telemetry (batch_id, observed_at desc);

create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  check_id text not null unique,
  source_type text not null check (source_type in ('sensor','lab','agent','human')),
  source_id text not null,
  rule_version text not null,
  result text not null check (result in ('pass','fail','review')),
  score numeric,
  evidence_hash text not null,
  agent_run_hash text,
  chain_tx_hash text,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists quality_checks_batch_time_idx
  on public.quality_checks (batch_id, checked_at desc);

create table if not exists public.profit_ledger (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  entry_type text not null check (entry_type in ('raw_material','production','testing','logistics','platform','consumer_price','rebate','reserve')),
  amount numeric not null,
  currency text not null default 'CNY',
  disclosed_at timestamptz not null default now(),
  evidence_hash text,
  chain_tx_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists profit_ledger_batch_time_idx
  on public.profit_ledger (batch_id, disclosed_at desc);

alter table public.verification_history enable row level security;
alter table public.orders enable row level security;
alter table public.sensor_telemetry enable row level security;
alter table public.quality_checks enable row level security;
alter table public.profit_ledger enable row level security;

drop policy if exists verification_history_select_own on public.verification_history;
create policy verification_history_select_own on public.verification_history
  for select to authenticated using (user_id = auth.uid());

drop policy if exists verification_history_insert_own on public.verification_history;
create policy verification_history_insert_own on public.verification_history
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists verification_history_delete_own on public.verification_history;
create policy verification_history_delete_own on public.verification_history
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists sensor_telemetry_select_authenticated on public.sensor_telemetry;
create policy sensor_telemetry_select_authenticated on public.sensor_telemetry
  for select to authenticated using (true);

drop policy if exists quality_checks_select_authenticated on public.quality_checks;
create policy quality_checks_select_authenticated on public.quality_checks
  for select to authenticated using (true);

drop policy if exists profit_ledger_select_authenticated on public.profit_ledger;
create policy profit_ledger_select_authenticated on public.profit_ledger
  for select to authenticated using (true);
