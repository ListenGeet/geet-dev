# Build phases

Geet is built in 8 phases. Each file here is a standalone brief: what to read, what to build, what **not** to build yet, how to prove it works, and the prompt to paste into Claude Code.

## How to run a phase
1. Open a fresh Claude Code session in the repo (this whole package copied in at the repo root, or the docs kept in `docs/`).
2. Do the **Your decisions and accounts** step of that phase first (they block the work).
3. Paste the phase's prompt. Claude builds only that phase.
4. It must pass the verify command, then you check the **Acceptance** list yourself on the dev site.
5. Commit and merge to `dev`. Start the next phase in a new session.

**Verify command (every phase):**
`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:sql && npm run build`

## Map

| Phase | Name | You can then | Docs |
|---|---|---|---|
| 0 | Foundation | See the empty Geet shell deployed on dev, CI green | 01, 03, 12, 16, 19 |
| 1 | Data, sign-in, email basics | Sign up with Google or email code and get Geet's own emails | 05, 11, 13, 15, 20 |
| 2 | Storage, upload, transcoding | Upload a song and see it become playable in under a minute | 12, 14, 15, 16 |
| 3 | App shell, player, catalogue | Browse, search and play (guest preview and full) | 01–04, 06, 10 |
| **A** | *Milestone: guest listening works* | | |
| 4 | Library and offline | Favourites, playlists, history, downloads, profile | 04–06, 13 |
| **B** | *Milestone: private beta, you use it daily* | | |
| 5 | Social | Friends, chat, jams, notifications, sign-in alerts | 05, 07, 20 |
| 6 | Assistant, promos, moderation, marketing email | Ask Geet, banners, reports and takedowns, newsletters | 04, 08, 09, 20 |
| **C** | *Milestone: public-launch candidate* | | |
| 7 | Hardening and launch | Accessibility, performance, security, legal, go live | 16, 18, 20 |

## Rules that apply to every phase
- Follow the docs literally for names, copy and visuals. If two docs conflict or something is ambiguous, stop and ask one precise question.
- Re-read the "slop" table in doc 01 before finishing any screen.
- No feature from a later phase, no placeholder lorem, no fake data outside the seed script.
- No new paid service. No new dependency without a one-line reason in the PR.
- Authorize on the server first, then use the service-role client.
- Keep the reply short: what changed, verify result, anything blocked.
- **Do not open uploads to other people (`UPLOAD_MODE` other than `admin`) before Phase 6 is accepted.**
