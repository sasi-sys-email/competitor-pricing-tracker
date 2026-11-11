-- Local Postgres stand-in for the Supabase auth schema.
-- Do not run this on a Supabase project. `npm run db:setup` applies it
-- only to a local database named pricing_tracker (or *_test).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'aud'
  ) then
    raise exception 'Refusing to run local bootstrap on a Supabase database';
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

do $$
begin
  execute format('grant authenticated to %I', current_user);
exception
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;

create schema if not exists local_auth;

revoke all on schema local_auth from public;

create table if not exists local_auth.magic_links (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
