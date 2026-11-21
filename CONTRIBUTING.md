# Contributing to Geet

Thanks for taking the time to improve Geet. Issues and pull requests are welcome, whether they address code, documentation, accessibility or a reproducible bug.

## Before you start

- Check the repository's open issues and the [phase plan](phases/) to avoid duplicating work.
- For a substantial change, open an issue first so we can agree on the approach.
- Do not submit songs, artwork, user data, credentials or other private information.
- The code is AGPL-3.0-only. Geet's name, logos and other listed brand assets are reserved; see [TRADEMARKS.md](TRADEMARKS.md).

## Local setup

Use Node.js 22.12 or later, install dependencies with `npm install`, and follow the [README setup](README.md#run-locally). Copy `.env.example` for local configuration and use test credentials only. Never commit secrets or real user data.

## Pull requests

Keep changes focused and describe the user impact, implementation and any configuration or migration steps. Add or update documentation when behavior or setup changes. Database changes should use forward-only migrations and respect row-level security.

Before opening a pull request, run the checks relevant to your change:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:sql
npm run build
```

Some phase-dependent scripts are scaffolding. Mention any check you could not run and why.

## Reporting bugs

Use the bug report template and include reproduction steps, expected and actual behavior, and relevant browser or runtime details. Remove tokens, email addresses, private URLs and personal data from logs and screenshots.
