# NeuroSymphony — Architecture & Design Rationale

> This document explains **why** the system is built the way it is. These decisions
> change rarely, but the reasoning behind them is easy to lose — and expensive to
> rediscover. If you're tempted to "simplify" one of these, read the rationale
> first; most were chosen *because* of a constraint that isn't obvious from the
> code.
>
> Scope: `PROJECT.md` = why the product exists · `README.md` = how to run it ·
> `PROJECT_STATE.md` = what's true right now · **this file = why it's designed
> this way.**

## System Overview

```
EEG headset ──BLE──▶ native relay (Swift, neurosdk2) ──WebSocket──▶ React app (Capacitor/iPad)
                                                                        │
                                              DSP → brain-state metric → state machine
                                                                        │
                                                          adaptive Web Audio → session summary
```

Five layers, deliberately decoupled: **acquisition (relay) → transport
(WebSocket) → signal processing → state → experience (audio/UI)**. Each layer can
be developed, tested, and replaced without disturbing its neighbors.

## Major Components

| Component | Where | Responsibility |
|---|---|---|
| **Native BLE relay** | `native/brainbit-ios-relay/` (Swift, `neurosdk2`) | Scan, connect, and stream EEG from the headset over BLE. Owns connection lifecycle, recovery, and sentinel-frame handling. Bundled into the iOS app; also runnable as a macOS CLI. |
| **Transport (WebSocket)** | `ws://127.0.0.1:8765` | Carries EEG samples from relay to app as JSON. The single, inspectable seam between native acquisition and the web app. |
| **EEG device abstraction** | `src/lib/eeg/` | Normalizes any source (BrainBit, Muse, Athena bridge) into a common stream + contact-quality interface. Isolates device-specific quirks. |
| **Signal processing (DSP)** | `src/lib/fft-processor.ts`, `src/lib/eeg/` | FFT → frequency bandpower (delta/theta/alpha/beta/gamma) + signal-quality measures. |
| **Brain-state metric** | `src/lib/flow-state.ts` | Derives the coherence estimate (today's brain-state metric) and validity gates from bandpower + variance. |
| **State machine** | `src/lib/coherence-state-machine.ts` | `baseline → stabilizing → coherent` with hysteresis + sustain timers; turns a noisy metric into stable, reactable states. |
| **Audio engine** | `src/lib/audio-engine.ts` | Web Audio layered soundscape (baseline / coherence / sustained) + synthesized binaural beats, driven by state. |
| **UI + session summary** | `src/components/`, `src/lib/summary-pdf.ts` | Facilitator/participant UI, live status, and the shareable/emailed summary. |

## Data Flow

1. The **relay** connects to the headset over BLE and receives raw EEG samples.
2. It packages samples as JSON and broadcasts them over the local **WebSocket**.
3. The app's **EEG device** layer ingests the stream and normalizes it (channels,
   contact quality), regardless of which hardware produced it.
4. **DSP** converts raw samples into bandpower + signal-quality measures.
5. The **brain-state metric** (coherence) is computed and gated for validity.
6. The **state machine** smooths that metric into a stable state with hysteresis
   and sustain timers.
7. The **audio engine** reacts to state changes by crossfading/evolving layers.
8. Throughout, metrics are accumulated into the **session summary** delivered at
   the end.

## Design Decisions

---

## Why a native relay + WebSocket instead of direct BLE from the app?

**Decision:** EEG acquisition runs in a native Swift process (`neurosdk2`) that
talks to the headset over BLE, then streams samples to the web app as JSON over a
local WebSocket. The React app never speaks Bluetooth.

**Why:**
- The BrainBit device requires Neurosoft's native `neurosdk2`. There is no
  reliable, supported path to drive it from a WKWebView/browser context.
- Web Bluetooth is unavailable in WKWebView (the iPad shell) and inconsistent
  across browsers even on desktop. Betting the live, in-front-of-guests data path
  on it would be fragile.
- A process boundary is a feature, not overhead: acquisition can crash, reconnect,
  or be swapped without touching UI/DSP code. The WebSocket is a clean,
  inspectable seam (you can tee/log/replay JSON for debugging and testing).

**Consequences / trade-offs:**
- The relay is a **first-class system**, not an implementation detail. Treat its
  lifecycle, recovery, and message contract as core surface area.
- Extra moving part to start/monitor, and a small serialization cost (acceptable
  at EEG data rates).

---

## Why Capacitor (WKWebView) for the iPad app?

**Decision:** Ship the React front end to iPad via Capacitor.

**Why:**
- One React/TypeScript codebase serves web development and the production iPad
  target; we don't maintain a separate native UI.
- Capacitor gives a native shell we control (bundle the relay, set permissions,
  manage assets) without rewriting the experience in Swift.
- The session experience is fundamentally a rich, animated web UI + Web Audio —
  exactly what a WebView renders well.

**Consequences / trade-offs:**
- WKWebView has quirks we must respect. The biggest: assets served from the
  `capacitor://localhost/` custom scheme behave differently from HTTP. (See
  "Audio loading" below.)
