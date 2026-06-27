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

Most NeuroSymphony work (BrainBit iPad, Capacitor, docs system) lives on
**`eeg-multidevice-refactor`**, not `main`. After cloning, check out that branch
unless `docs/PROJECT_STATE.md` says otherwise:

```bash
git fetch origin
git checkout eeg-multidevice-refactor
git pull
```

Do **not** merge to `main` unless a human explicitly asks.

## Principles (short)

When uncertain, prefer participant experience, reliability, and maintainability
over cleverness. See `docs/PROJECT.md` for the full philosophy.
