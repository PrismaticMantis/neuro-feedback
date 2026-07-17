# NeuroSymphony — Project State

> **Branch review notice:** This version belongs to
> `codex/brainbit-contact-debugging-tyler` at the `bb4a996` checkpoint and describes
> this branch's changes relative to GitHub `main` (`ab50b65`). GitHub `main` remains
> the authoritative accepted project state. The physical-device findings below are
> confirmed observations; the resistance fallback and signal-contact classifier are
> experimental and should not be merged wholesale without further calibration.
>
> **Last updated:** 2026-07-16 (physical-iPad contact audit + fail-closed signal verification)
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

- Primary target: **BrainBit EEG on iPad (Capacitor)** — honest per-channel contact
  UX, responsive coherence graph/audio, stable 20-minute sessions (connection ≠
  usable EEG).
- Accepted project branch: **`main`**. Branch under review:
  **`codex/brainbit-contact-debugging-tyler`**.

## Branch Review Status

- **Confirmed from labeled physical-iPad testing:** the SDK emitted sustained
  `0.0 ohms` for all four channels both on-head and off-head; zero is not truthful
  evidence of contact. Off-head false green, unstable normal on-head readings, and
  pressure/release transients were reproduced while watching the UI and native logs.
- **Strong carry-forward behavior:** invalid resistance must fail closed; Bluetooth
  connection, EEG stream health, measured resistance contact, and signal-estimated
  contact must remain distinct in both logic and UI copy.
- **Experimental in this branch:** the bounded resistance-to-signal fallback,
  centered-AC independence threshold, rejection hold, and sustained C3/C4 signal
  verification.
- **Observed limitation:** the stricter experimental build could remain
  `Unverified` both on-head and off-head. The safety direction is useful, but its
  exact thresholds and timing are not validated and may be too strict.

## Recent Progress

- **False on-head resistance state fixed fail-closed.** Physical-iPad logs showed
  BrainBit SDK 1.0.6 returning `0.0 ohms` for A1/C3/C4/A2 for more than 960 frames,
  both on and off the head. Native and web layers now reject non-positive,
  non-finite, and open/over-range resistance values instead of treating zero as
  excellent contact.
- **Bounded contact probe with EEG fallback.** After 24 consecutive invalid
  resistance frames, setup stops resistance mode and starts live EEG signal mode;
  channel contact then uses differentiated EEG activity rather than an untruthful
  all-green resistance display. Setup text now distinguishes resistance measurement
  from EEG stream health.
- **Signal fallback now fails closed.** Physical-iPad off-head/on-head/pressure
  testing proved that momentary AC motion and a shared DC waveform could publish
  premature 4/4 green contact. Signal fallback now measures centered per-channel
  AC independence, rejects sentinel/stale/mixed frames before publication, waits
  1.5s after contamination, and requires 4s of continuous independent C3/C4
  activity before showing an explicitly labeled signal-only contact estimate.
- **Readiness cannot accumulate from unverified signal.** Contact, coherence, raw
  horseshoe quality, and the 12s Start gate all fail closed while signal verification
  is rejected or settling. Pressure/rebound transients reset verification.
- **Polling log noise removed.** `AudioEngine.getCoherenceMetrics()` no longer logs
  every UI poll, leaving device/contact evidence readable in Xcode.
- **Physical-iPad build synced.** Web production build, Swift relay build, CocoaPods,
  Capacitor sync, and Xcode package resolution passed; updated assets are in
  `ios/App/App/public` and ready to Run from Xcode.
- **Contact classifier retuned for BrainBit relay scale (µV).** Quiet resting AC maps
  to `quiet` → **usable**; flat uses conservative floors plus hysteresis. These
  per-channel states are displayed only after signal verification succeeds.
- **Pre-session gate tightened.** Stabilization requires both C3 and C4 to remain
  **active** (not merely usable) during the fixed 12s hold, after signal verification.
