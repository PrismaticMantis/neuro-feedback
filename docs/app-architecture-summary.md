# Neuro-Feedback App Architecture Summary

## Phase Triggers

### Baseline Phase
- **Default state** when session starts
- **Audio**: Baseline track only (coherenceGain = 0)
- **Triggers**:
  - `coherence < 0.75` (enterThreshold)
  - Signal quality fails (not connected, contact quality < 0.5, data gap > 1000ms)
  - Exiting coherent state after 0.6s below exit threshold

**File**: `src/lib/coherence-state-machine.ts`

### Stabilizing Phase
- **Intermediate state** (candidate for coherence)
- **Audio**: Still baseline track (no audio change)
- **Triggers**: `coherence >= 0.75` but not yet sustained for 1.8 seconds
- **Timer resets** if coherence drops below 0.75 during this phase

**File**: `src/lib/coherence-state-machine.ts`

### Coherent Phase
- **Main coherence state**
- **Audio**: Coherence track active (coherenceGain = 1, baselineGain = 0)
- **Triggers**: `coherence >= 0.75` sustained continuously for 1.8 seconds (enterSustainSeconds)
- **Exit**: `coherence <= 0.70` (exitThreshold) sustained for 0.6 seconds (exitSustainSeconds)

**File**: `src/lib/coherence-state-machine.ts`

### Sustained-Coherence Audio Layer
- **Additional audio layer** (not a state machine state)
- **Audio**: Sustained-coherence track fades in (sustainedCoherenceGain = 1)
- **Triggers**: State is 'coherent' continuously for 25.0 seconds (SUSTAINED_COHERENCE_SECONDS)
- **Cooldown**: 60 seconds after fade-out before re-trigger
- **Timer resets immediately** if coherence state drops (no grace period)

**File**: `src/lib/audio-engine.ts` (lines 882-936)

---

## Muse Signals Used

### Bluetooth Mode (Raw EEG)
- **EEG Samples**: Raw voltage samples per electrode (TP9, AF7, AF8, TP10)
  - **Source**: `muse-js` library `eegReadings` subscription
  - **Processing**: FFT applied in `processBluetoothFFT()` to extract bandpower
  - **Bands**: delta (1-4Hz), theta (4-8Hz), alpha (8-13Hz), beta (13-30Hz), gamma (30-44Hz)
  - **Output**: Relative power (0-1) after 1/f correction

**File**: `src/lib/muse-handler.ts` (lines 224-262, 320-393)

### OSC Mode (Processed Only)
- **Bandpower**: Pre-computed relative power via OSC messages
  - `/muse/elements/delta_relative`
  - `/muse/elements/theta_relative`
  - `/muse/elements/alpha_relative`
  - `/muse/elements/beta_relative`
  - `/muse/elements/gamma_relative`
- **No raw EEG**: Only processed bandpower values (0-1)

**File**: `src/lib/muse-handler.ts` (lines 505-576)

### Other Signals
- **Accelerometer**: `accX`, `accY`, `accZ` (used for motion detection)
- **Electrode Quality**: Horseshoe indicator [TP9, AF7, AF8, TP10] (1=good, 2=medium, 3=poor, 4=off)
- **Battery**: Charge percentage
- **Blink/Jaw Clench**: Detected but not used in coherence detection

**File**: `src/lib/muse-handler.ts`

---

## Coherence Calculation

### Input Signals
- **Bandpower**: Alpha, beta, theta, delta, gamma (relative power 0-1)
- **Variance**: Calculated from recent alpha/beta values (30-sample window)
- **Electrode Quality**: 0-1 scale (average of 4 electrodes)

### Formula
```typescript
coherence = (
  alphaScore * 0.35 +      // Alpha prominence
  ratioScore * 0.25 +       // Beta/Alpha ratio (lower is better)
  thetaScore * 0.2 +        // Theta contribution
  stabilityScore * 0.2      // Variance-based stability
)
```

**File**: `src/lib/flow-state.ts` (function `calculateCoherence`, lines 343-391)

### Signal Validity Gates
- `totalPower >= 0.05` (minSignalPower)
- `electrodeQuality >= 0.5` (minContactQuality)
- `alpha >= 0.01` (minimum alpha presence)
- `signalVariance >= 0.001` (minVariance)

**File**: `src/lib/flow-state.ts` (CoherenceDetector.update, lines 133-216)

---

## State Machine Configuration

### Default Thresholds
- `enterThreshold: 0.75` - Coherence to enter stabilizing
- `exitThreshold: 0.70` - Coherence to exit coherent (hysteresis)
- `enterSustainSeconds: 1.8` - Must sustain >= enterThreshold
- `exitSustainSeconds: 0.6` - Must sustain <= exitThreshold
- `maxPacketGapMs: 1000` - Max time without data before forcing baseline
- `minContactQuality: 0.5` - Minimum electrode contact (0-1)

**File**: `src/lib/coherence-state-machine.ts` (lines 16-24)

### Sustained-Coherence Constants
- `SUSTAINED_COHERENCE_SECONDS: 25.0` - Continuous coherence required
- `SUSTAINED_ATTACK_SECONDS: 5.5` - Fade-in duration
- `SUSTAINED_RELEASE_SECONDS: 6.0` - Fade-out duration
- `SUSTAINED_COHERENCE_COOLDOWN_SECONDS: 60.0` - Cooldown after fade-out

**File**: `src/lib/audio-engine.ts` (lines 27-31)

---

## Data Flow

1. **Muse Handler** (`src/lib/muse-handler.ts`)
   - Receives raw EEG (Bluetooth) or processed bandpower (OSC)
   - Processes with FFT if raw EEG
   - Outputs smoothed bandpower values

2. **Coherence Detector** (`src/lib/flow-state.ts`)
   - Calculates beta/alpha ratio, variance, noise level
   - Checks signal validity gates
   - Returns `CoherenceStatus` (isActive, sustainedMs, metrics)

3. **Coherence Calculator** (`src/lib/flow-state.ts`)
   - Computes coherence score (0-1) from bandpower + variance
   - Formula: weighted combination of alpha, ratio, theta, stability

4. **State Machine** (`src/lib/coherence-state-machine.ts`)
   - Takes coherence score + signal quality
   - Manages transitions: baseline ↔ stabilizing ↔ coherent
   - Enforces sustain timers and hysteresis

5. **Audio Engine** (`src/lib/audio-engine.ts`)
   - Responds to state machine callbacks
   - Manages audio crossfades (baseline ↔ coherence)
   - Tracks sustained-coherence timer (separate from state machine)
   - Activates sustained-coherence audio layer after 25s continuous coherent state

---

## Key Files

- `src/lib/muse-handler.ts` - Muse connection, EEG processing, bandpower extraction
- `src/lib/flow-state.ts` - Coherence detection logic, coherence calculation
- `src/lib/coherence-state-machine.ts` - State machine (baseline/stabilizing/coherent)
- `src/lib/audio-engine.ts` - Audio layer management, sustained-coherence timer
- `src/hooks/useMuse.ts` - Muse hook, connects handler to React
- `src/App.tsx` - Main app, connects Muse → AudioEngine → Session