- Vite is configured with `base: './'` so asset URLs resolve under the custom
  scheme.

---

## Why load audio via XMLHttpRequest, not `fetch()`?

**Decision:** The `AudioEngine` loads MP3 layers with `XMLHttpRequest` against
multiple URL candidates, not `fetch()`.

**Why:** In WKWebView, `fetch()` of a custom-scheme (`capacitor://localhost/`)
asset returns an **opaque response with `status: 0`**, so `resp.ok` is false even
when the bytes are fine — audio silently never loaded. XHR returns usable data for
these assets. (Synthesized binaural beats were unaffected, which is why only the
MP3 layers broke.)

**Consequence:** Don't "modernize" this back to `fetch()` without re-verifying on
an actual iPad build. This is a platform constraint, not a style choice.

---

## Why a state machine (baseline → stabilizing → coherent)?

**Decision:** A dedicated state machine with hysteresis and sustain timers sits
between the raw brain-state metric and the audio.

**Why:**
- EEG is noisy; a raw metric crosses any threshold constantly. Mapping it directly
  to audio would produce flickering, jarring transitions.
- Hysteresis (separate enter/exit thresholds) + sustain timers ensure the
  experience responds to **genuine, held shifts**, not momentary spikes.
- It gives a small, testable vocabulary of states that both audio and UI can react
  to coherently.

**Consequence:** Tuning lives in thresholds/timers, not scattered across the audio
code. Keep the metric, the state machine, and the audio mapping as separate
concerns.

---

## Why adaptive/layered audio instead of discrete tracks?

**Decision:** Audio is built from layers (baseline → coherence → sustained) that
crossfade, plus synthesized binaural beats — not a playlist of distinct tracks
swapped on state change.

**Why:**
- The experience must feel **continuous and alive**. Hard track swaps break
  immersion; gain-based crossfades between always-loaded layers are seamless.
- Layering lets multiple signals coexist (e.g. a sustained-state layer fading in
  *over* the coherence layer) and lets the soundscape "reward" depth gradually.
- Synthesized elements (binaural beats) are generated, not fetched, so they're
  immune to asset-loading issues and free to parameterize in real time.

**Consequence:** "More audio variety" should generally mean more/better layers and
mappings, not a track-switching system.

---

## Why an EEG device abstraction (`src/lib/eeg/`)?

**Decision:** All EEG sources sit behind a common device abstraction; BrainBit,
Muse, and the "Athena" LibMuse bridge are interchangeable implementations.

**Why:**
- The product is not married to one headset. Hardware will change; the experience
  shouldn't have to.
- It isolates device-specific noise (channel labels, contact-quality heuristics,
  sentinel-frame handling) from the shared DSP → metric → state pipeline.
- It makes the "honest data only" principle enforceable per device (e.g. no
  HR/HRV for EEG-only hardware).

**Consequence:** New hardware slots in behind this seam. Resist pushing
device-specific assumptions upward into the shared pipeline.

---

## Where Future Expansion Fits

The layering above is what makes the platform extensible. New capability slots into
a specific seam rather than rippling across the system:

- **New EEG / biofeedback hardware** → add an implementation behind the EEG device
  abstraction (`src/lib/eeg/`). The DSP → metric → state → audio pipeline is
  unchanged. If a device needs a native driver, it follows the relay + WebSocket
  pattern (a new relay producing the same JSON contract).
- **New or richer brain-state metrics** (alpha/theta ratio, engagement, a
  classifier, a proprietary score) → add alongside the coherence estimate in the
  metric layer. The state machine consumes a metric, not a specific formula.
- **New immersive "worlds"** → new audio layer sets and state→sound mappings in the
  audio engine; the acquisition/metric/state layers don't change.
- **Lighting / environmental adaptation** → add as additional consumers of the
  state machine's output, parallel to audio (same event source, new actuator).
- **New deployment targets** (installations, self-serve, desktop via Tauri) → reuse
  the same web app; swap only the shell and how the relay is hosted.

Guiding rule: extend at a seam, don't thread device- or world-specific assumptions
through the shared pipeline.

## Standing Constraints (don't relearn these the hard way)

- **WKWebView custom-scheme assets** misbehave with `fetch()`; use XHR (above).
- **EEG is noisy and BLE is flaky.** Warm-up, stalls, and stuck/sentinel frames
  (e.g. ~0.4V on all BrainBit channels) are normal; acquisition must self-recover
  and the UI must degrade gracefully. Expect a multi-second startup before the
  first valid chunk — it lives in the BLE path, not the WebSocket.
- **Honest data only.** Never surface metrics the connected hardware can't support.
- **The live path is sacred.** The headset link, audio playback, and summary run
  in front of guests; prefer additive, reversible changes there.

## See Also

- `PROJECT.md` — product vision and engineering philosophy.
- `PROJECT_STATE.md` — current status, known issues, recent decisions.
- `app-architecture-summary.md` — detailed signal phases, thresholds, and audio
  timing constants.