- **Coherence graph regression fixed.** Flat graph was caused by all-4-channel
  contact scoring dragging `electrodeQuality` below `calculateCoherence`'s gate
  (pinned at 0.15) when A1/A2 read flat. New `brainBitCoherenceElectrodeQuality01()`
  uses **C3/C4 only** (same montage as FFT); BrainBit gate uses
  `BRAINBIT_COHERENCE_MIN_CONTACT_VALIDITY` (0.32), not Athena 0.42.
- **iPad build synced** after classifier + coherence fixes (`npm run cap:sync:ios`).

## Known Issues / Watch List

- **SDK resistance remains unusable on the tested physical device.** Sustained
  all-zero resistance readings appear to be SDK/device behavior, not real electrode
  impedance. The app now fails closed and falls back, but the vendor/config cause is
  not yet proven.
- **Controlled framework comparison remains.** The app-vendored and separately
  supplied SDK frameworks both identify as 1.0.6 but have different binaries/build
  toolchains. Do not swap them without running the same truth-test protocol against
  each build.
- **Device re-test required for the stricter fallback.** Verify off-head remains
  unverified and cannot unlock Start; on-head must sustain independent C3/C4 AC for
  4s verification plus the 12s readiness hold. Tune the independence threshold only
  from labeled physical-device recordings.
- **Slow EEG stream start (~10s+).** BLE path (scan → connect → StartSignal → first
  chunk) — not WebSocket. Still not root-caused.
- **BrainBit sentinel frames (~0.4V).** Relay recovery works but adds startup latency
  and mid-session hiccups.
- **Device re-test needed post classifier + coherence fix.** Confirm: no early flat
  flashes, honest usable/active nodes, graph moves during session, start gate not
  too strict/loose, 20-minute soak.
- **Coherence clamp at 0.2** still possible from alpha-ceiling or contact-motion
  artifact helpers — distinct from contact-gate flatline at 0.15; check debug panel
  if graph stays low despite good C3/C4.
- **EEG-only metrics.** No HR/HRV/recovery from BrainBit — summaries must not
  display these for BrainBit sessions.

## Key Decisions (recent)

- **Invalid resistance fails closed** — zero, negative, non-finite, and open/over-range
  values are not evidence of contact and must never render green.
- **Resistance is optional evidence, not a gatekeeper** — a short invalid probe
  automatically yields to live EEG contact validation so a broken SDK impedance
  stream cannot permanently block setup.
- **Connection ≠ usable EEG** — top bar shows channel readiness; chunk-level stale
  is honest yellow, quiet live AC is usable (not stale).
- **Signal contact is an estimate, not impedance truth** — UI must say unverified,
  settling, or signal-only estimate; it must not claim physical on-head contact from
  a transient signal chunk.
- **Pre-session stabilization** — after signal verification, require 12s with both
  C3 and C4 active before Start unlocks; usable/stale/transient signal does not count.
- **Coherence contact = C3/C4 montage** — ear refs (A1/A2) often flat; must not
  zero the session coherence graph or detector contact input.
- **Simulation ≠ MVP sign-off** — replay tests speed dev; real iPad + headset required
  for human UX validation.

## Next Priorities

1. **Run the newly synced build on the physical iPad.** With the headset off-head,
   confirm the UI says contact unverified, all dots remain non-green, and readiness
   stays 0% after resistance falls back to signal.
2. Put the headset on and verify logs show sustained `independentResidualRmsUv`
   above threshold, then 4s verification and the 12s stabilization. Remove/reseat/
   press it and confirm verification/readiness reset immediately.
3. Run the included Headphones2 truth-test against the current vendored framework,
   then do a controlled comparison with the separately supplied SDK binary if needed.
4. Continue to coherence/audio validation and the 20-minute soak; save logs via
   `npm run logs:save`.

## Session Handoff

> "Where the screwdriver was left." The practical state for the next person.

- **Current branch:** `codex/brainbit-contact-debugging-tyler`; this document is a
  branch handoff relative to GitHub `main`, not a replacement for main's accepted
  project state.
- **Safe stopping point:** Zero-ohm resistance and signal-only contact both fail
  closed; centered channel independence plus sustained C3/C4 validation is built.
  The branch is a reviewable experiment: confirmed findings should carry forward,
  while the signal classifier requires labeled calibration before acceptance.
