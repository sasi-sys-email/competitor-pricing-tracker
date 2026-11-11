-- Competitor pricing tracker: pages, baseline snapshots, and checks.
-- Authenticated users can read and write only their own rows.
-- Run this file in the Supabase SQL editor (or supabase db push).
-- The app sets request.jwt.claim.sub and SET LOCAL ROLE authenticated
-- for user requests, which is what auth.uid() reads. Cron connects as a
-- role that bypasses RLS (the Supabase postgres user).

create extension if not exists pgcrypto;

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now(),
  constraint pages_https check (url ~ '^https://[^[:space:]]+$'),
  constraint pages_user_url unique (user_id, url)
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_text text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  diff_removed jsonb not null default '[]'::jsonb,
  diff_added jsonb not null default '[]'::jsonb,
  error_message text,
  email_sent boolean not null default false,
  checked_at timestamptz not null default now(),
  constraint checks_status check (status in ('no_change', 'changed', 'fetch_error'))
);

create index pages_user_id_idx on public.pages (user_id);
create index snapshots_page_created_idx on public.snapshots (page_id, created_at desc);
create index checks_page_checked_idx on public.checks (page_id, checked_at desc);

create or replace function public.enforce_page_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.pages where user_id = new.user_id) >= 10 then
    raise exception 'PAGE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger pages_enforce_limit
  before insert on public.pages
  for each row
  execute function public.enforce_page_limit();

alter table public.pages enable row level security;
alter table public.snapshots enable row level security;
alter table public.checks enable row level security;

create policy pages_select on public.pages
  for select to authenticated
  using (user_id = auth.uid());

create policy pages_insert on public.pages
  for insert to authenticated
  with check (user_id = auth.uid());

create policy pages_delete on public.pages
  for delete to authenticated
  using (user_id = auth.uid());

create policy snapshots_select on public.snapshots
  for select to authenticated
  using (user_id = auth.uid());

create policy snapshots_insert on public.snapshots
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.pages p
      where p.id = page_id and p.user_id = auth.uid()
    )
  );

create policy checks_select on public.checks
  for select to authenticated
  using (user_id = auth.uid());

create policy checks_insert on public.checks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.pages p
      where p.id = page_id and p.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated;
grant select, insert, delete on public.pages to authenticated;
grant select, insert on public.snapshots to authenticated;
grant select, insert on public.checks to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select, insert, update, delete on public.pages to service_role;
    grant select, insert, update, delete on public.snapshots to service_role;
    grant select, insert, update, delete on public.checks to service_role;
  end if;
end $$;
