# 00 · Product brief

## One line
Geet is a free, mobile-first music web app where friends listen to the same song at the same moment. Tagline (from your OG image): **Music sounds better together.**

## Who it is for
People who share music with friends and family, with Punjabi, Hindi and English catalogue first. Phone first, installable as a PWA, works offline for saved songs.

## What it is not
Not a Spotify clone, not a global catalogue. It only plays songs uploaded to Geet. No ads, no payments in v1.

## Features (v1, all in scope)

| Feature | Behaviour | Doc |
|---|---|---|
| Guest mode | Anyone can browse and hear a ~40 s preview of each song, then sees a sign-in prompt | 06 |
| Accounts | Clerk. Google plus email code | 05 |
| Library | Search, favourites, playlists, Daily Mix, history | 04, 05 |
| Offline | Save songs to the device, play without a connection | 06 |
| Friends and chat | Add by username, text, share songs, jam invites | 07 |
| Jams | Synced listening: everyone hears the same moment of a song, with a shared queue | 07 |
| Ask Geet | AI assistant: searches the catalogue, builds playlists, recommends. Only sees songs on Geet | 08 |
| Promo banners | A banner area for featured artists or announcements, edited by the owner | 04, 09 |
| Reports and takedowns | Report button on every track, admin review page, removal deletes files and hides the track | 09 |
| Upload | Signed-in users (or only admins, see open items) upload songs; processing happens in GitHub Actions | 05, 14 |
| Email | Resend sends everything from listengeet.com addresses: sign-in codes, welcome, new sign-in alerts, opt-in marketing, copyright acknowledgements. Clerk's own emails are off | 20 |

## Hard constraints
- **Free tiers only.** Every paid-tier risk is called out in doc 12.
- **Swappable parts.** Storage (Supabase Storage or Backblaze B2 via `STORAGE_PROVIDER`), AI model (env), auth identity table (Clerk now, other providers later), worker (any machine that can run ffmpeg).
- **Mobile first.** Design at 390 px wide, then scale up.
- **Open source.** The repository will be public, so no secrets, no private data in CI artifacts, and forks must not run your scheduled jobs.

## Decisions already made
| Decision | Choice |
|---|---|
| Repo | Monorepo: `web/`, `api/`, `worker/`, `packages/shared/`, `supabase/` |
| Frontend | Next.js (App Router) on Vercel at `listengeet.com` |
| Backend | Next.js API-only project on Vercel at `api.listengeet.com` |
| Dev environment | `dev.listengeet.com` (web) and `dev-api.listengeet.com` (api), separate Supabase project, separate B2 bucket, Clerk development instance |
| DNS | Cloudflare |
| Auth | Clerk |
| Database | Supabase Postgres with RLS |
| Storage | B2 primary, Supabase Storage as the fast-switch alternative |
| AI | NVIDIA NIM, OpenAI-compatible endpoint, model and fallback from env |
| Transcoding | GitHub Actions ffmpeg worker, triggered instantly, cron as backup |
| Email | Resend, separate addresses per purpose (security@, hello@, marketing@, copyright@), Clerk emails turned off |

## Open items (my recommendation first)
1. **Who may upload.** Start with `UPLOAD_MODE=admin` (only you). Move to `approved` then `anyone` once reports and takedowns have been exercised. Open uploads on a public site is a copyright risk.
2. **Licence.** AGPL-3.0 for the code; name and logo reserved (see doc 16).
3. **Vercel Hobby is for non-commercial use.** If Geet ever earns money, move to Pro.
4. **Language list.** UI languages English, Punjabi, Hindi. Catalogue language tags are free-form per track.
