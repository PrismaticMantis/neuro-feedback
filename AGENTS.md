# Agent Instructions — NeuroSymphony

This repository is the **source of truth** for code and project understanding.
Git preserves code history; the docs preserve *why* things exist and *where* work
stands today.

## Before you change code

Run **session start** — tell the agent any of:

- `session-start`
- `Follow prompts/session-start.md`
- Attach/reference `prompts/session-start.md`

Then follow that file's instructions: read `README.md`, `docs/PROJECT.md`,
`docs/PROJECT_STATE.md`, and `docs/ARCHITECTURE.md`; summarize; confirm before
changing code.

See `prompts/README.md` for invocation options across tools.

## Before you finish a session

Run **session end** — tell the agent any of:

- `session-end`
- `Follow prompts/session-end.md`
- Attach/reference `prompts/session-end.md`

Then follow that file: update `docs/PROJECT_STATE.md`, commit, and push to
`main` so the next person can continue from GitHub.

## Active development branch

**`main`** is the source of truth. Clone and work from `main`:

```bash
git clone https://github.com/PrismaticMantis/neuro-feedback.git
cd neuro-feedback
git checkout main
git pull
```

The `eeg-multidevice-refactor` branch was merged into `main` on 2026-06-26; use
`main` for all new work unless `docs/PROJECT_STATE.md` says otherwise.

## Principles (short)

When uncertain, prefer participant experience, reliability, and maintainability
over cleverness. See `docs/PROJECT.md` for the full philosophy.
