# Storage migration

The migration copies objects between the private Supabase `audio` bucket and the configured Backblaze B2 bucket without deleting the source.

1. Keep `STORAGE_PROVIDER` pointed at the current provider and configure both providers' credentials in the API environment.
2. Run `npm run storage:migrate -- --from supabase --to b2` or the reverse direction.
3. Confirm the object count and byte total, then switch `STORAGE_PROVIDER` and redeploy the API.
4. Verify signed upload and playback URLs before removing old objects manually.

The script copies the `incoming/`, `tracks/`, `covers/`, and `promos/` prefixes, checks each downloaded object's size against the source listing, and keeps the source intact if the run fails. It uses memory for one object at a time, so run it from a machine with enough RAM for the largest stored object.

For a B2 target, `B2_KEY_ID`, `B2_APPLICATION_KEY`, and `B2_BUCKET` must be scoped to that private bucket. For Supabase, the service-role key must belong to the target project and `STORAGE_BUCKET` must name its private bucket.
