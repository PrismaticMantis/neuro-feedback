# Session Start

> **For humans:** Tell any agent: `session-start`, or `Follow prompts/session-start.md`,
> or attach this file. The agent should read it and execute the instructions below.
> Works in Cursor, Claude Code, Codex, ChatGPT, or any tool that can read repo files.

---

## Agent instructions — execute now

You are starting a work session on **NeuroSymphony** (repository: `neuro-feedback`).

**Do not write or change code yet.** First load context from the repository.

### Step 1 — Read these files (in order)

Use whatever file-reading capability you have (open, read, grep, attach):

1. `README.md` — install, run, contribute, documentation workflow
2. `docs/PROJECT.md` — vision, purpose, engineering philosophy
3. `docs/PROJECT_STATE.md` — current focus, known issues, progress, decisions,
   next priorities, project history
4. `docs/ARCHITECTURE.md` — system design and rationale

Optional if relevant: `AGENTS.md`, `docs/app-architecture-summary.md`.

**Branch:** work from `main` unless `PROJECT_STATE.md` says otherwise. If unsure,
run `git branch --show-current` and `git status`.

### Step 2 — Summarize back

Reply with a short summary covering:

- **Product** — what NeuroSymphony is and who it's for
- **Architecture** — major components; data flow from headset → relay → WebSocket
  → app → audio (note the relay boundary)
- **Current focus** — what the project is actively working on
- **Known issues** — problems and constraints to respect
- **Next priorities** — what should happen next

### Step 3 — Confirm before acting

State what you understand the user wants this session (if stated), or propose a
sensible next step from `PROJECT_STATE.md`. **Wait for confirmation** before
making code changes — unless the user's request was already explicit and narrow.

### Rules

- Treat the docs as source of truth. If code contradicts them, flag it.
- Follow `docs/PROJECT.md` principles: reliability over features, honest signals,
  graceful degradation, clear seams, non-destructive changes.
- You have no memory of prior chats. Everything you need is in the repo.
