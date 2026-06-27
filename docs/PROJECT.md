# NeuroSymphony — Project Overview

> Read this first. This document is the **vision and philosophy** of the project:
> what we're building, why, and what our decisions should optimize for. For *how
> to install and run* the app, see `README.md`. For *current status, known issues,
> and recent decisions*, see `docs/PROJECT_STATE.md`.

## For AI Agents — Read This First

You will help build this product. When you are uncertain between two
implementation choices, **prefer the one that improves participant experience,
reliability, and long-term maintainability over short-term optimization or
cleverness.** When in doubt, favor clarity, reliability, and clean seams over
clever shortcuts. The rest of this document explains the product well enough for
you to apply that judgment.

At the start of a session follow `prompts/session-start.md`; at the end follow
`prompts/session-end.md` to update `docs/PROJECT_STATE.md` (the shared memory).

## What We're Building

NeuroSymphony creates **immersive, neuroadaptive experiences** that help
participants access deeper states of flow, creativity, relaxation, and presence
by adapting sound and environment to them in real time.

The purpose of this application is **not simply to measure brain activity**. It is
to create immersive experiences that feel *alive* by responding intelligently to
the participant. The brain signal is a means; the experience is the product.

A participant wears an EEG headset; the app reads their brain activity in real
time, derives one or more **brain-state metrics** (currently a coherence
estimate), and uses those to evolve the soundscape — rewarding and deepening the
state as the participant settles into it. The result is a biofeedback loop that
makes flow tangible, repeatable, and memorable.

This repo is the **foundation of a platform**, not a one-off demo. Design and code
accordingly: favor clarity, reliability, and clean seams over clever shortcuts.

## Naming

- **NeuroSymphony** — the product name (see the marketing site below).
- **neuro-feedback** — the git repository name / internal engineering name.
- Legacy note: older code, some docs, and the marketing domain
  (`experienceneuroflo.lovable.app`) still carry an earlier name. Treat any such
  reference as NeuroSymphony — it is the same product.

## Product Overview

From the marketing site (experienceneuroflo.lovable.app): NeuroSymphony delivers
"immersive sound and brain-responsive environments that help creators, teams, and
event guests access deeper focus, flow, and creative clarity."

- **Format**: Facilitator-led, in-person sessions for B2B experiential
  activations — product launches, conferences, offsites, installations, retreats.
- **Worlds**: Each session is themed as an immersive environment (e.g. Waterfall
  Grotto, Aurora Drift, Whale Migration, Cosmic Purr) that responds to the
  participant's brain state.
- **Takeaway**: Every session is measured. The participant leaves with a **session
  summary** (their brain-state metric over time, peaks/averages, stability,
  duration) — a concrete signal of their shift and a story worth sharing.
- **Provenance**: Built on a grant-backed Phase 1 trial with a San Francisco
  neuroscience firm, now evolved into a fully neuroadaptive experience.
- **Equipment**: Portable vibroacoustic soundbeds, EEG/biofeedback headsets, and
  immersive audio — rentable for events.

## Experience Pipeline

The app is the session runtime the facilitator drives. At a high level it:

1. **Acquires EEG** from the headset in real time.
2. **Processes the signal** into frequency bands and signal-quality measures.
3. **Derives a brain-state metric** (currently a coherence estimate) that
   represents how settled/focused the participant is.
4. **Stabilizes that signal** through a state machine with hysteresis and sustain
   timers, so the experience responds to genuine shifts, not momentary noise.
5. **Adapts the audio environment** in response — layering and evolving the
   soundscape as the participant deepens and sustains the state.
6. **Summarizes the session** into a shareable takeaway.

> The metric, the bands, and the audio mapping are all expected to evolve. Treat
> "coherence" as today's implementation of "the brain-state metric," not a
> permanent contract. Implementation specifics live in `docs/PROJECT_STATE.md` and
> `docs/app-architecture-summary.md`.

## The EEG Integration — What It's For

The EEG headset (currently a BrainBit device) is the **sensory input** that makes
the experience adaptive rather than scripted. Its only job is to provide a
trustworthy, real-time signal of the participant's brain state so the soundscape
can respond to *them*.

Principles that govern this integration:

