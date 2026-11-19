# Phase 1 · Data, sign-in, email basics

**Goal:** the full database with security rules, working sign-in, a profile for every user, and Geet's own sign-in code and welcome emails (Clerk sends nothing).
**Ships:** a person can sign up with Google or an email code, pick a username, and receives emails from `security@` and `hello@`.

## Read
Doc 13 (all) · doc 12 (Auth, env) · doc 15 (System, Me and profiles, Email and webhooks) · doc 05 (Sign in, Onboarding) · doc 11 · doc 20 sections 1, 2, 3, 9, 10

## Build
- [ ] Migrations in `supabase/migrations/` for **every** table in doc 13 (including email tables and `sign_in_devices`), indexes, `pg_trgm`, functions, Realtime publication.
- [ ] RLS on every table. SQL tests in `supabase/tests/` proving the rules listed in doc 13. `npm run test:sql` applies migrations to an empty Postgres and runs them (CI already provides the service).
- [ ] `public.uid()` mapping Clerk `sub` through `identities`.
- [ ] API: Clerk token verification, `GET/PATCH /api/me`, username check and set, CORS, rate-limit helper (`rate_limit_hit`), usage counters, admin from `ADMIN_EMAILS`, `GET /api/health` now checking the database.
- [ ] Web: Clerk provider, themed `/sign-in` and `/sign-up` per doc 05 (**Google primary**, email code secondary), the sign-in gate sheet component, onboarding (username, languages, artists, news toggle default off), account menu with Sign out.
- [ ] Email: Resend client (idempotency keys, dev allowlist with `[DEV]` subject prefix), `verification-code` and `welcome` templates from `emails/templates/` rendered with placeholders, plain-text part always sent, `POST /api/webhooks/clerk` with Svix verification (`user.created` → welcome once; email event → code email; unknown template → send Clerk's body from `security@`). Log the first real payload in dev and map fields from it.
- [ ] Delete-account path (`DELETE /api/me`, `user.deleted` webhook).

## Do not build yet
Catalogue screens, storage, upload, jams, marketing emails, sign-in alerts (Phase 5).

## Acceptance
- [ ] SQL tests pass, including: a user cannot read another user's favourites, playlists, history or messages; a stranger cannot insert a message; non-`ready` tracks are invisible to anon.
- [ ] Sign up with Google and with an email code on `dev.listengeet.com`. The code email comes from `security@dev.listengeet.com` in Geet's template; **Clerk's email log is empty**.
- [ ] The welcome email arrives once, from `hello@`, and not again on the next sign-in.
- [ ] Onboarding saves username (unique), languages, artists, and the news toggle stays off unless chosen.
- [ ] Sending to an address not in `EMAIL_DEV_ALLOWLIST` on dev is dropped and logged.
- [ ] A forged webhook without a valid signature is rejected with 401.

## Your decisions and accounts
- Two Supabase projects (prod, dev); enable Clerk as a third-party auth provider in each.
- Clerk development and production instances; enable Google; in the **dev** instance turn off "Delivered by Clerk" and add the webhook (doc 20 §3). **If the switch is locked on your plan, tell Claude Code and decide: keep Clerk's code emails, or upgrade.**
- Resend: add `dev.listengeet.com` (then `listengeet.com`), set DNS, create sending-only API keys, DMARC record, Cloudflare Email Routing for the addresses.
- Set `ADMIN_EMAILS` to your address.

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-1-data-auth-email.md` and the docs it lists. Phase 0 is done. Build Phase 1 only. Run the verify command and fix failures. Log the first Clerk email webhook payload in dev and map fields from it. Reply briefly: what changed, verify result, anything blocked.