- **Next developer should:**
  - Open `ios/App/App.xcworkspace` and Run on the connected physical iPad.
  - Keep the Xcode console filter clear while checking the web fallback warning;
    native logs should then show `client command: startSignal` and signal chunks.
  - Test both off-head and on-head transitions before starting a session.
  - Watch coherence debug: `coherence` stuck at **0.15** = contact gate;
    **0.20** = alpha-ceiling / movement artifact clamp.
  - After test: `npm run logs:save` if issues; say **`session-end`** when done.

## Project History

The project's preserved memory: important milestones, discoveries, resolved
issues, and architectural decisions. One entry per working session, newest on top.
Keep each to Goal / Completed / Learned / Next — context, not a diary. When you
retire something from the dashboard above, fold its essence into an entry here
rather than deleting it.

### 2026-07-16 (physical-iPad contact audit + signal verification)

**Goal** — Prevent signal fallback from turning all four pads green off-head or
after pressure/movement transients.

**Completed**
- Audited live Xcode logs and QuickTime iPad UI off-head, on-head, under pressure,
  and after release. Off-head could publish 4/4 green; normal on-head was unstable;
  pressure reduced contact; release transients could jump back to 4/4.
- Replaced single-frame/raw-DC identity logic with centered cross-channel AC
  independence, rejection hold, and sustained C3/C4 verification.
- Made every readiness/audio quality path fail closed until verification and changed
  UI copy to say signal-only estimate rather than impedance/on-head truth.
- Removed high-rate AudioEngine metrics polling logs.

**Learned** — This headset/SDK's signal reacts strongly to movement and pressure,
so a live EEG chunk is evidence of transport and activity, not by itself proof of
skin contact. Only sustained differentiated behavior is usable as a conservative
estimate; native resistance remains the desired truth source.

**Next** — Sync and deploy, repeat the same labeled physical protocol, and calibrate
the centered-AC threshold from saved on/off/pressure recordings.

### 2026-07-16 (resistance truth + live EEG fallback)

**Goal** — Stop the setup screen from claiming all four electrodes are on-head when
the BrainBit SDK returns zero for every resistance channel, and keep the headset
usable through the real EEG stream.

**Completed**
- Confirmed on physical iPad that A1/C3/C4/A2 remained `0.0 ohms` for more than
  960 frames regardless of actual head contact.
- Made non-positive/invalid resistance fail closed in the native relay and web
  classifier; all-flat snapshots now explicitly represent no contact.
- Added a 24-frame invalid-resistance fallback from resistance mode to signal mode
  and clarified the setup UI's measurement source/status.
- Passed production web build and Swift build; synced Capacitor/CocoaPods/Xcode
  dependencies and assets into the iOS project.

**Learned** — In this SDK/device combination, zero is an invalid or uninitialized
resistance sentinel, not perfect contact. Bluetooth connection, resistance validity,
and usable EEG are separate states and must remain separate in both logic and copy.

**Next** — Deploy from Xcode, confirm the fallback reaches live EEG and behaves
truthfully through off-head/on-head transitions, then run the SDK truth-test and
20-minute session soak.

### 2026-07-16 (contact classifier + coherence graph)

**Goal** — Honest BrainBit per-channel contact states without breaking session
coherence graph; tighten pre-session gate so stale-only does not unlock Start.

**Completed**
- Retuned relay contact thresholds: `quiet` rule (usable), flat hysteresis, lower
  good/flat floors for µV scale.
- Stabilization: active/usable only, C3/C4 must not be stale, fixed 12s hold.
- Fixed flat coherence graph: `brainBitCoherenceElectrodeQuality01()` (C3/C4);
  BrainBit-specific `calculateCoherence` contact gate (0.32).
- `cap:sync:ios` for iPad retest.

**Learned** — Per-channel contact honesty and coherence scoring must use the same
montage (C3/C4). All-4-channel contact averaging silently pinned coherence at
0.15 when ear refs went flat after classifier tightening — looked like a broken
graph, not a detector bug.

**Next** — iPad soak test; confirm graph moves and start gate feels right; tune
thresholds from saved logs if needed.

### 2026-07-16 (channel honesty layer)

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
