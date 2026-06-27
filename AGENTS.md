# Agent Instructions — NeuroSymphony

This repository is the **source of truth** for code and project understanding.
Git preserves code history; the docs preserve *why* things exist and *where* work
stands today.

## Before you change code

Follow **`prompts/session-start.md`**:

1. Read `README.md`, `docs/PROJECT.md`, `docs/PROJECT_STATE.md`, and
   `docs/ARCHITECTURE.md`.
2. Summarize: product, architecture, current focus, known issues, next priorities.
3. Confirm your understanding before making changes.

## Before you finish a session

Follow **`prompts/session-end.md`**:

1. Update `docs/PROJECT_STATE.md` (dashboard + Project History).
2. Commit and push your changes to the **current working branch** so the next
   person or agent can continue from GitHub — not from chat history.

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
