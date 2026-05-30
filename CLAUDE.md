# Claude Code Instructions

Read `AGENTS.md` first. It is the operating contract for all coding agents in this repository.

Important defaults:

- Do not commit directly to `main`.
- Work from a GitHub issue or explicit task.
- Create a scoped branch before editing.
- Keep changes durable and contract-driven.
- Do not add page-specific UI hacks when a shared component, shared rules core, or schema is the real fix.
- Open a draft PR after local gates pass.

Production deploys are automatic only after changes land on `main` through CI. Pull requests run checks but do not deploy.
