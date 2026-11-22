-- Track whether lyrics came from the uploader or an automatic provider lookup.
alter table public.track_lyrics
  add column if not exists source text not null default 'uploader'
  check (source in ('uploader', 'lrclib', 'lyrics_ovh'));
