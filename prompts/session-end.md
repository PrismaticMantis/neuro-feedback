# Session End — Handoff Prompt

Use this at the **end** of any work session (paste it to your AI agent, or follow
it yourself). Its job: capture what happened so the next developer or AI can
continue cleanly **without your chat history**.

---

You are ending a work session on **NeuroSymphony**. Update `docs/PROJECT_STATE.md`
to reflect everything accomplished today.

Update the dashboard sections so the top of the file reflects the *current* state:

- **Current Focus** — what's actively being worked on now.
- **Known Issues / Watch List** — add new issues; remove or mark resolved ones
  (move the lesson into Project History).
- **Recent Progress** — what changed and *why* it mattered.
- **Key Decisions** — any decisions made, with brief rationale.
- **Next Priorities** — what should happen next.
- **Session Handoff** — the practical "where the screwdriver was left": current
  branch, safe stopping point, and what the next developer should do first.

Then append an entry to **Project History** (newest on top) using this shape:

```
### YYYY-MM-DD

**Goal** — what this session set out to do.

**Completed**
- bullet points of what was done.

**Learned** — discoveries or decisions worth remembering.

**Next** — what to pick up next.
```

Rules:

- **Preserve important historical knowledge.** Do not destructively delete valuable
  context — summarize obsolete information or move it into Project History instead.
- Keep the document **concise and useful** for the next developer or AI.
- **Bump the `Last updated` date** at the top.
- Assume the next collaborator has no access to this conversation.

**Save the handoff to GitHub** (required — this closes the loop):

1. Stage and commit all changes from this session (code + docs), including the
   updated `docs/PROJECT_STATE.md`.
2. Push to the **current working branch** (usually `eeg-multidevice-refactor`).
   Do not merge to `main` unless a human explicitly asked.
3. In **Session Handoff**, note the branch name and that changes were pushed.

Example (adjust the message):

```bash
git add -A
git status   # review what will be committed
git commit -m "Brief summary of what this session accomplished."
git push origin HEAD
```

The next agent or developer should be able to `git pull` on that branch and
continue with no chat history.

Optional: if the architecture or vision changed, also update `docs/ARCHITECTURE.md`
or `docs/PROJECT.md` (these change rarely — only when the design or vision truly
shifts).
