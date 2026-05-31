# Repository Workflow

OpenMakruk uses GitHub issues, feature branches, pull requests, and Cloudflare CI deploys. This keeps `main` deployable while allowing large foundation work to move safely.

## Lifecycle

```text
Issue
  -> branch from main
  -> local implementation
  -> local gates
  -> draft PR
  -> review
  -> CI
  -> merge to main
  -> automatic production deploy
```

## Branching

Do not work directly on `main`.

Recommended branch names:

```text
issue-12-deterministic-bot-challenges
issue-13-shared-makruk-rules-core
issue-14-board-layout-consistency
issue-15-split-play-controller
chore/repo-agent-workflow
```

Start work:

```bash
git checkout main
git pull --ff-only
git checkout -b issue-<number>-short-slug
```

## Pull Requests

Every PR should:

- link the issue
- explain why the change is durable
- document contract/schema/migration impact
- include screenshots or video for UI changes
- list exact commands run
- call out what reviewers should inspect closely

PRs to `main` run CI but do not deploy. Deployment only happens after merge/push to `main`.

## Deployment

Frontend:

- Workflow: `.github/workflows/ci.yml`
- Trigger: push to `main`
- Gate: lint, typecheck, build, worker integration tests, e2e
- Deploy target: Cloudflare Pages project `openmakruk`
- Production domains: `openmakruk.com`, `www.openmakruk.com`

Worker:

- Workflow: `.github/workflows/deploy-worker.yml`
- Trigger: push to `main` touching `worker/**` or manual dispatch
- Gate: worker typecheck and integration tests
- Migration: remote D1 migrations apply before deploy
- Deploy target: Cloudflare Worker `openmakruk-api`

Bot exhibition:

- Workflow: `.github/workflows/exhibition-tick.yml`
- Trigger: scheduled every 30 minutes or manual dispatch
- Runs an external bot-vs-bot game and submits it to the production Worker.

## Running Worker Tests Locally

The worker integration suite drives a live `wrangler dev` instance with miniflare's D1 emulation. Setup is automatic via `worker/tests/global-setup.ts`:

```bash
cd worker
npm install           # first time only
npm run test          # runs vitest with the wrangler-dev harness
npm run test:watch    # same suite, file watch mode
```

What the harness does on every full run:

1. Removes `worker/.wrangler/state/v3/d1` so the local D1 sqlite file starts empty.
2. Applies all migrations under `worker/migrations/` against the local DB.
3. Regenerates `worker/seed-curated.sql` from the source JSON and executes it.
4. Spawns `wrangler dev` on port 8788 and waits for `/api/health` to respond.
5. Exports `WORKER_BASE_URL` so test helpers can reach the running server.

If any step fails, the thrown error includes the failing subprocess's stdout + stderr tail. The most common failures and what they usually mean:

| Symptom | Likely cause |
|---|---|
| `wrangler d1 migrations apply ... exited with code 1` + SQL error in tail | A migration in `worker/migrations/` has a syntax issue or conflicts with the prior schema. |
| `node scripts/seed-curated.mjs ... exited with code 1` | The seed generator hit a malformed JSON in `worker/data/`. Output usually points at the file + key. |
| `wrangler dev did not become healthy within 30000ms` + wrangler log tail | Either the port is taken (kill stale wrangler) or `worker/wrangler.toml` binding mismatch. The tail almost always shows the actual diagnostic. |
| `wrangler dev did not become healthy` + tail mentions `Address already in use` | A previous run left wrangler alive. `lsof -i :8788` then kill the PID, or wait ~30s for the OS to free the port. |

To run a single scenario test:

```bash
cd worker
npm run test -- -t "challenge accept rejects fabricated moves"
```

The `WRANGLER_SEND_METRICS=false` env var is set automatically; you don't need to set it manually.

## Required GitHub Settings

These settings are not fully represented as files in the repo and should be configured in GitHub:

- Protect `main`.
- Require PR before merge.
- Require CI workflow `typecheck · build · e2e`.
- Require worker deploy checks when worker files change.
- Disallow force-push to `main`.
- Prefer squash merge or rebase merge for a linear history.
- Require conversation resolution before merge.

## Secrets And Variables

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `EXHIBITION_ADMIN_TOKEN`

Recommended repository variable:

- `VITE_API_BASE=https://openmakruk-api.cnatthaphon.workers.dev`

## Agent Handoff

When assigning work to Claude Code or another coding agent, provide:

- issue number and title
- acceptance criteria
- affected surfaces
- required tests
- migration constraints
- screenshots or reproduction steps for UI bugs

Agents should read `AGENTS.md` and `CLAUDE.md` before editing.
