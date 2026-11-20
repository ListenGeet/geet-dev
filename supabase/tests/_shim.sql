-- Test-only. Plain Postgres (CI) has none of what Supabase provides, so this recreates the parts the
-- migrations rely on: the three API roles, auth.jwt(), default grants, and a few helpers for the tests.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create schema if not exists extensions;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;

-- Act as a signed-in user (Clerk sub), as anon, or back as the superuser. Lasts for the transaction.
create or replace function t.as_user(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;
create or replace function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role';
end $$;
create or replace function t.as_super() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Runs a statement and returns the SQLSTATE it fails with, or 'ok'.
create or replace function t.sqlstate_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function t.sqlstate_of(text) to anon, authenticated, service_role;

create or replace function t.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ASSERT FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
grant execute on function t.assert(boolean, text) to anon, authenticated, service_role;
