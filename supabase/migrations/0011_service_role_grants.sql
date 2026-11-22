-- The API uses the service role for trusted reads and writes after request
-- authorization. RLS remains enabled; anon/authenticated receive no access to
-- server-only data. Supabase's service role bypasses RLS but still needs SQL
-- object privileges, which are not guaranteed for manually created tables.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Keep future migrations' tables and sequences usable by the trusted API role.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
