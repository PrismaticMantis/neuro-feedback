# NeuroSymphony — Project State

> **Last updated:** 2026-07-16
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

- Primary target: **BrainBit EEG on iPad (Capacitor)** — honest signal UX + stable
  20-minute sessions (connection ≠ usable EEG).
- Primary branch: **`main`**.

## Recent Progress

- **BrainBit channel honesty layer.** Added `stale` channel state, per-channel
  classification from classifier rules (not horseshoe alone), signal confidence
  (0–1), pre-session contact stabilization gate, and session-mode-driven audio
  contact gates. UI: "Channel readiness" bar (not BLE strength), graph opacity
  reflects confidence, 4-node activity in setup and active session.
- **Fixed synchronized channel dots.** Chunk-level `forceContactDegradeAll` no
  longer overwrites all four channels' display rules — dots can differ per pad.
  Relaxed `goodMinVar` slightly (14 → 9) to reduce spurious stale-dc.
- **Coherence SM grace for BrainBit.** Optional `minContactQualityWhenSignalValid`
  + `contactGraceMs` when detector still trusts EEG during brief stale windows.
- **Session event logging.** `logBrainBitSessionEvent` for session start, channel
  recovery, coherence enter/exit, headset adjustment (console; foundation for replay).
- **iOS log capture scripts.** `npm run logs:save` / `logs:ios` for Xcode debugging.
- **iPad build synced.** `npm run cap:sync:ios` run multiple times this session;
  app ready to Run from Xcode on physical iPad (no Mac cable needed after install).

## Known Issues / Watch List

- **Slow EEG stream start (~10s+).** BLE path (scan → connect → StartSignal → first
  chunk) — not WebSocket. Still not root-caused.
- **BrainBit sentinel frames (~0.4V).** Relay recovery works but adds startup latency
  and mid-session hiccups.
- **Stale vs active still flickers on device.** Per-channel UI fix landed; needs iPad
  re-test to confirm dots behave independently and stabilization gate is not too
  strict or too loose.
- **MVP not yet validated at 20 minutes.** Code + UI improved; soak test with saved
  logs still required for sign-off.
- **EEG-only metrics.** No HR/HRV/recovery from BrainBit — summaries must not
  display these for BrainBit sessions.

## Key Decisions (recent)

- **Connection ≠ usable EEG** — top bar shows channel readiness; stale is honest
  yellow, not hidden behind 100% "connected."
- **Chunk contamination vs per-channel display** — global degrade tightens audio/
  aggregate gates only; channel dots use per-channel classifier rules.
- **Pre-session stabilization** — require ~8–12s of acceptable channels (incl. stale
  when stream live) before Start unlocks.
- **Simulation ≠ MVP sign-off** — replay tests speed dev; real iPad + headset required
  for human UX validation (documented in hiring/trial brief discussion).

## Next Priorities

1. **iPad device test** — connect BrainBit, verify independent channel dots, run toward
   20-minute soak; save logs via `npm run logs:save`.
2. Tune stale/stabilization thresholds if start gate blocks too long or stale too noisy.
3. Investigate ~10s EEG stream startup delay (BLE path).

## Session Handoff

> "Where the screwdriver was left." The practical state for the next person.

- **Current branch:** `main` (synced with `origin/main` after this session-end)
- **Safe stopping point:** BrainBit honesty/stabilization/confidence work committed;
  iPad build synced locally via `cap:sync:ios`. Not yet device-validated post
  channel-dot fix.
- **Next developer should:**
  - `git checkout main && git pull`
  - Say **`session-start`** before changing code.
  - Run on **physical iPad** (BrainBit via BLE — no Mac cable during session).
  - Build/deploy: `npm run cap:sync:ios` → Xcode → Run on iPad.
  - After test: `npm run logs:save` if issues; say **`session-end`** when done.

## Project History

The project's preserved memory: important milestones, discoveries, resolved
issues, and architectural decisions. One entry per working session, newest on top.
Keep each to Goal / Completed / Learned / Next — context, not a diary. When you
retire something from the dashboard above, fold its essence into an entry here
rather than deleting it.

### 2026-07-16

**Goal** — BrainBit MVP UX honesty (stale signal, channel readiness, stabilization)
and iPad test readiness.

**Completed**
- Channel state module (`stale`, session mode, stabilization hold, readiness bar).
- Signal confidence → coherence graph opacity; BrainBit-specific audio/contact gates.
- Pre-session stabilization gate + `BrainBitContactStabilization` UI.
- Fixed all-four-dots-sync bug (chunk degrade no longer clones display rules).
- iOS log scripts; multiple `cap:sync:ios` builds for Xcode deploy.

**Learned** — Chunk-level stale detection was stamping the same label on all channels,
which felt dishonest in UI; separating display rules from aggregate gates fixes that.
iPad runs standalone after install (USB only for deploy/debug logs).

**Next** — iPad soak test with saved logs; tune stale/stabilization if needed; BLE
startup delay investigation.

### 2026-06-27 (orientation only)

**Goal** — Load project context via `session-start`; no code or doc changes intended.

**Completed**
- Ran the `session-start` workflow: read README, PROJECT, PROJECT_STATE, ARCHITECTURE.
- Summarized product, architecture (relay→WebSocket→app→audio), known issues, and next priorities back to the operator.

**Learned** — Nothing new about the system; dashboard already accurate. Recording this session only to keep an honest handoff trail (no fabricated progress, no empty code commit).

**Next** — Investigate the ~10s BrainBit/BLE startup latency (read-only diagnosis first); confirm on-device audio fix across the session lifecycle.

### 2026-06-27

**Goal** — Finalize agent-agnostic collaboration workflow and validate session prompts.

**Completed**
- Rewrote session-start/end for any AI tool; added `prompts/README.md`.
- Merged all work to `main`; documented `main` as primary branch everywhere.
- Validated `session-start` and `session-end` shorthands in live session.

**Learned** — `git pull` syncs files only; agents need an explicit session-start/end
trigger. Shorthand commands work; `@` or `Follow prompts/...` is the reliable fallback.

**Next** — Investigate BrainBit/BLE startup latency; confirm audio on-device.

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
