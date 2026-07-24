-- Request Board — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run in full any time you pull a new version of this file — every
-- statement below is idempotent (create-if-not-exists, drop-then-create for
-- policies, and a guarded check before adding tables to realtime).

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

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards(id) on delete cascade,
  -- 'file' = uploaded to the card-attachments storage bucket, 'link' = external URL only.
  kind         text not null check (kind in ('file', 'link')),
  name         text not null,
  url          text not null,
  mime_type    text,
  -- Storage object path, so we can delete the underlying file when the
  -- attachment (or its card) is removed. Null for 'link' attachments.
  storage_path text,
  added_by     uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists attachments_card_id_idx on public.attachments (card_id);

-- ---------- Storage bucket for file attachments ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('card-attachments', 'card-attachments', true, 10485760) -- 10 MB per file
on conflict (id) do nothing;

-- ---------- Row Level Security ----------
-- This is a shared board with no per-user auth: everything is visible to all,
-- and anyone using the app (anon key) can read/write. Tighten later if needed.

alter table public.users enable row level security;
alter table public.cards enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "anon full access to users" on public.users;
create policy "anon full access to users"
  on public.users for all
  using (true) with check (true);

drop policy if exists "anon full access to cards" on public.cards;
create policy "anon full access to cards"
  on public.cards for all
  using (true) with check (true);

drop policy if exists "anon full access to attachments" on public.attachments;
create policy "anon full access to attachments"
  on public.attachments for all
  using (true) with check (true);

drop policy if exists "anon full access to card-attachments storage" on storage.objects;
create policy "anon full access to card-attachments storage"
  on storage.objects for all
  using (bucket_id = 'card-attachments')
  with check (bucket_id = 'card-attachments');

-- ---------- Realtime ----------
-- Let the client receive live inserts/updates/deletes. Guarded so re-running
-- this file doesn't error on tables already added to the publication.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cards'
  ) then
    alter publication supabase_realtime add table public.cards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;

-- ---------- Seed cards (optional) ----------

insert into public.cards (title, description, status) values
  ('Landing page hero refresh', 'New hero copy + image for the Q3 campaign.', 'todo'),
  ('Pricing table A/B test',     'Set up experiment for the two pricing layouts.', 'todo'),
  ('Onboarding email sequence',  'Draft the 3-email welcome flow.', 'in_progress'),
  ('Analytics dashboard cleanup','Remove stale widgets, fix the funnel chart.', 'done')
on conflict do nothing;
