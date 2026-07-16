-- Request Board — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.

-- ---------- Tables ----------

create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- The hex color IS the user's identity. Unique => no two active users share one.
  color      text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  -- todo | in_progress | review | done
  status       text not null default 'todo',
  -- A request is embedded on the card: it exists once requester_id is set.
  requester_id uuid references public.users(id) on delete set null,
  pic_id       uuid references public.users(id) on delete set null,
  notes        text not null default '',
  requested_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists cards_status_idx on public.cards (status);

-- ---------- Row Level Security ----------
-- This is a shared board with no per-user auth: everything is visible to all,
-- and anyone using the app (anon key) can read/write. Tighten later if needed.

alter table public.users enable row level security;
alter table public.cards enable row level security;

drop policy if exists "anon full access to users" on public.users;
create policy "anon full access to users"
  on public.users for all
  using (true) with check (true);

drop policy if exists "anon full access to cards" on public.cards;
create policy "anon full access to cards"
  on public.cards for all
  using (true) with check (true);

-- ---------- Realtime ----------
-- Let the client receive live inserts/updates/deletes.

alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.cards;

-- ---------- Seed cards (optional) ----------

insert into public.cards (title, description, status) values
  ('Landing page hero refresh', 'New hero copy + image for the Q3 campaign.', 'todo'),
  ('Pricing table A/B test',     'Set up experiment for the two pricing layouts.', 'todo'),
  ('Onboarding email sequence',  'Draft the 3-email welcome flow.', 'in_progress'),
  ('Analytics dashboard cleanup','Remove stale widgets, fix the funnel chart.', 'done')
on conflict do nothing;
