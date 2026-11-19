# 14 · Storage, uploads, and fast transcoding

## Storage abstraction (`api/src/lib/storage.ts`)
One interface, two implementations, chosen by `STORAGE_PROVIDER`:

```
interface Storage {
  signUpload(key, contentType, expiresSec = 900): { url, method, headers }
  signDownload(key, expiresSec): url
  remove(keys: string[]): void
  exists(key): { size } | null
  copy?(fromKey, toKey)          // used by the migration script
}
```

| | Supabase Storage (default) | Backblaze B2 |
|---|---|---|
| Bucket | Private bucket named `audio` (override `STORAGE_BUCKET`) | `B2_BUCKET` is the **bucket name**, not the id |
| API | Supabase Storage signed URLs | B2's S3-compatible API: `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_ENDPOINT`, signed `PUT` and `GET` |
| Access control | Signed URLs; RLS applies to Storage objects (not used since the bucket is private and server-signed) | **Credentials are the access control. Supabase RLS does not apply to B2 objects** |
| Browser CORS | Handled by Supabase | **Must set bucket CORS**: allow origins `https://listengeet.com`, `https://dev.listengeet.com`; methods GET, HEAD, PUT; headers `*`; expose `ETag`, `Content-Length`, `Content-Range`, `Accept-Ranges`; max age 3600 |

**Signed URL lifetimes**
| Kind | Lifetime |
|---|---|
| Upload | 15 minutes |
| Audio (full or preview) | 2 hours |
| Cover | 3 days |
| Worker download/upload | 20 minutes |

## Object keys (never change between providers)
| Key | Contents |
|---|---|
| `incoming/<user-id>/<track-id>` | Original uploaded file. **Deleted after successful processing** to save the free quota |
| `tracks/<track-id>/full.m4a` | Full audio, AAC-LC 128 kbps |
| `tracks/<track-id>/preview.m4a` | Guest preview, first 40 s |
| `covers/<track-id>.jpg` | Cover, 600×600 JPEG |
| `promos/<promo-id>.jpg` | Promo banner image (admin upload) |

Cover sizes 48/96/160/320 are not stored: the browser scales the 600 px image (a 600 px JPEG is about 40 to 60 KB, cheap enough; do not add an image service).

## Upload flow (bypasses the server)
1. **Create:** browser calls `POST /api/uploads` with metadata and file info (name, size, type). The API checks `UPLOAD_MODE`, role, size limit (`MAX_TRACK_MB`), daily limit, rate limit. It creates `tracks` (`status='uploading'`) and `upload_jobs` (`awaiting_upload`) and returns `{trackId, uploadUrl, headers}` for `incoming/<user-id>/<track-id>`, plus an optional signed upload URL for the cover.
2. **Upload:** the browser `PUT`s the file straight to storage with progress (XHR or fetch streams). Resumable multi-part is not needed under 50 MB.
3. **Complete:** `POST /api/uploads/{trackId}/complete`. The API verifies the object exists and its size matches, marks the job `queued`, and **immediately triggers the GitHub transcode workflow** (below). It returns at once; the client polls `GET /api/uploads/{trackId}` (or listens to a Realtime change on `tracks`) for status.
4. **Process:** the worker produces files, then calls complete. The track becomes `ready`, visible to everyone.
5. **Failure:** status `failed` with a plain-language `error`; user can Retry (re-queues, up to 3 attempts).

## The transcode worker (GitHub Actions, public repo)
Public-repo Actions minutes are free and unlimited on standard runners, which is why the worker lives there. Goal: **upload to ready in about 30 to 60 seconds**.

### Why it is fast
- **Triggered, not polled.** `POST /api/uploads/{id}/complete` sends a `repository_dispatch` event (`event_type: transcode`) to the GitHub REST API using `GH_DISPATCH_TOKEN`. The workflow starts in a few seconds. A cron schedule runs every 15 minutes only as a safety net (it also recovers expired job leases).
- **Tiny checkout.** `actions/checkout` with sparse checkout of only `worker/`, depth 1. No `npm ci`: the worker is a single dependency-free Node script using built-in `fetch` and `child_process`.
- **ffmpeg ready quickly.** Use the preinstalled ffmpeg if present (`command -v ffmpeg`), otherwise `apt-get install --no-install-recommends ffmpeg` (about 20 s). If this proves slow, switch to a cached static ffmpeg build through `actions/cache`. Measure once and record the number in the repo README.
- **One run drains the whole queue.** The script loops: claim a job, process, repeat until none are left (time budget 8 minutes), so uploads that arrive while a run is active do not wait for a new run. A `concurrency: { group: transcode, cancel-in-progress: false }` setting keeps one runner active and queues at most one more.
- **Parallel lanes.** Up to 3 jobs processed concurrently on the 4-vCPU public runner; within a job, `full`, `preview`, `cover`, and `waveform` are produced by ffmpeg invocations run in parallel.
- **Preview from the source in one pass** and **no loudness normalization** (too slow; maybe later).

