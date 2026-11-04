-- Every request the app makes to the X API (token exchange and refresh,
-- users/me, DM sends), so usage can be matched against X's billing.
-- Server-only (RLS enabled, no policies), like dm_sends.

create table if not exists public.x_api_calls (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('token_exchange', 'token_refresh', 'users_me', 'dm_send')),
  method text not null,
  endpoint text not null,
  account_id text references public.dm_accounts (id),
  recipient_user_id text,
  status integer, -- null when X never answered (timeout or network error)
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists x_api_calls_created_idx on public.x_api_calls (created_at);
create index if not exists x_api_calls_kind_idx on public.x_api_calls (kind, account_id);

alter table public.x_api_calls enable row level security;
