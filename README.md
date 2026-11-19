# Geet

Free music with friends. Hosted at listengeet.com. Friends listen to the same song at the same moment.

The code is licensed under AGPL-3.0-only (see `LICENSE`). The Geet name, wordmark and logos are not covered by that licence (see `TRADEMARKS.md`).

## Status

Phase 0 (foundation) is built: monorepo, design tokens, brand assets, CI, a placeholder page and `GET /api/health`.
The build order is in `phases/`; the reference docs are in `docs/`.

## Layout

| Folder             | What it is                                                         |
| ------------------ | ------------------------------------------------------------------ |
| `web/`             | Next.js PWA, Vercel project `geet-web` (listengeet.com)            |
| `api/`             | Next.js API only, Vercel project `geet-api` (api.listengeet.com)   |
| `worker/`          | ffmpeg transcoder run by GitHub Actions (Phase 2)                  |
| `packages/shared`  | Types, env validation, CORS and header helpers used by web and api |
| `supabase/`        | Migrations and SQL tests (Phase 1)                                 |
| `docs/`, `phases/` | The spec and one brief per build phase                             |

## Run it locally

```
nvm use
npm install
cp .env.example web/.env.local   # then edit; api/.env.local needs NEXT_PUBLIC_APP_URL and CORS_ORIGINS
npm run dev -w web               # http://localhost:3000
npm run dev -w api               # http://localhost:3001/api/health
```

## Verify

```
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:sql && npm run build
```

`test:sql` and `backup` are stubs until Phase 1.

## Environment

Variables are listed in `docs/12-architecture-hosting-dns.md`. With `REQUIRE_ENV=1` a missing required variable fails the build; without it, the problem is logged. `.env.example` holds dummy values only.

## Docs

Read in order: `docs/00` product brief, `01` brand and design system, `02` layout, `03` components, `04`-`05` screens, `06` player and offline, `07` social, `08` assistant, `09` admin, `10` states, `11` microcopy, `12` architecture, `13` data model, `14` storage and transcoding, `15` API, `16` CI and open source, `17` build order, `18` accessibility, performance and SEO, `19` asset map, `20` email.

## Open items to check before relying on them

1. The model id `nvidia/nemotron-3.5-bolt-e4b` must appear in `GET https://integrate.api.nvidia.com/v1/models` for your key. The fallback is `meta/llama-3.3-70b-instruct`.
2. Vercel Hobby cron frequency (believed once per day) and the Hobby non-commercial rule.
3. The Punjabi and Hindi strings in doc 11 are drafts and need a native reader.
