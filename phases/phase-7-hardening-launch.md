# Phase 7 · Hardening and launch

**Goal:** safe to open to the public, cheap to keep running.
**Ships:** production on `listengeet.com` with monitoring of limits, backups that restore, and a public repository.

## Read
Doc 18 (all) · doc 16 (hygiene, checklist, licence) · doc 12 (free-tier budget, kill-switches) · doc 20 sections 6 and 8 · doc 11 (SEO text)

## Build
- [ ] Accessibility pass to doc 18 (focus, labels, live regions, keyboard, 200 % zoom, reduced motion); fix findings.
- [ ] Performance budget checks (LCP, INP, CLS, JS size); lazy-load social, assistant, admin.
- [ ] SEO: robots, sitemap, structured data, noindex on dev and private pages, `410` for removed tracks.
- [ ] Update-available banner for the service worker; bump cache versions.
- [ ] Backup workflow run once and **restored** into a scratch database from the encrypted file.
- [ ] Storage migration script tested both ways on dev buckets.
- [ ] Production cutover: prod Supabase migrations, prod Clerk (DNS records), prod Resend domain verified, DMARC at `p=none` then move to `quarantine` after clean reports, prod B2 bucket CORS, env vars, domains, `www` redirect.
- [ ] Repo files: README (with screenshots and the measured transcode time), CONTRIBUTING, SECURITY, TRADEMARKS, code of conduct, issue and PR templates, third-party licence list.
- [ ] Secret scan of the full git history; rotate anything that ever leaked.
- [ ] Runbooks in `docs/`: storage migration, restoring a backup, rotating secrets, removing a song urgently, what to do at 80 % of any free limit.

## Acceptance
- [ ] Lighthouse mobile: Performance 85+, Accessibility 95+, Best Practices 95+, SEO 95+ on Home and a track page.
- [ ] Screen-reader pass on sign-in, play, search, playlist add (VoiceOver and TalkBack).
- [ ] Backup restored successfully; passphrase stored outside GitHub.
- [ ] Production smoke test: sign up, upload (admin), play full as user and preview as guest, report and remove, jam between two accounts, unsubscribe.
- [ ] Admin meters show storage, egress, and email-per-day; the alert thresholds fire in a test.
- [ ] `git log -p` secret scan clean; repo visibility switched to public only after this item.
- [ ] Email deliverability: SPF, DKIM, DMARC all pass for `security@`, `hello@`, `marketing@` (check headers in Gmail).

## Your decisions and accounts
- When to go public; whether to switch `UPLOAD_MODE` and to what.
- Whether Vercel stays on Hobby (non-commercial only) or you move to Pro.

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-7-hardening-launch.md` and the docs it lists. Phases 0 to 6 are done. Build Phase 7 only. Run the verify command, then the audits and the backup restore, and report the numbers. Do not change repo visibility. Reply briefly: what changed, verify result, anything blocked.
