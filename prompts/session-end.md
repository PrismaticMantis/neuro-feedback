# Session End

> **For humans:** Tell any agent: `session-end`, or `Follow prompts/session-end.md`,
> or attach this file. The agent should read it and execute the instructions below.
> Works in Cursor, Claude Code, Codex, ChatGPT, or any tool that can read repo files.

---

## Agent instructions — execute now

You are ending a work session on **NeuroSymphony**. Save project memory to the
repository so the next developer or AI can continue **without this chat**.

### Step 1 — Update `docs/PROJECT_STATE.md`

Refresh the **dashboard** (top of file) to reflect current reality:

- **Current Focus**
- **Known Issues / Watch List** — add new; resolve or summarize old (move lessons
  into Project History, don't erase valuable context)
- **Recent Progress** — what changed and why it mattered
- **Key Decisions** — decisions made, with brief rationale
- **Next Priorities** — what should happen next
- **Session Handoff** — branch, safe stopping point, first step for the next person

Bump **Last updated** at the top.

### Step 2 — Append to Project History

Add a new entry at the **top** of Project History:

```
### YYYY-MM-DD

**Goal** — ...

**Completed**
- ...

**Learned** — ...

**Next** — ...
```

**Non-destructive rule:** summarize or relocate obsolete dashboard items into
History; do not delete important discoveries.

### Step 3 — Commit and push (required)

Save all session changes (code + docs) to GitHub:

1. `git add -A` and review `git status`
2. Commit with a clear message summarizing the session
3. Push to the current branch (usually `main`): `git push origin HEAD`
4. Note in Session Handoff that changes were pushed

If the user did not ask you to commit, **ask once** — handoff is incomplete until
pushed. Do not commit secrets (`.env` with real keys, credentials).

### Step 4 — Optional doc updates

Update only if this session truly changed them:

- `docs/ARCHITECTURE.md` — design rationale changed
- `docs/PROJECT.md` — vision or principles changed

### Step 5 — Confirm handoff

Reply briefly with:

- What was updated in `PROJECT_STATE.md`
- Commit hash or message (if committed)
- Branch pushed to
- Recommended first action for the next session (`session-start`)
