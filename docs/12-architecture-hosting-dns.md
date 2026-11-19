# 12 · Architecture, hosting, DNS, free-tier budget

## Picture

```
                     Cloudflare DNS (listengeet.com)
   listengeet.com ─────────────┐        api.listengeet.com ─────┐
   dev.listengeet.com ─────┐   │        dev-api.listengeet.com ─┤
                           ▼   ▼                                ▼
                     Vercel: geet-web                     Vercel: geet-api
                     (Next.js, PWA, SW)                   (Next.js, API only)
                       │   │  Clerk (sign-in UI + JWT)         │
                       │   └──────── Bearer token ────────────►│  verifies Clerk JWT
                       │                                       │  service-role to Supabase
   Realtime (chat, jams)│                                       ├──► Supabase Postgres (RLS)
   Clerk token ─────────┴──► Supabase Realtime                  ├──► Storage: B2 or Supabase Storage
                                                                ├──► NVIDIA NIM (assistant)
   Browser ◄──── signed URLs (audio, covers, uploads) ──────────┘
                                                                ▲
              GitHub Actions: transcode worker ── WORKER_SECRET ┘  (public repo, ffmpeg)
```

Key properties:
- **Uploads and playback bypass the server.** The browser PUTs to storage with a signed URL and plays from a signed URL. The API only signs and records.
- **Two Vercel projects from one repo:** `geet-web` (root directory `web/`) and `geet-api` (root directory `api/`).
- **Realtime goes browser to Supabase directly** (chat messages, jam state, friend changes) using the Clerk token and RLS. Everything else goes through the API.
- **The worker never holds database or storage credentials.** It talks only to the API with `WORKER_SECRET` and receives pre-signed URLs.

## Domains and environments

| Environment | Web | API | Branch | Supabase | Bucket | Clerk |
|---|---|---|---|---|---|---|
| Production | `listengeet.com` (`www` redirects to apex) | `api.listengeet.com` | `main` | `geet-prod` | `geet-prod-audio` | Production instance |
| Dev | `dev.listengeet.com` | `dev-api.listengeet.com` | `dev` | `geet-dev` | `geet-dev-audio` | Development instance |

Free Supabase gives **2 active projects**, exactly prod and dev. The dev app shows a visible banner "DEV" (a 4 px `danger` bar at the very top) so nobody mistakes it for production, and sets `noindex`.

