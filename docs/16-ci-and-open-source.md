# 16 · CI, workflows, and running Geet as open source

## Repository layout (monorepo)
```
/
├─ web/                 Next.js frontend  → Vercel project geet-web   (root dir: web)
├─ api/                 Next.js API-only  → Vercel project geet-api   (root dir: api)
├─ worker/              transcode.mjs     → run by GitHub Actions (no dependencies)
├─ packages/shared/     types, key builders, constants used by web and api
├─ supabase/            migrations/ and tests/
├─ scripts/             backup, storage migration
├─ docs/                this spec, kept in the repo
├─ .github/             workflows (this package's versions), dependabot
├─ .nvmrc               Node version used by CI
├─ package.json         npm workspaces; the scripts below
├─ LICENSE, TRADEMARKS.md, SECURITY.md, CONTRIBUTING.md, README.md, .env.example
```

### Root scripts that CI expects (from your `ci.yml` and `backup.yml`)
`typecheck`, `lint`, `format:check`, `test`, `test:sql`, `build`, `backup`. Each runs the matching command in every workspace that has one (`npm run <x> --workspaces --if-present`), except `test:sql` and `backup` which are single scripts in `scripts/`.

## Workflows in this package

| File | Trigger | What it does | Changed from yours |
|---|---|---|---|
| `ci.yml` | push to main/master, every PR | Postgres 16 service, install, typecheck, lint, format check, unit tests, SQL tests, build with **dummy** environment (`REQUIRE_ENV=1`), npm audit (report only) | Added `permissions: contents: read`, a worker syntax check, and dummy values for the new variables (`NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, `WORKER_SECRET`, `UPLOAD_MODE`) |
| `transcode.yml` | `repository_dispatch` (instant), every 15 min, manual | Drains the upload queue with ffmpeg (doc 14) | **New** |
| `keepalive.yml` | daily | Pings the API's keepalive and health endpoints so free Supabase never pauses | Runs for **production and dev**; guarded for forks; uses GitHub Environments for secrets |
| `backup.yml` | weekly, manual | Exports catalog and config | **Encrypted** with AES-256 before upload; guarded for forks |
| `dependabot.yml` | weekly | npm and GitHub Actions updates, grouped minor and patch | Unchanged |

### Why the backup had to change
Your original comment said "Keep this repository PRIVATE: the artifact contains your catalog data." You now want the repo public. On a public repo, workflow artifacts can be downloaded by any signed-in GitHub user, so an unencrypted export would be public. The new workflow encrypts it with `BACKUP_PASSPHRASE` (symmetric, AES-256). To restore: `gpg --decrypt geet-backup.tgz.gpg | tar xz`. Keep the passphrase in your password manager as well as in GitHub.

### Forks must not run your jobs
Every scheduled or secret-using job has `if: ${{ vars.RUN_SCHEDULED == 'true' }}`. Set the repository variable `RUN_SCHEDULED=true` **only in your real repo**. Forks do not inherit variables, so their copies of these workflows skip silently.

## GitHub setup checklist
1. Create the public repo. Settings → Actions → General: **Workflow permissions: Read repository contents** (not read/write). **Require approval for all outside collaborators** for workflow runs from forks.
2. Settings → Environments: create **production** and **dev**. In each, add secrets:
   - production: `API_URL` (`https://api.listengeet.com`), `WORKER_SECRET`, `CRON_SECRET`, `APP_URL` (same as `API_URL`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE`.
   - dev: `API_URL` (`https://dev-api.listengeet.com`), `WORKER_SECRET`, `CRON_SECRET`, `APP_URL`.
3. Settings → Secrets and variables → Actions → Variables: `RUN_SCHEDULED = true`.
4. Create a **fine-grained personal access token** limited to this repository with only **Actions: Read and write** (needed for `repository_dispatch`). Put it in the **API's** Vercel env as `GH_DISPATCH_TOKEN`, with `GH_REPO=owner/name`. Never in the repo.
5. Settings → Code security: enable **Dependabot alerts**, **secret scanning**, and **push protection** (free on public repos). Enable **private vulnerability reporting**.
6. Branch protection on `main`: require CI to pass, require a pull request, no force pushes.
7. Vercel: connect the repo to two projects (web, api). Set production branch `main`; assign the `dev` branch to the dev domains. **Turn off** "Automatically expose system environment variables" if unneeded, and never put production secrets into Preview environment variables that fork PRs could reach (Vercel does not build fork PRs with secrets by default; keep it that way).

## Public-repo hygiene

| Item | Rule |
|---|---|
| Secrets | None in the repo, ever. `.env*` in `.gitignore`, only `.env.example` with dummy values. If a key leaks, rotate it first, then clean history |
| Supabase anon key and Clerk publishable key | These are public by design. The **service role key**, **Clerk secret**, **B2 application key**, **AI key**, **worker secret**, **cron secret** are not |
| Brand | Code is open; the Geet name and logos are not. See below |
| Content | The repo contains no songs, covers, or user data. Test fixtures use generated tones (ffmpeg `sine`) |
| Admin identity | `ADMIN_EMAILS` only in env, never committed |
| Docs | Remove anything private (phone numbers, store details) from `docs/` and README before publishing |
| Third-party licences | Generate a `THIRD_PARTY_LICENSES` list in CI (use a license checker) and keep fonts under their open licences (Outfit, Inter, Noto: SIL OFL). Phosphor Icons: MIT |
| Logs | Do not log tokens, signed URLs, emails, or message bodies |

## Licence recommendation
**AGPL-3.0** for the code: anyone can read, run, and improve it, and anyone who runs a modified version as a public service must publish their changes. This protects a hosted product from being closed-source cloned. If you want the most permissive option for contributors, MIT is the alternative; choose before the first public commit because relicensing later needs every contributor's consent.

**`TRADEMARKS.md`:** the name "Geet", the wordmark, and the logo are not covered by the code licence. Forks must use a different name and logo. Keep `assets/brand/` and `icons/` in the repo (the site needs them) but state this in the file and in the README.

## Contributing basics (write these files)
- `README.md`: what Geet is, screenshots, one-command local setup (`supabase start`, `.env.example` copy, `npm run dev`), architecture picture from doc 12, links to docs.
- `CONTRIBUTING.md`: branch from `dev`, run `npm run typecheck && npm run lint && npm test && npm run test:sql` before a PR, keep migrations forward-only, never commit secrets.
- `SECURITY.md`: report privately through GitHub, expected response time, scope.
- Code of conduct (short).
- Issue templates: bug, feature. PR template with the verify checklist.

## Local development
- `supabase start` (Docker) gives local Postgres, Storage, Realtime. Clerk uses the **development** instance keys. Storage: local Supabase Storage by default. Worker can be run by hand: `API_URL=http://localhost:3001 WORKER_SECRET=dev node worker/transcode.mjs`.
- Seed script creates 12 sample songs from generated tones so a fresh clone is playable without real music.
