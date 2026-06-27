# NeuroSymphony — Project Overview

> Read this first. It gives collaborators (and their AI assistants) a baseline
> understanding of what this project is, what the app does technically, and what
> our engineering decisions should optimize for.

## TL;DR

NeuroSymphony is a **neuroadaptive immersive sound experience**. A guest wears a
BrainBit EEG headset; the app reads their brain activity in real time, estimates
a **coherence** signal (a proxy for focused, calm, flow-like states), and adapts
the soundscape in response. When the guest sustains coherence, the audio
environment evolves and rewards the state — closing a biofeedback loop that makes
"flow" tangible and repeatable.

This repo is the **foundation of a platform**, not a one-off demo. Design and code
accordingly: favor clarity, reliability, and clean seams over clever shortcuts.

## Naming

- **NeuroSymphony** — the product name (see the marketing site below).
- **neuro-feedback** — the git repository name / internal engineering name.
- Legacy note: older code, some docs, and the marketing domain
  (`experienceneuroflo.lovable.app`) still carry an earlier name. Treat any such
  reference as NeuroSymphony — it is the same product.

## What the Product Is

From the marketing site (experienceneuroflo.lovable.app): NeuroSymphony delivers
"immersive sound and brain-responsive environments that help creators, teams, and
event guests access deeper focus, flow, and creative clarity."

- **Format**: Facilitator-led, in-person sessions for B2B experiential
  activations — product launches, conferences, offsites, installations, retreats.
- **Worlds**: Each session is themed as an immersive environment (e.g. Waterfall
  Grotto, Aurora Drift, Whale Migration, Cosmic Purr) that responds to the guest's
  neural coherence.
- **Takeaway**: Every session is measured. The guest leaves with a **session
  summary** (coherence over time, peak/average coherence, stability, duration) —
  a concrete signal of their shift and a story worth sharing.
- **Provenance**: Built on a grant-backed Phase 1 trial with a San Francisco
  neuroscience firm, now evolved into a fully neuroadaptive experience.
- **Equipment**: Portable vibroacoustic soundbeds, EEG/biofeedback headsets, and
  immersive audio — rentable for events.

## What the App Does (Technically)

The app is a **React + TypeScript** front end that runs as an iPad app via
**Capacitor** (WKWebView). It is the session runtime the facilitator drives.

High-level pipeline:

1. **Acquire EEG** from the BrainBit headset over **BLE** (see integration below).
2. **Process the signal** in the front end: FFT → bandpower (delta/theta/alpha/
   beta/gamma) → contact-quality heuristics.
3. **Estimate coherence** (0–1) from bandpower + variance/stability, gated by
   signal-validity checks.
4. **Run a state machine** (`baseline → stabilizing → coherent`) with hysteresis
   and sustain timers so the experience doesn't flicker on noisy data.
5. **Adapt audio** via a Web Audio `AudioEngine` that crossfades layered tracks
   (baseline → coherence → sustained-coherence) plus synthesized binaural beats.
6. **Summarize the session** into a shareable summary (and optional emailed PDF).

### Architecture / Data Flow

```
BrainBit headset ──BLE──▶ native iOS relay (Swift, neurosdk2)
                              │  EEG samples as JSON
                              ▼
                    local WebSocket (ws://127.0.0.1:8765)
                              │
                              ▼
   React app (WKWebView): DSP → coherence → state machine → AudioEngine → summary
```

Two transports, by design:

- **Headset ↔ iPad: BLE.** The native Swift relay (`native/brainbit-ios-relay`)
  uses Neurosoft's `neurosdk2` (wrapping CoreBluetooth) to scan, connect, and
  stream EEG. The app itself never speaks Bluetooth.
- **Relay ↔ app: local WebSocket.** EEG arrives in the web layer as JSON over a
  loopback socket, decoupling signal acquisition from the UI/DSP.

### Tech Stack

- **Front end**: React 19, TypeScript, Vite, Framer Motion, React Router, Recharts.
- **Audio**: Web Audio API (`src/lib/audio-engine.ts`), MP3 layers + synthesized
  binaural beats. (Note: in WKWebView, audio assets load via `XMLHttpRequest`, not
  `fetch`, because `fetch` returns opaque `status: 0` for custom-scheme assets.)
- **Mobile shell**: Capacitor 7 (`ios/`), Vite `base: './'` for asset resolution.
- **Native relay**: Swift Package (`native/brainbit-ios-relay`) + Tauri desktop
  scaffolding (`src-tauri/`) for non-iPad contexts.