### Cloudflare DNS records
| Name | Type | Target | Proxy |
|---|---|---|---|
| `@` | A / CNAME (flattened) | Vercel (as shown in the Vercel domain panel) | **DNS only** (grey cloud) |
| `www` | CNAME | `cname.vercel-dns.com` (as Vercel shows) | DNS only |
| `api` | CNAME | Vercel (as shown) | DNS only |
| `dev` | CNAME | Vercel | DNS only |
| `dev-api` | CNAME | Vercel | DNS only |
| Clerk records (`clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) | CNAME | As Clerk's dashboard lists for the production instance | **DNS only** (required) |
| `cdn` (optional, Stage 2 below) | CNAME | B2 S3 endpoint host | **Proxied** (orange) |
| Resend records (SPF, DKIM, `send` return-path MX), `_dmarc`, root MX for Cloudflare Email Routing | TXT / CNAME / MX | As Resend and Cloudflare show; DMARC per doc 20 | **DNS only** |

Reason for DNS only on Vercel records: Vercel terminates TLS and has its own CDN; proxying through Cloudflare adds a second layer with caching and SSL-mode pitfalls. Cloudflare is used here for DNS, and (optionally) for the free B2 egress path.

### CORS
API allows only: `https://listengeet.com`, `https://dev.listengeet.com`, plus `http://localhost:3000` in development (list in env `CORS_ORIGINS`). Methods GET POST PATCH PUT DELETE OPTIONS; headers Authorization, Content-Type; no cookies are used so credentials mode is off. Preflight cached 1 day.

### Auth
- Clerk handles sign-in on the web app. The web app obtains a **session token** and sends it as `Authorization: Bearer` to the API.
- The API verifies the token with Clerk's backend SDK (`CLERK_SECRET_KEY`, authorized parties = the web origins) and maps `sub` to a profile through the `identities` table, creating the profile on first call.
- Supabase **third-party auth with Clerk**: the Clerk token is accepted by Supabase for Realtime and RLS (`public.uid()` reads `auth.jwt()->>'sub'`). Setup: Clerk dashboard → Integrations → Supabase (adds the `role: authenticated` claim); Supabase dashboard → Authentication → Third-party → add Clerk with the Clerk domain.
- Web has no Clerk-protected server routes; guest mode means every page renders without a session. Clerk middleware runs only to support its handshake.

## Environment variables

**Never commit real values. The repo carries `.env.example` with dummy values.**

| Variable | web | api | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✔ | ✔ | e.g. `https://listengeet.com` |
| `NEXT_PUBLIC_API_URL` | ✔ | | `https://api.listengeet.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✔ | ✔ | |
| `CLERK_SECRET_KEY` | ✔ | ✔ | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | ✔ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔ | ✔ | Realtime, RLS client |
| `SUPABASE_SERVICE_ROLE_KEY` | | ✔ | Server only. Bypasses RLS: authorize in code first |
| `STORAGE_PROVIDER` | | ✔ | `supabase` (default) or `b2` |
| `STORAGE_BUCKET` | | ✔ | Supabase bucket name, default `audio` |
| `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT` | | ✔ | `B2_BUCKET` is the **name**, not the id. Endpoint like `https://s3.<region>.backblazeb2.com` |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MODEL_FALLBACK` | | ✔ | Doc 08 |
| `AI_DAILY_LIMIT`, `AI_GLOBAL_RPM` | | ✔ | Defaults 30 and 30 |
| `CRON_SECRET` | | ✔ | Min 24 chars. Guards `/api/cron/*` |
| `ADMIN_EMAILS` | | ✔ | Comma separated |
| `CORS_ORIGINS` | | ✔ | Comma separated |
| `WORKER_SECRET` | | ✔ | Shared with the GitHub transcode workflow |
| `GH_DISPATCH_TOKEN`, `GH_REPO` | | ✔ | Fine-grained token with only Actions: write on this repo; `owner/name` |
| `UPLOAD_MODE` | | ✔ | `admin` (recommended start), `approved`, `anyone` |
| `MAX_TRACK_MB`, `MAX_UPLOADS_PER_DAY` | | ✔ | 50 and 5 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | | ✔ | Web Push |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CLERK_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET` | | ✔ | Email (doc 20) |
| `EMAIL_FROM_SECURITY`, `EMAIL_FROM_HELLO`, `EMAIL_FROM_MARKETING`, `EMAIL_FROM_COPYRIGHT`, `EMAIL_FROM_ALERTS`, `EMAIL_REPLY_TO_SUPPORT` | | ✔ | Full `Name <address>` values |
| `MARKETING_DAILY_CAP`, `MARKETING_POSTAL_ADDRESS`, `ADMIN_DIGEST`, `EMAIL_DEV_ALLOWLIST` | | ✔ | Doc 20 |
| `REQUIRE_ENV` | ✔ | ✔ | When `1`, the build fails on missing required variables (CI sets it with dummy values) |

Rule: a missing required variable fails the **build** when `REQUIRE_ENV=1` and fails the **request** with a clear log line otherwise. Never fall back to insecure defaults.

## Free-tier budget (checked November 2026)

| Service | Free allowance | What it means for Geet | Risk |
|---|---|---|---|
| **Vercel Hobby** | 100 GB fast data transfer, 1M function invocations, 1M CDN requests, 4 CPU-hours, functions up to 300 s, 100 deployments/day, 200 projects, 50 domains per project | Plenty: audio does not pass through Vercel | Hobby is for **non-commercial** use. Cron believed limited to once per day (verify). Covers proxied through rewrite count as origin transfer |
| **Supabase Free** | 500 MB database, 1 GB storage, 5 GB egress (+5 GB cached), 50,000 MAU, 200 concurrent Realtime connections, 2M Realtime messages/month, 50 MB max upload, 2 active projects, **pauses after 1 week of inactivity** | Database: tens of thousands of tracks. Storage as audio store only about 230 songs, so use B2 | Pausing → keepalive job (daily Vercel cron plus GitHub workflow). 50 MB file cap applies to uploads |
| **Backblaze B2** | First 10 GB storage free; egress free up to 3× average stored data per month; unlimited free egress through partners such as Cloudflare; Class A, B, C API calls free | About 2,300 songs at ~4.3 MB each (full 128 kbps + preview + cover) | Egress above 3× costs $0.01/GB: use Stage 2 (Cloudflare) before traffic grows |
| **Clerk Hobby** | 50,000 monthly retained users; email/password, social, magic links, email and SMS OTP; basic orgs; webhooks | Enough. Branding on Clerk components is not removable on free | No MFA, no custom session length |
| **NVIDIA NIM (build.nvidia.com)** | Free API, reported about 40 requests/minute | Assistant limit: 30 msgs/user/day and 30 global RPM guard | Rate limits and model availability can change; fallback model configured |
| **Resend Free** | 3,000 emails/month, **100/day**, 3 domains (use `listengeet.com` and `dev.listengeet.com`), 1 webhook endpoint, 30-day retention | Enough for codes, welcome, alerts and a small newsletter | The daily cap is shared with email-code sign-ins: make Google the primary sign-in. Marketing is capped (doc 20) |
| **GitHub Actions** | Unlimited minutes for **public** repos on standard runners | Transcode, CI, backups, keepalive cost nothing | Scheduled workflows are delayed; disabled after 60 days of repo inactivity (a commit or a manual run re-enables) |
| **Cloudflare** | Free DNS, free proxy and CDN | DNS and optional audio CDN | |

### Capacity sanity check
One song: full AAC 128 kbps ≈ 1 MB per minute, so 3.5 min ≈ 3.5 MB; preview 40 s ≈ 0.65 MB; cover ≈ 60 KB. Total ≈ 4.3 MB.
- B2 10 GB ⇒ ≈ 2,300 songs.
- B2 egress without Cloudflare: with 5 GB stored, 15 GB per month free ⇒ ≈ 4,300 full plays per month. Past that: $0.01/GB, or use Stage 2.
- Supabase Storage egress 5 GB ⇒ ≈ 1,400 full plays per month. This is why it is the "fast switch" fallback, not the default.

### Stage 2 (do when traffic grows): free egress through Cloudflare
Put `cdn.listengeet.com` (proxied through Cloudflare) in front of the B2 S3 endpoint and sign download URLs against that host. Cloudflare-to-B2 transfer is free under Backblaze's partner program. Needs a Cloudflare Transform Rule to set the Host header to the B2 endpoint and CORS on the bucket. This is a configuration change only (`B2_PUBLIC_HOST` in the storage layer); the abstraction in doc 14 has a slot for it. Verify the exact signing and Host behaviour on a test bucket before switching traffic.

### Cost kill-switches
- Admin Overview shows meters for storage and egress (doc 09).
- `egress_daily` is estimated at signing time from file sizes. When the estimate passes 90 % of the monthly cap, the API switches new plays to previews-only for guests first, then returns 503 "Listening is paused until next month" before spending money. Enforced by an env `EGRESS_CAP_GB`.
- No paid dependencies, no pay-as-you-go cards attached to Vercel, Supabase, or B2 (B2 requires a card on file only for paid use; leave caps at $0 in the B2 dashboard).
