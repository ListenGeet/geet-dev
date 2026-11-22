-- Phase 2: retain the expected payload size and MIME type until the worker takes over.
alter table public.upload_jobs
  add column if not exists expected_size bigint check (expected_size is null or expected_size > 0),
  add column if not exists source_content_type text;