- **Reporting**: jsPDF/html2canvas summaries; Resend via a Vercel function
  (`api/send-report.ts`) for emailed reports.

## BrainBit Lite Integration — What It's For

The BrainBit headset is the **sensory input** that makes the experience adaptive
rather than scripted. Its only job is to provide a trustworthy, real-time signal
of the guest's brain state so the soundscape can respond to *them*.

- **Channels**: 4 EEG channels (labeled A1, C3, C4, A2 in the relay). Coherence is
  derived primarily from the central channels.
- **Honest data only**: We only present metrics the hardware can actually support.
  Heart-rate / HRV / "recovery" style metrics are **not** derived from BrainBit and
  must not be fabricated in BrainBit summaries.
- **Robust acquisition**: BrainBit can emit stuck/sentinel frames (e.g. ~0.4V on
  all channels) and needs warm-up. The relay includes scan/connect watchdogs,
  signal-restart and full-reconnect recovery, and the app tracks per-channel
  activity and stream health. Expect a startup delay (~10s) for scan → connect →
  first valid chunk; that lives in the BLE path, not the WebSocket.
- **Multi-device aware**: EEG sources sit behind a device abstraction
  (`src/lib/eeg/`) so BrainBit, Muse, and bridge devices can coexist.

## Product Vision

> "NeuroSymphony makes flow wildly accessible through unforgettable immersive
> experiences that feel like art and awaken the state where your best work begins."

Concretely, the near-term product is a **reliable, facilitator-led B2B activation**
that (a) connects to a headset, (b) adapts sound to the guest's coherence, and
(c) sends them off with a credible session summary. The longer-term goal is a
**platform**: more "worlds," more hardware, richer measurement, and eventually
self-serve / installation deployments. Build the MVP so the platform is possible —
not so the MVP has to be thrown away.

## Engineering Principles

1. **Reliability over features.** A session that always works beats one with more
   knobs. The headset link, audio playback, and summary are the critical path.
2. **Honest signals.** Never present invented or unsupported biometrics. If the
   hardware can't measure it, the UI doesn't claim it.
3. **Graceful degradation.** EEG is noisy and BLE is flaky. Use hysteresis,
   watchdogs, recovery, and sensible fallbacks; never hard-crash a live session.
4. **Clear seams.** Keep acquisition (relay), signal processing, state, audio, and
   UI loosely coupled (e.g. the WebSocket boundary, the EEG device abstraction).
   This is what lets the demo grow into a platform.
5. **Non-destructive changes.** Prefer additive, reversible edits to existing,
   working code paths (binaural beats, the state machine, etc.).
6. **Facilitator-first UX.** The operator runs this live in front of guests; setup,
   connection status, and recovery must be obvious and calm.

## What Decisions Should Optimize For

When choosing between options, prefer the one that improves, in order:

1. **In-session reliability** — does the headset connect and the audio play, every
   time, on the target iPad?
2. **Trustworthy data** — is the coherence signal and summary honest and stable?
3. **Guest/facilitator experience** — is it smooth, legible, and memorable?
4. **Platform extensibility** — does this keep clean seams for more worlds,
   hardware, and deployment modes later?
5. **Velocity** — ship the smallest change that achieves the above.

Avoid: speculative abstractions with no current consumer, fabricated metrics, and
changes that destabilize the working real-time/audio paths.

## Where to Look in the Code

- `src/lib/audio-engine.ts` — adaptive audio layers + sustained-coherence logic.
- `src/lib/flow-state.ts` — coherence detection and scoring.
- `src/lib/coherence-state-machine.ts` — baseline/stabilizing/coherent transitions.
- `src/lib/eeg/` — EEG device abstraction, BrainBit bridge, contact quality,
  stream health.
- `native/brainbit-ios-relay/` — Swift BLE relay (neurosdk2 → WebSocket).
- `ios/` — Capacitor iOS shell; `capacitor.config.ts` — app config.
- `api/send-report.ts` — emailed session report (Resend/Vercel).
- `docs/app-architecture-summary.md` — deeper dive on phases, thresholds, signals.

## Build / Run (quick reference)

- `npm run dev` — web dev server.
- `npm run build:brainbit-ipad` — production build for the iPad/Capacitor shell.
- `npm run cap:sync:ios` — build + sync assets into the iOS project.
- `npm run cap:open:ios` — open the iOS project in Xcode.
- `npm run brainbit-ios-relay:run` — run the native BLE relay CLI (macOS).

See `package.json` scripts for the full set.
