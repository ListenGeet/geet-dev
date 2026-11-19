# Phase 0 · Foundation

**Goal:** an empty but real Geet: monorepo, design tokens, brand assets, CI green, both apps deployed to the dev domains.
**Ships:** `dev.listengeet.com` shows a black page with the Geet logo and the equalizer; `dev-api.listengeet.com/api/health` answers.

## Read
`README.md` · doc 01 (all) · doc 03 (Buttons, Equalizer only) · doc 12 (domains, env table) · doc 16 (layout, root scripts, workflows) · doc 19 (asset contracts)

## Build
- [ ] Monorepo with npm workspaces: `web`, `api`, `worker`, `packages/shared`. `.nvmrc`. TypeScript strict, ESLint, Prettier, Vitest.
- [ ] Root scripts exactly as CI expects: `typecheck`, `lint`, `format:check`, `test`, `test:sql` (can be a stub that exits 0 until Phase 1), `build`, `backup` (stub).
- [ ] Copy `assets/` into `web/public/` (keep `sw.js`, manifest, icons, brand, `.well-known`, audio). Overwrite illustrations and `offline.html` from `assets-recolored/`. Do not copy any `.lnk`. Copy `emails/assets/*` to `web/public/email/`.
- [ ] Copy `.github/` to the repo root.
- [ ] Env validation module with `REQUIRE_ENV=1`: required variables per app from doc 12 (only validate what exists so far; add as phases add them).
- [ ] Design tokens from doc 01 as CSS variables. Fonts through `next/font` (Outfit, Inter, Noto Gurmukhi, Noto Devanagari). Icon wrapper (Phosphor).
- [ ] The equalizer component (5 bars, sizes 14/24/48, reduced-motion freeze).
- [ ] `web`: a single page, black background, logo, equalizer. Registers `sw.js`. Manifest linked.
- [ ] `api`: `GET /api/health` returns `{ ok: true, version }` (no database yet), CORS from `CORS_ORIGINS`.
- [ ] Security headers in both projects (doc 18).
- [ ] `README.md`, `.env.example` (dummy values only), `LICENSE` placeholder, `.gitignore` excluding `.env*`.

## Do not build yet
Database, Clerk, any screen beyond the placeholder, storage, email.

## Acceptance
- [ ] CI is green on a pull request.
- [ ] `dev.listengeet.com` loads the placeholder; Chrome offers Install; `/offline.html` shows when offline after one visit.
- [ ] `dev-api.listengeet.com/api/health` returns ok from the dev domain; a request from a disallowed origin is blocked by CORS.
- [ ] No secret anywhere in the repo (`git grep -i "secret\|sk_"` shows only variable names).

## Your decisions and accounts
- Create the GitHub repo (public is fine now: nothing secret yet) and the two Vercel projects (`geet-web` root `web`, `geet-api` root `api`).
- Add domains in Vercel and the Cloudflare DNS records (doc 12, **DNS only**). Assign the `dev` branch to `dev` and `dev-api`.
- Choose the licence (recommended AGPL-3.0).

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-0-foundation.md` and the docs it lists. Build Phase 0 only. Run the verify command from `phases/README.md` and fix failures. Do not start any later phase. Reply briefly: what changed, verify result, anything blocked.
