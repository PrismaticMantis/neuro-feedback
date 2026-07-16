/**
 * BrainBit native-relay coherence tuning. Muse 2 and Athena bridge do not import this file.
 *
 * Bridge bands are 0–1 *relative* power (weighted δ–γ). Capsule montage + FFT rate often yields a
 * slightly lower α share than Muse BLE for comparable states, so the shared default `bands.alpha >= 0.02`
 * `signalValid` gate blocks dwell (`dwellBlocker: bandAlpha`) too often.
 */

/** `CoherenceDetector` `signalValid` — min `bandsSmooth.alpha` (Muse default 0.02 in flow-state). */
export const BRAINBIT_COHERENCE_SIGNAL_VALID_MIN_ALPHA = 0.012;

/** `CoherenceDetector` electrodeQuality floor for BrainBit (Athena WS uses 0.42). */
export const BRAINBIT_COHERENCE_MIN_CONTACT_VALIDITY = 0.32;

/**
 * BrainBit iPad MVP session gate: min channels at good|medium (ear refs A1/A2 often weaker).
 * Muse-style 3/4 rule false-blocks while C3/C4 stream fine.
 */
export const BRAINBIT_MVP_MIN_GOOD_OR_MEDIUM_CHANNELS = 2;

/**
 * Audio state machine contact gate (Muse default 0.5). BrainBit averages often drop when ear refs
 * read flat even while C3/C4 still feed the coherence detector.
 */
export const BRAINBIT_AUDIO_MIN_CONTACT_QUALITY = 0.25;

/** When the coherence detector still marks signal valid, tolerate lower contact before baseline reset. */
export const BRAINBIT_AUDIO_MIN_CONTACT_WHEN_SIGNAL_VALID = 0.12;

/** Brief grace before audio SM drops to baseline when contact dips (one channel stale). */
export const BRAINBIT_AUDIO_CONTACT_GRACE_MS = 4000;

/**
 * `CoherenceDetector` `alphaFloorBaselineRatio` (default Muse 0.5). BrainBit C3/C4 alpha can be narrow
 * and eyes-closed did not consistently exceed the first 15s baseline; keep this as a loose dead-alpha
 * guard rather than a strong reward gate.
 */
export const BRAINBIT_COHERENCE_ALPHA_FLOOR_BASELINE_RATIO = 0.25;

/** `calculateCoherence` “quiet” α floor (Muse default 0.01). Slightly lower avoids double penalty vs detector. */
export const BRAINBIT_COHERENCE_CALC_MIN_ALPHA = 0.008;

/**
 * Final multiplier on `calculateCoherence` (BrainBit only). After switching BrainBit bands to C3/C4, raw
 * coherence is no longer compressed; extra scaling clamps ordinary stillness and movement to 1.0.
 */
export const BRAINBIT_COHERENCE_SCORE_SCALE = 1.0;

/**
 * `CoherenceDetector` `signalValid` — min variance of recent `bandsSmooth` α+β (60 samples).
 * Default Muse/Athena: 0.001. For BrainBit, quiet resting EEG can be valid while detector α/β are nearly
 * flat; requiring variance made headset movement wake dwell by artificially changing α/β. BrainBit uses
 * contact, total power, alpha, relay gap/audio guards, and max variance for trust instead.
 */
export const BRAINBIT_COHERENCE_SIGNAL_MIN_VARIANCE = 0;

/**
 * Per-chunk EMA for **detector-only** bands (`getCoherenceDetectorBands()`). Lower than UI `bandsSmooth`
 * (0.7) so α/β move enough between chunks for `minVariance`; UI/audio still use Muse-like smoothing.
 */
export const BRAINBIT_COHERENCE_DETECTOR_BAND_SMOOTH = 0.5;

/**
 * `CoherenceDetector` `varianceSampleDedupeEpsilon` — only append α/β to the 30+30 variance window
 * when either moves by at least this vs the last append. Capsule updates `getCoherenceDetectorBands()`
 * once per chunk while `update()` runs every rAF tick; without dedupe the window is mostly duplicate
 * samples and `signalVariance` ≈ 0.
 */
export const BRAINBIT_COHERENCE_VARIANCE_SAMPLE_DEDUPE_EPSILON = 1e-10;

/**
 * BrainBit only: keep dwell accumulation alive across a single brief threshold miss.
 * This does not relax any gate; it prevents chunk-to-chunk contact / α-floor / β/α / variance jitter from
 * resetting `conditionMetSince` before the user can reach stabilizing / reward. Screen captures showed
 * valid dwell interrupted by `minVariance` / `alphaFloor` flicker over ~1s windows, so this needs to span
 * more than one relay/display frame but still drop quickly on sustained failure.
 */
export const BRAINBIT_COHERENCE_DWELL_BREAK_GRACE_MS = 1250;

/**
 * BrainBit only: block alpha surges that are implausibly high vs the user's first 15s baseline.
 * Headset movement/contact pressure can inject energy into the alpha band and improve β/α without
 * producing contact-artifact stats. Legitimate resting alpha may rise, but large sudden multiples of
 * baseline should not create detector flow.
 */
export const BRAINBIT_COHERENCE_ALPHA_CEILING_BASELINE_RATIO = 3.0;

/**
 * BrainBit has no browser accelerometer feed. Use contact-pressure instability as a synthetic movement
 * artifact signal so headset shaking cannot masquerade as alpha coherence. These sit below the contact
 * "weak/off" thresholds because coherence should be stricter than display contact quality.
 */
export const BRAINBIT_CONTACT_ARTIFACT_VAR_START = 18_000;
export const BRAINBIT_CONTACT_ARTIFACT_VAR_FULL = 95_000;
export const BRAINBIT_CONTACT_ARTIFACT_ABS_START_UV = 320;
export const BRAINBIT_CONTACT_ARTIFACT_ABS_FULL_UV = 950;

// --- Reward path (coherence score -> visible graph zone -> audio SM), BrainBit bridge only ---

/** Medium/Hard BrainBit graph flow zone and ordinary coherence audio entry. */
export const BRAINBIT_UI_FLOW_ZONE_MIN_MED = 0.58;
export const BRAINBIT_AUDIO_SM_ENTER_MED = BRAINBIT_UI_FLOW_ZONE_MIN_MED;
export const BRAINBIT_AUDIO_SM_EXIT_MED = 0.53;

/** Easy BrainBit should visibly and audibly enter earlier than Medium. */
export const BRAINBIT_UI_FLOW_ZONE_MIN_EASY = 0.5;
export const BRAINBIT_AUDIO_SM_ENTER_EASY = BRAINBIT_UI_FLOW_ZONE_MIN_EASY;
export const BRAINBIT_AUDIO_SM_EXIT_EASY = 0.46;
export const BRAINBIT_AUDIO_SM_ENTER_SUSTAIN_EASY_SEC = 0.45;

/** Sustained is locked behind ordinary coherence audio, then requires a longer hold above the same zone. */
export const BRAINBIT_COHERENCE_SUSTAINED_EASY = {
  sustainedThreshold: BRAINBIT_AUDIO_SM_ENTER_EASY,
  sustainedHoldMs: 4500,
  sustainedExitThreshold: BRAINBIT_AUDIO_SM_EXIT_EASY,
  sustainedExitHoldMs: 4200,
} as const;

export const BRAINBIT_COHERENCE_SUSTAINED_MED = {
  sustainedThreshold: BRAINBIT_AUDIO_SM_ENTER_MED,
  sustainedHoldMs: 6000,
  sustainedExitThreshold: BRAINBIT_AUDIO_SM_EXIT_MED,
  sustainedExitHoldMs: 4500,
} as const;
