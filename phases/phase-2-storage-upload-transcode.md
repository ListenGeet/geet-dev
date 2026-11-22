# Phase 2 · Storage, upload, transcoding

**Goal:** the spine of the product: a file goes in, a playable song comes out.
**Ships:** an admin uploads a file and, in under a minute, a `ready` track exists with full audio, a 40 s preview, a cover, and a real waveform.

## Read
Doc 14 (all) · doc 12 (storage, env) · doc 15 (Uploads, Worker, Catalogue `play` and `cover`) · doc 16 (workflows, GitHub setup) · doc 13 (tracks, track_files, upload_jobs)

## Build
- [ ] `api/src/lib/storage.ts` with Supabase and B2 implementations behind one interface; signed upload and download; key builders in `packages/shared`; unit tests against a fake S3.
- [ ] Upload endpoints (`POST /api/uploads`, `/complete`, `GET`, retry, delete own track), checks for `UPLOAD_MODE`, role, size, daily limit, rate limit.
- [ ] Worker endpoints (`claim`, `heartbeat`, `complete`, `fail`) using `claim_upload_job`; constant-time secret check.
- [ ] `worker/transcode.mjs`: dependency-free Node script, loop with budget, 3 lanes, ffprobe validation, full AAC 128 kbps, 40 s preview with fade, cover crop 600×600, 64-peak waveform, upload, complete/fail.
- [ ] Web upload metadata: pin `music-metadata@12.3.5` in `web`, parse the selected `File` with `parseBlob(file)`, and prefill editable title, artist, and album from embedded tags. Clean the filename when title is missing; allow manual entry when tags are absent or parsing fails. Do not query an online catalogue.
- [ ] `repository_dispatch` trigger sent from `/complete`; `transcode.yml` already in `.github/` (check it matches the script's env names).
- [ ] `GET /api/tracks/{id}/play` (preview for guests, full for signed-in), `GET /api/cover/{id}` (302, cacheable), egress recording.
- [ ] Minimal admin-only upload page (`/upload`) with progress and status polling (full design arrives in Phase 3/4; keep it plain but correct).
- [ ] Prevent duplicate song files: reserve a SHA-256 source digest atomically before issuing a signed upload URL; reject an existing/in-flight duplicate with 409 and verify the digest again in the worker.
- [ ] Seed script: 12 generated-tone songs (ffmpeg `sine`), no real music in the repo.
- [ ] `docs/storage-migration.md` and `npm run storage:migrate`.

## Do not build yet
Player, catalogue screens, playlists, reports.

## Acceptance
- [ ] Upload a real MP3 on dev: status goes Uploading → Queued → Processing → Ready; **measure the time from upload finish to Ready and write the number in the README** (target under 60 s).
- [ ] After Ready, show an upload-complete banner with the submitted title and artist plus the processed cover image or standard fallback.
- [ ] Verify embedded title/artist/album tags prefill the upload form; missing tags fall back to a cleaned filename for title and manual entry for artist/album.
- [ ] Confirm byte-identical files are skipped both against existing tracks and twice within a multi-file selection, including concurrent upload attempts; a different file remains uploadable.
- [ ] `incoming/…` is deleted after success; `full.m4a`, `preview.m4a`, `covers/…jpg` exist with the keys in doc 14.
- [ ] A corrupt file ends as Failed with a plain message and Retry works.
- [ ] Switching `STORAGE_PROVIDER` between `supabase` and `b2` on dev works for upload and playback URLs (same keys). B2 bucket CORS verified from the browser.
- [ ] A guest request to `/play` returns the preview URL; signed-in returns full. A forged worker call without the secret returns 401.
- [ ] A fork of the repo does not run `transcode.yml` (no `RUN_SCHEDULED`).

## Your decisions and accounts
- Create B2 buckets (`geet-dev-audio`, `geet-prod-audio`) as **private**, application keys limited to each bucket, CORS rules from doc 14. Keep the B2 spending cap at $0.
- GitHub: Environments `production` and `dev` with `API_URL`, `WORKER_SECRET`; variable `RUN_SCHEDULED=true`; a fine-grained token with only Actions write for `GH_DISPATCH_TOKEN` (doc 16 checklist).
- `UPLOAD_MODE=admin`.

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-2-storage-upload-transcode.md` and the docs it lists. Phases 0 and 1 are done. Build Phase 2 only. Run the verify command, then run a real upload on dev and report the time to Ready. Reply briefly: what changed, verify result, anything blocked.
