# Session Start — Onboarding Prompt

Use this at the **start** of any work session (paste it to your AI agent, or follow
it yourself). Its job: get productive from the documentation alone, without relying
on prior chat history.

---

You are starting a work session on **NeuroSymphony** (repo: `neuro-feedback`).

Before writing or changing any code, read these documents in order:

1. `README.md` — how to install, run, and contribute; the documentation workflow.
2. `docs/PROJECT.md` — product vision, purpose, and engineering philosophy.
3. `docs/PROJECT_STATE.md` — current focus, known issues, recent progress, key
   decisions, next priorities, and project history.
4. `docs/ARCHITECTURE.md` — how the system is designed and why; components, data
   flow, and where future expansion fits.

Then **summarize your understanding** back, covering:

- **The product** — what NeuroSymphony is and who it's for.
- **The architecture** — the major components and how data flows from headset to
  audio (note the relay + WebSocket boundary).
- **Current development focus** — what's actively being worked on.
- **Known issues** — the active problems and constraints to respect.
- **Next priorities** — what should happen next.

Finally, **confirm your understanding and propose what you intend to do** before
making any code changes. Wait for confirmation (or proceed only if the task is
already unambiguous).

Notes:
- Treat the docs as the source of truth. If something in the code contradicts them,
  flag it rather than silently assuming.
- Respect the engineering principles in `PROJECT.md` (reliability over features,
  honest signals, graceful degradation, clear seams, non-destructive changes).
