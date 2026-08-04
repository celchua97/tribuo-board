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
  notes        text not null default '',
  requested_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists cards_status_idx on public.cards (status);

-- Multi-PIC support: a request can now be assigned to more than one person.
-- Migrate the old single pic_id column into a pic_ids array, then drop it.
do $$
begin
  alter table public.cards add column if not exists pic_ids uuid[] not null default '{}';
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'pic_id'
  ) then
    update public.cards set pic_ids = array[pic_id] where pic_id is not null and pic_ids = '{}';
    alter table public.cards drop column pic_id;
  end if;
end $$;

-- Arrays can't carry a normal foreign key, so mirror the old
-- "on delete set null" behaviour with a trigger: removing a user drops them
-- out of any pic_ids array that references them.
create or replace function public.strip_deleted_user_from_pic_ids() returns trigger as $$
begin
  update public.cards set pic_ids = array_remove(pic_ids, old.id) where old.id = any(pic_ids);
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_strip_deleted_user_from_pic_ids on public.users;
create trigger trg_strip_deleted_user_from_pic_ids
  before delete on public.users
  for each row execute function public.strip_deleted_user_from_pic_ids();

-- Due date: settable/adjustable by anyone at any time. due_date_set_at is
-- stamped the FIRST time a due date is assigned (not on later adjustments) —
-- it's the "how long before this got picked up" signal, so it must not reset
-- when someone later reschedules the deadline.
alter table public.cards add column if not exists due_date date;
alter table public.cards add column if not exists due_date_set_at timestamptz;
-- Archiving: manual, only meaningful once a card is Done. Cards with
-- archived_at set are excluded from the board and shown in History instead.
alter table public.cards add column if not exists archived_at timestamptz;

create index if not exists cards_archived_at_idx on public.cards (archived_at);

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

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  author_id  uuid references public.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_card_id_idx on public.comments (card_id);

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
alter table public.comments enable row level security;

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

drop policy if exists "anon full access to comments" on public.comments;
create policy "anon full access to comments"
  on public.comments for all
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

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ---------- Seed cards (optional) ----------

insert into public.cards (title, description, status) values
  ('Landing page hero refresh', 'New hero copy + image for the Q3 campaign.', 'todo'),
  ('Pricing table A/B test',     'Set up experiment for the two pricing layouts.', 'todo'),
  ('Onboarding email sequence',  'Draft the 3-email welcome flow.', 'in_progress'),
  ('Analytics dashboard cleanup','Remove stale widgets, fix the funnel chart.', 'done')
on conflict do nothing;