- **Honest data only.** We only present metrics the hardware can actually support.
  If the hardware can't measure it, the UI doesn't claim it (e.g. no fabricated
  heart-rate / HRV / "recovery" numbers from an EEG-only headset).
- **Robust acquisition.** EEG is noisy and BLE is flaky; the headset needs warm-up
  and can stall. Acquisition must self-recover and degrade gracefully — never
  hard-crash a live session in front of guests.
- **Hardware-agnostic by design.** EEG sources sit behind a device abstraction so
  the product is not married to one headset. New hardware should slot in behind
  the same seam.

## Product Vision

> "NeuroSymphony makes flow wildly accessible through unforgettable immersive
> experiences that feel like art and awaken the state where your best work begins."

Concretely, the near-term product is a **reliable, facilitator-led B2B activation**
that (a) connects to a headset, (b) adapts the experience to the participant's
brain state, and (c) sends them off with a credible session summary. The
longer-term goal is a **platform**: more "worlds," more hardware, richer
measurement, and eventually self-serve / installation deployments. Build the MVP
so the platform is possible — not so the MVP has to be thrown away.

## Success Criteria

A first-time participant should be able to:

- Sit on the sound bed.
- Put on the EEG headset.
- Connect without frustration.
- Begin a session within a few minutes.
- Experience an adaptive environment that feels natural and immersive.
- Leave feeling meaningfully different than when they arrived.

If the participant remembers the experience instead of the technology, we have
succeeded.

## Engineering Principles

1. **Reliability over features.** A session that always works beats one with more
   knobs. The headset link, audio playback, and summary are the critical path.
2. **Honest signals.** Never present invented or unsupported biometrics. If the
   hardware can't measure it, the UI doesn't claim it.
3. **Graceful degradation.** EEG is noisy and BLE is flaky. Use hysteresis,
   watchdogs, recovery, and sensible fallbacks; never hard-crash a live session.
4. **Clear seams.** Keep acquisition, signal processing, state, audio, and UI
   loosely coupled. This is what lets the demo grow into a platform.
5. **Non-destructive changes.** Prefer additive, reversible edits to existing,
   working code paths.
6. **Facilitator-first UX.** The operator runs this live in front of guests; setup,
   connection status, and recovery must be obvious and calm.

## What Decisions Should Optimize For

When choosing between options, prefer the one that improves, in order:

1. **In-session reliability** — does the headset connect and the audio play, every
   time, on the target device?
2. **Trustworthy data** — is the brain-state metric and summary honest and stable?
3. **Participant / facilitator experience** — is it smooth, legible, and memorable?
4. **Platform extensibility** — does this keep clean seams for more worlds,
   hardware, and deployment modes later?
5. **Velocity** — ship the smallest change that achieves the above.

Avoid: speculative abstractions with no current consumer, fabricated metrics, and
changes that destabilize the working real-time/audio paths.

## Where to Look in the Code

- `src/lib/audio-engine.ts` — adaptive audio layers + sustained-state logic.
- `src/lib/flow-state.ts` — brain-state metric (coherence) detection and scoring.
- `src/lib/coherence-state-machine.ts` — baseline/stabilizing/coherent transitions.
- `src/lib/eeg/` — EEG device abstraction, BrainBit bridge, contact quality,
  stream health.
- `native/brainbit-ios-relay/` — Swift BLE relay (neurosdk2 → WebSocket).
- `ios/` — Capacitor iOS shell; `capacitor.config.ts` — app config.
- `api/send-report.ts` — emailed session report (Resend/Vercel).
- `docs/app-architecture-summary.md` — deeper dive on phases, thresholds, signals.

## Related Docs

- `README.md` — installation, running, and contribution mechanics.
- `docs/ARCHITECTURE.md` — why the system is designed the way it is (design
  rationale behind the relay, WebSocket, Capacitor, state machine, audio layering,
  and the EEG abstraction).
- `docs/PROJECT_STATE.md` — current status, known issues, recent decisions, next
  priorities, and project history (the living layer; updated every working session).
- `docs/app-architecture-summary.md` — detailed signal/audio architecture.
- `prompts/session-start.md` / `prompts/session-end.md` — onboarding and handoff
  workflow for any developer or AI agent.
