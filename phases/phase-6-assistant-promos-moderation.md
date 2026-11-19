# Phase 6 · Assistant, promos, moderation, marketing email

**Goal:** everything that makes Geet safe and ready to run in public.
**Ships:** Ask Geet, promo banners, the report and takedown pipeline, admin tools, and opt-in newsletters.

## Read
Doc 08 (all) · doc 09 (all) · doc 04 (Promo banner, Legal pages) · doc 20 sections 5, 6, 7, 8 · doc 14 (promos, removal) · doc 13 (reports, promos, admin_log, email tables) · doc 11 (reasons, confirms)

## Build
- [ ] Ask Geet: `/api/ai/chat` streaming, tools with server-side validation, proposal then confirm for playlist writes, fallback model, per-user daily and global limits, local-storage history, the assistant screen and all states. Model and fallback from env.
- [ ] Promos: table, public banner on Home (carousel, scrim, a11y), admin editor with live preview and image upload to `promos/<id>.jpg`.
- [ ] Reports: Report button on every track menu and share page, report sheet with fixed reasons, public copyright form on `/copyright`, `copyright-received` email, admin Reports tab and review panel, Dismiss, Hide, **Remove** (the full procedure in doc 09: status, storage deletion, rows, favourites, device purge), audit log.
- [ ] Admin: Overview (stat blocks, meters, needs-attention), Tracks (edit, hide, remove, reprocess, bulk), Usage charts, Emails tab (composer, test send, schedule, history, suppressions).
- [ ] Marketing email: queue and daily budget rules, frequency limits, `marketing-announcement` and `marketing-weekly`, one-click unsubscribe (headers and page), Resend webhook with bounce and complaint suppression, composer refusal without `MARKETING_POSTAL_ADDRESS`.
- [ ] Egress cap behaviour (`EGRESS_CAP_GB`) and admin meters.
- [ ] Optional admin digest (`ADMIN_DIGEST`).

## Do not build yet
Anything marked later: remote play, paid plans, analytics beyond doc 18.

## Acceptance
- [ ] **Removal test:** report a test track, remove it as admin: its three storage objects are gone, it vanishes from search and playlists, a device with it downloaded purges it when online, open reports on it close.
- [ ] Prompt checks from doc 08 pass, including the prompt-injection track title and "artist not on Geet".
- [ ] A promo with dates shows only inside them; a promo link with `javascript:` is rejected.
- [ ] Opt in, receive a test marketing email with working one-click unsubscribe; the next send skips that user; a hard-bounce test address is suppressed.
- [ ] Composer refuses to send without a postal address and shows the "about N days" estimate.
- [ ] Daily budget: with the counter forced to 85, marketing pauses and sign-in codes still send.
- [ ] Every admin endpoint returns 403 to a non-admin (automated test).

## Milestone C: public-launch candidate
Only now consider `UPLOAD_MODE=approved` or `anyone`.

## Your decisions and accounts
- **Real postal address** for the marketing footer.
- NVIDIA key; confirm the model id exists in the NIM model list.
- Copyright response time to promise (default 3 working days) and a lawyer's review of Terms, Privacy, Copyright.

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-6-assistant-promos-moderation.md` and the docs it lists. Phases 0 to 5 are done. Build Phase 6 only. Run the verify command, then run the removal test and the unsubscribe test and report. Reply briefly: what changed, verify result, anything blocked.
