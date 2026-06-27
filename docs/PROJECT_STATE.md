# NeuroSymphony — Project State

> **Last updated:** 2026-06-26
>
> This is the **living dashboard** of the project. The top sections always reflect
> the *current* state. **Update it at the end of every working session** (human or
> AI): what changed, what broke, what was decided, and what's next. If this file
> contradicts `PROJECT.md`, `PROJECT.md` wins on philosophy and this file wins on
> "what is true right now."
>
> **Non-destructive rule:** do not delete valuable context. When something is no
> longer current, *summarize it or move it into Project History* rather than
> removing it. This file is the project's memory.

## AI Session Instructions

When ending a work session (see `prompts/session-end.md` for the full prompt):

1. Update the dashboard sections (Current Focus, Known Issues, Recent Progress,
   Key Decisions, Next Priorities) to reflect reality.
2. Summarize or relocate obsolete information into **Project History** — don't
   destroy valuable context.
3. Preserve discoveries, resolved issues, and architectural decisions worth
   remembering.
4. Append a dated **Project History** entry and refresh **Session Handoff**.
5. Bump the **Last updated** date. Keep the document concise.
6. Assume another developer or AI will continue tomorrow with no chat history.

## Current Focus

- Primary target: **BrainBit EEG on iPad (Capacitor)**.
- Primary branch: **`main`** (`eeg-multidevice-refactor` merged 2026-06-26).

## Recent Progress

- **Audio loading fixed (Capacitor iOS).** Baseline/coherence/sustained MP3 layers
  now load via `XMLHttpRequest` with multiple URL candidates instead of `fetch()`.
  Reason: in WKWebView, `fetch()` for custom-scheme (`capacitor://localhost/`)
  assets returns opaque responses with `status: 0`, so `resp.ok` failed and audio
  silently never loaded. Binaural beats were unaffected (they are synthesized).
- **BrainBit channel diagnostics.** Per-channel stuck-at-0.4V detection +
  `getBrainBitChannelDiagnostics()`, surfaced via `useBrainBitChannelActivity`
  hook and a 4-node (A1/C3/C4/A2) activity UI; signal-status wording now reflects
  partial connectivity.
- **Documentation + agent workflow.** Four-doc system (README, PROJECT,
  ARCHITECTURE, PROJECT_STATE), session prompts, and `AGENTS.md` entrypoint.
- **Merged to `main`.** All BrainBit iPad work and docs now on the default branch;
  fresh clones get the full system without checking out a feature branch.

## Known Issues / Watch List

- **Slow EEG stream start (~10s+).** Time from session start to first valid EEG
  chunk regressed to ~10s. The delay is in the BLE path (scan → connect →
  StartSignal → first chunk) and its watchdog/retry recovery, not the WebSocket.
  Not yet root-caused; no code change made yet pending investigation.
- **BrainBit sentinel frames (~0.4V on all channels).** The device intermittently
  emits stuck/identical samples; the relay detects streaks and triggers
  signal-restart / full-reconnect recovery. Recovery works but contributes to
  startup latency and occasional mid-session hiccups.
- **EEG-only metrics.** No HR/HRV/recovery from BrainBit — summaries must not
  display these for BrainBit sessions.

## Key Decisions (recent)

- **XHR over `fetch()` for local audio assets** in WKWebView (see above).
- **Repo hygiene:** `src-tauri/target/` (Rust build artifacts, ~1.9GB), the
  `brainbit-web/` vendor clone (separate git repo), and the iOS-bundled audio MP3s
  (duplicates; excluded by Capacitor's generated `ios/.gitignore`) are kept out of
  git.
- **Coherence is "today's brain-state metric," not a permanent contract** — code
  and docs should keep room for alternative/additional metrics.

## Next Priorities

1. Investigate and reduce the ~10s EEG stream startup delay.
2. Confirm audio fix on-device across full session lifecycle (start/stop/restart).

## Session Handoff

> "Where the screwdriver was left." The practical state for the next person.

- **Current branch:** `main`
- **Safe stopping point:** BrainBit channel diagnostics complete; Capacitor iOS
  audio loading fixed; documentation + agent workflow on `main`. Feature branch
  merged; no known merge conflicts.
- **Next developer should:**
  - `git checkout main && git pull`
  - Read `AGENTS.md` and follow `prompts/session-start.md` before changing code.
  - Investigate the BLE startup delay *before* changing connection architecture.

## Project History

The project's preserved memory: important milestones, discoveries, resolved
issues, and architectural decisions. One entry per working session, newest on top.
Keep each to Goal / Completed / Learned / Next — context, not a diary. When you
retire something from the dashboard above, fold its essence into an entry here
rather than deleting it.

### 2026-06-26 (merge)

**Goal** — Make `main` the source of truth for code and documentation.

**Completed**
- Fast-forward merged `eeg-multidevice-refactor` → `main` (19 commits, no conflicts).
- Pushed `main` to GitHub.
- Updated AGENTS.md, README, PROJECT_STATE, and session-end prompt to reference `main`.

**Learned** — GitHub's default branch is what most collaborators hit first; docs
and agent workflow must live there to be useful.

**Next** — Investigate BrainBit/BLE startup latency.

### 2026-06-26

**Goal** — Build out the project documentation ecosystem.

**Completed**
- Authored `docs/PROJECT.md` (vision/philosophy) and `docs/ARCHITECTURE.md`
  (design rationale).
- Rewrote stale `README.md` for the BrainBit/iPad/Capacitor reality.
- Created this file; completed the NeuroFlo → NeuroSymphony rebrand.

**Learned** — Separating philosophy (PROJECT) from mechanics (README) from current
state (PROJECT_STATE) from rationale (ARCHITECTURE) produces much cleaner onboarding
for both humans and AI.

**Next** — Investigate BrainBit/BLE startup latency.

### 2026-06-25

**Goal** — Get adaptive audio working on iPad and surface BrainBit signal quality.

**Completed**
- Fixed Capacitor iOS audio loading (switched MP3 layers to `XMLHttpRequest`).
- Added BrainBit per-channel diagnostics + activity UI.
- Committed and pushed to `eeg-multidevice-refactor`.

**Learned** — In WKWebView, `fetch()` of custom-scheme assets returns `status: 0`;
XHR is required. Synthesized audio (binaural beats) was unaffected.

**Next** — Document the system; investigate EEG startup delay.
