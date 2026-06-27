# NeuroSymphony (neuro-feedback)

**This repository is the iPad application that powers NeuroSymphony's neuroadaptive
immersive sound experiences.** A participant wears an EEG headset; the app reads
their brain activity in real time and adapts the soundscape to help them reach and
sustain a flow state. (You're working on the *software* here — not the company or
the physical activation.)

This README covers **mechanics** — how to install, run, and contribute. For the
product vision and engineering philosophy, read [`docs/PROJECT.md`](docs/PROJECT.md).
For current status, known issues, and next priorities, read
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Current Status

- **Primary platform:** iPad · BrainBit (EEG) · Capacitor · Swift BLE relay
- **Development focus:** stable BrainBit integration · adaptive sound engine ·
  session experience
- **Future roadmap:** additional EEG devices · expanded immersive worlds ·
  lighting / environmental adaptation

## Documentation & Workflow

This project uses a small set of documents as its **shared memory**. Git preserves
code history; these documents preserve project *understanding* — so any developer
or AI agent can clone the repo and get productive without relying on chat history.

| Document | Purpose | Changes |
|---|---|---|
| `README.md` (this file) | How to install, run, and contribute. | Per release |
| [`docs/PROJECT.md`](docs/PROJECT.md) | Why the project exists — vision, purpose, engineering philosophy, AI principles. | Rarely |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the system is designed and **why**; components, data flow, future expansion. | When the architecture does |
| [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) | Living dashboard — current focus, known issues, progress, decisions, next priorities, and project history. | Every session |
| [`AGENTS.md`](AGENTS.md) | Entry point for AI agents — points to the session prompts and active branch. | When workflow changes |

**Primary branch:** `main`. A fresh clone on `main` has the current BrainBit/iPad
app, documentation system, and agent workflow.

**Session workflow (humans and AI agents):**

- **Starting work?** Say `session-start`, or `Follow prompts/session-start.md`, or
  attach `prompts/session-start.md`. See [`prompts/README.md`](prompts/README.md).
- **Finishing work?** Say `session-end`, or `Follow prompts/session-end.md`, or
  attach `prompts/session-end.md`.

Before making architectural changes, always read `docs/PROJECT.md`,
`docs/ARCHITECTURE.md`, and `docs/PROJECT_STATE.md`.

## System Architecture

```
EEG headset ──BLE──▶ native relay (Swift, neurosdk2) ──WebSocket──▶ React app (Capacitor/iPad)
```

- **Headset → relay**: BLE via Neurosoft `neurosdk2` (the app never speaks Bluetooth directly).
- **Relay → app**: EEG streamed as JSON over a local WebSocket (`ws://127.0.0.1:8765`).
- **App**: React + TypeScript front end (DSP → brain-state metric → state machine →
  adaptive Web Audio → session summary), shipped to iPad via Capacitor.

The primary target hardware today is **BrainBit** (EEG) on **iPad** (Capacitor).
A Muse path and an "Athena" LibMuse bridge also exist behind the EEG device
abstraction (`src/lib/eeg/`).

For *why* the system is shaped this way (relay + WebSocket, Capacitor, state
machine, layered audio, device abstraction), see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Prerequisites

- **Node.js 18+** and npm
- **Xcode** (for the iPad/Capacitor build and the native BLE relay)
- An EEG headset (BrainBit) for live sessions
- For the browser-only Muse path: a Chromium-based browser (Web Bluetooth)

## Install

```bash
npm install
```

## Run

### 1. Web dev server (UI work, no native relay)

```bash
npm run dev
```

Fastest loop for UI and front-end logic. Live BrainBit EEG requires the native
relay (below); without it you can still work on everything downstream of the
WebSocket.

### 2. iPad build (BrainBit, production target)

```bash
npm run build:brainbit-ipad   # Vite build in brainbit-ipad mode
npm run cap:sync:ios          # build + copy web assets into the iOS project
npm run cap:open:ios          # open the project in Xcode to run on a device
```

Then build/run the `App` scheme onto a connected iPad from Xcode. The native BLE
relay is bundled into the iOS app and starts automatically; tap **Connect
BrainBit** in-app to begin the BLE scan.

Environment config for this mode lives in `.env.brainbit-ipad`
(see `.env.brainbit-ipad.example`).

### 3. Native BLE relay on macOS (relay development / smoke tests)

```bash
npm run brainbit-ios-relay:run     # run the relay CLI (scans + streams over WebSocket)
npm run brainbit-relay:smoke       # smoke test
```

See `package.json` `scripts` for the full set (Athena bridge, truth-test host,
desktop/Tauri dev, etc.).

## Email Reports (optional)

Session summaries can be emailed via a Vercel function (`api/send-report.ts`) using
Resend. Setup and required environment variables are documented in
[`README_EMAIL_SETUP.md`](README_EMAIL_SETUP.md).

## Project Structure

```
src/
├── lib/
│   ├── audio-engine.ts            # Adaptive Web Audio layers + sustained-state logic
│   ├── flow-state.ts              # Brain-state metric (coherence) detection & scoring
│   ├── coherence-state-machine.ts # baseline / stabilizing / coherent transitions
│   ├── eeg/                       # EEG device abstraction (BrainBit, Muse, Athena bridge)
│   ├── muse-handler.ts            # Muse connection + FFT processing
│   └── summary-pdf.ts             # Session summary / PDF export
├── hooks/                         # React hooks (EEG, audio, session, relay status)
├── components/                    # UI (setup, active session, summary, status)
├── App.tsx                        # Web/Muse entry
├── AppBrainBitMvp.tsx             # BrainBit/iPad entry
└── types.ts

native/brainbit-ios-relay/         # Swift BLE relay (neurosdk2 → WebSocket)
ios/                               # Capacitor iOS shell
src-tauri/                         # Tauri desktop scaffolding
api/send-report.ts                 # Emailed session report (Resend/Vercel)
docs/                              # PROJECT.md, ARCHITECTURE.md, PROJECT_STATE.md, notes
prompts/                           # session-start.md, session-end.md, README (workflow)
```

## Contributing

- Read [`docs/PROJECT.md`](docs/PROJECT.md) first for the principles that should
  guide changes (reliability over features, honest signals, graceful degradation,
  clear seams).
- Prefer **additive, reversible** changes to working real-time/audio paths.
- Run the linter before committing:

```bash
npm run lint
```

- After a working session, follow [`prompts/session-end.md`](prompts/session-end.md)
  to update [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) with what changed, what
  broke, and what's next.

## Tech Stack

React 19 · TypeScript · Vite · Framer Motion · React Router · Recharts ·
Web Audio API · Capacitor 7 (iOS) · Swift / neurosdk2 (BLE relay) · Tauri
(desktop) · jsPDF + html2canvas (summaries) · Resend (email).
