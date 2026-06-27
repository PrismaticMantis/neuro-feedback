# Session Prompts

Reusable instructions for **any** AI agent or human collaborator (Cursor, Claude
Code, Codex, ChatGPT, etc.). No chat history required — the repo docs are the
memory.

## How to invoke

Tell your agent **one** of the following (pick what your tool supports):

| Intent | What to say |
|---|---|
| **Start session** | `session-start` |
| **Start session** | `Follow prompts/session-start.md` |
| **Start session** | Attach or reference the file `prompts/session-start.md` |
| **End session** | `session-end` |
| **End session** | `Follow prompts/session-end.md` |
| **End session** | Attach or reference the file `prompts/session-end.md` |

You do **not** need to paste the full prompt text if the agent can read the file.

## What each prompt does

- **`session-start.md`** — Read the project docs, summarize understanding, confirm
  before changing code.
- **`session-end.md`** — Update `docs/PROJECT_STATE.md`, commit, and push so the
  next person can `git pull` and continue.

## Where agents should look first

1. `AGENTS.md` — entry point (if the tool auto-loads it)
2. `prompts/session-start.md` — beginning of work
3. `prompts/session-end.md` — end of work