### Worker ↔ API contract (the worker has no database or storage credentials)
All calls carry `Authorization: Bearer <WORKER_SECRET>`.

| Call | Purpose |
|---|---|
| `POST /api/worker/claim` | Atomically claims the next job (`claim_upload_job`, lease 5 min). Returns `{job, track, sourceUrl, uploads:{full, preview, cover}}` where each upload is a pre-signed PUT URL (20 min). Returns `204` if none |
| `POST /api/worker/heartbeat` | Extends the lease for long files |
| `POST /api/worker/complete` | Body: `{jobId, durationMs, waveform:[64 ints], files:{full:{size,codec,bitrate}, preview:{…}, cover:{size}|null}, tags:{title,artist,album}}`. API records `track_files`, deletes `incoming/…`, sets `tracks.status='ready'` |
| `POST /api/worker/fail` | Body `{jobId, error}` with a user-safe message |

### Worker steps for one job
1. Download the source from `sourceUrl` to a temp file.
2. `ffprobe`: require an audio stream; reject if duration over 15 minutes, no audio, or unsupported. Read tags (title, artist, album) as defaults.
3. Encode full: `ffmpeg -i src -vn -map_metadata -1 -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart full.m4a`
4. Encode preview: first 40 s with a 2 s fade-out at the end, same codec, faststart.
5. Cover: use the uploaded cover if given, else the embedded picture; center-crop to square, scale to 600×600, JPEG quality about 4. None found: skip (the app shows the fallback).
6. Waveform: decode to 8 kHz mono signed 16-bit raw, split into 64 equal windows, take the peak (or RMS) of each, normalize to 0 to 100.
7. Upload the outputs with `PUT` to the signed URLs, then call `complete`. On any error call `fail` with a plain-language message ("We couldn't read this file.").
8. Clean the temp directory.

### Security of the worker
- Secrets: only `WORKER_SECRET` and the API base URL are stored as GitHub Actions secrets in the repo. They are not exposed to workflows triggered by forks or pull requests. The transcode workflow triggers only on `repository_dispatch`, `schedule`, and `workflow_dispatch`, never on `pull_request`.
- The workflow is skipped on forks: `if: ${{ vars.RUN_SCHEDULED == 'true' }}` (the variable is set only in the real repo).
- Untrusted input: media files are processed by ffmpeg in a throwaway runner VM, which is the isolation boundary. Do not log metadata strings verbatim; strip all metadata from outputs.
- `GH_DISPATCH_TOKEN` is a fine-grained token with only "Actions: write" on this one repository, stored only in the API's Vercel env.
- The `claim` endpoint rejects wrong secrets in constant time and is rate limited.

### If you outgrow GitHub Actions
The worker is any process that can call the four endpoints and run ffmpeg. It can later move to a small free VM or a home server (you already run a home lab) with no changes to the API.

## Covers, promos, and lyrics
- **Cover URL for the app:** `GET /api/cover/{trackId}` returns a `302` to a signed cover URL with `Cache-Control: public, max-age=86400` so the browser and the service worker cache it. The web app rewrites `/api/cover/*` to the API so it stays same-origin for `sw.js` (doc 06).
- **Promo images:** admin uploads via signed URL to `promos/<id>.jpg`; the promos list endpoint returns signed image URLs valid 3 days, cached 1 hour.
- **Lyrics:** `GET /api/lyrics/{trackId}` returns `{plain, synced}` or `{lyrics: null}`, public for ready tracks, cached (the service worker keeps a copy).

## Egress estimation
Each time a download URL for audio is issued, `record_egress(provider, file size)` adds to `egress_daily`. This is an estimate (a user may not finish the file, or may seek). It is used for the admin meter and the cap rule in doc 12.

## Migration script (`npm run storage:migrate -- --from supabase --to b2`)
Lists objects under the four key prefixes, copies each (stream, no disk), verifies size, prints a report, and never deletes the source. After success the owner changes `STORAGE_PROVIDER` and redeploys.
