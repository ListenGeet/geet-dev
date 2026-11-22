# 17 · Build order for Claude Code

**Each phase below is now a standalone brief in `phases/` with its own reading list, checklist, acceptance tests and prompt. Use those to run the build; this page is the overview.**

Build in phases. Each phase ends green: `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:sql && npm run build` (the same commands as CI). Do not start the next phase until it passes. Report briefly: what changed and the verify result.

## Phase 0: Foundation
- Monorepo with npm workspaces (`web`, `api`, `worker`, `packages/shared`), `.nvmrc`, TypeScript strict, ESLint, Prettier, Vitest.
- Copy `assets/` into `web/public/` (keep `sw.js`, `manifest.webmanifest`, `offline.html`, icons, brand, `.well-known`), then overwrite the illustrations and `offline.html` with `assets-recolored/`. Do not copy any `.lnk`.
- Copy `.github/` to the repo root.
- Env validation module with `REQUIRE_ENV`.
- Design tokens (doc 01) as CSS variables; fonts through `next/font`; icon wrapper; the equalizer component.
- **Done when:** both apps build in CI with the dummy env and `/api/health` answers.

## Phase 1: Data and auth
- Migrations for every table in doc 13, RLS, functions, indexes, Realtime publication.
- SQL tests proving the RLS rules listed in doc 13.
- Clerk in web (themed per doc 05) and token verification in api; `GET /api/me` creates profile and identity; admin from `ADMIN_EMAILS`; CORS.
- Rate limit helper and usage counters.
- Email foundation (doc 20): Resend client with idempotency and the dev allowlist, `verification-code` and `welcome` templates, Clerk webhook with Svix verification. Clerk's own emails are switched off in the dev instance first.
- **Done when:** a signed-in user's token yields a profile; cross-user reads fail in SQL tests.

## Phase 2: Storage, upload, transcode (the spine)
- Storage abstraction with Supabase and B2 implementations and tests against a fake S3.
- Upload endpoints, worker endpoints, `worker/transcode.mjs`, `repository_dispatch` trigger, status polling. In the web workspace, use `music-metadata@12.3.5` and `parseBlob(file)` to prefill editable title, artist, and album from embedded tags; clean the filename as the missing-title fallback and keep manual entry available when tags are absent or parsing fails. Before upload, reserve an exact-file SHA-256 fingerprint atomically and reject duplicates with HTTP 409; verify the digest again in the worker. Do not query an online catalogue.
- Seed: 12 generated-tone sample songs.
- **Done when:** uploading a file ends with a playable `ready` track in under a minute on a real run, and `incoming/…` is deleted.

## Phase 3: The player and catalogue UI (core product)
- Shell for all breakpoints (doc 02): header, sidebar/rail/bottom nav, mini player, player bar, footer.
- Player engine, full player, queue, lyrics, scrubber (real waveform), Media Session.
- Home, Search, Artist, Track share page, guest preview and gate (including `signin-prompt.mp3`).
- Components from doc 03 and all states of doc 10.
- **Done when:** a guest can find and preview a song on a phone viewport, and the sign-in sheet appears at 0:40.

## Phase 4: Library and offline
- Favourites, playlists (with reorder, Daily Mix), history, search history, onboarding, profile and settings.
- Offline downloads honouring the `sw.js` contract (doc 06), `/api/cover` rewrite, offline page.
- **Done when:** airplane-mode test plays a saved song and shows the offline banner.

## Phase 5: Social
- Friends, requests, suggestions, notifications, chat with Realtime, push subscriptions.
- New sign-in alerts, signed-in devices list, sign out other devices (doc 20 section 4).
- Jams with the sync algorithm (doc 07) and a two-browser test.
- **Done when:** two accounts chat live and a jam keeps two players within 300 ms.

## Phase 6: Assistant, promos, moderation
- Ask Geet (doc 08) with tools, streaming, limits, and the injection test.
- Promos table, public banner, admin editor.
- Reports, admin review, removal procedure, audit log, admin Overview and Usage.
- Marketing: opt-in toggle, email queue and budget, unsubscribe page, admin Emails tab, Resend webhook, copyright acknowledgement (doc 20).
- **Done when:** removing a reported test track deletes its storage objects and it vanishes from search and playlists.

## Phase 7: Hardening and launch
- Accessibility pass (doc 18), performance budget, SEO and share previews.
- Cron routes, keepalive, backup test restore.
- Egress cap behaviour; storage migration script tested between providers on a dev bucket.
- Legal pages reviewed by a person.
- README, LICENSE, TRADEMARKS, SECURITY, CONTRIBUTING; secret scan of the full history before making the repo public.

## Rules for every phase
1. Follow the docs literally for names, copy, and visuals; ask before deviating.
2. Re-read doc 01's slop table before finishing any screen.
3. No new paid services. No new dependency without a reason in the PR description.
4. Authorize on the server first, then use the service-role client.
5. Real data only: no placeholder lorem, fake counts, or invented tracks outside the seed script.
6. Keep each response short: what changed, verify result, anything blocked.

## Starter prompt (paste into Claude Code in an empty repo containing this package)

> Read `README.md` and every file in `docs/`. Build Geet exactly as specified, in the phase order of `docs/17-build-order-for-claude-code.md`. Start with Phase 0 and 1. Use `assets/` and `assets-recolored/` as described and `.github/` as the workflows. Verify with the commands in doc 17 before moving on. Do not add features that are not in the docs. If something is ambiguous or conflicts across docs, stop and ask one precise question. Keep replies short.

## Things to decide before Phase 2 (so work is not blocked)
- Create the two Supabase projects, two B2 buckets (with CORS), Clerk dev and production instances, and the two Vercel projects. Gather the env values from doc 12.
- Add `listengeet.com` and `dev.listengeet.com` in Resend, create sending-only API keys, set DNS (doc 20), and set up Cloudflare Email Routing for the addresses.
- Choose `UPLOAD_MODE` (recommended `admin` at first) and the licence.
- Create the GitHub environments, variable, and token from doc 16.
