/**
 * Athena bridge–only coherence / contact stabilization tuning.
 * Muse 2 does not import this module in its BLE path.
 */

/** Minimum electrode quality (0–1) for *signal valid* and `calculateCoherence` gate on Athena (Muse default 0.5). */
export const ATHENA_COHERENCE_MIN_CONTACT_VALIDITY = 0.42;

/**
 * Multiply the sensitivity-derived β/α ceiling (flow-state) on Athena.
 * Bridge band ratios often sit higher than Muse BLE; values above 1 relax gating.
 */
export const ATHENA_BETA_ALPHA_RATIO_THRESHOLD_FACTOR = 1.32;

/**
 * Max α+β variance (combined recent window) for “conditions met” on Athena.
 * Muse default in `CoherenceConfig` is 0.15; bridge FFT/ratios can wobble more.
 */
export const ATHENA_VARIANCE_THRESHOLD = 0.28;

/**
 * Scale dwell time from the same sensitivity curve as Muse (lower = enter flow sooner).
 * Clamped in `useMuse` so sustainedMs stays ≥ 400 ms.
 */
export const ATHENA_SUSTAINED_MS_FACTOR = 0.8;

// --- Reward path (coherence score → audio SM + UI zone), Athena bridge only ---

/** `CoherenceStateMachine` enter stabilizing when session preset is Easy (Muse Easy uses 0.68). */
export const ATHENA_AUDIO_SM_ENTER_EASY = 0.58;
/** Exit coherent → stabilizing when preset is Easy. */
export const ATHENA_AUDIO_SM_EXIT_EASY = 0.53;

/** Seconds coherence must stay ≥ enter threshold while stabilizing before SM → coherent (audio crossfade). */
export const ATHENA_AUDIO_SM_ENTER_SUSTAIN_EASY_SEC = 0.55;

/** Enter stabilizing when preset is Medium/Hard on Athena (Muse default 0.75). */
export const ATHENA_AUDIO_SM_ENTER_MED = 0.7;
export const ATHENA_AUDIO_SM_EXIT_MED = 0.65;

/**
 * `getCoherenceZone` flow band (Muse default 0.7). Slightly lower so UI “flow” matches
 * audio reward accessibility for bridge band scaling.
 */
export const ATHENA_UI_FLOW_ZONE_MIN = 0.58;

/** Sustained + shimmer layer (separate from audio SM); Athena Easy eases hold vs Muse default 0.50 / 8s. */
export const ATHENA_COHERENCE_SUSTAINED_EASY = {
  sustainedThreshold: 0.44,
  sustainedHoldMs: 4500,
  sustainedExitThreshold: 0.38,
  sustainedExitHoldMs: 4200,
} as const;

/** Athena Medium/Hard: modestly easier than global defaults. */
export const ATHENA_COHERENCE_SUSTAINED_MED = {
  sustainedThreshold: 0.47,
  sustainedHoldMs: 6000,
  sustainedExitThreshold: 0.4,
  sustainedExitHoldMs: 4500,
} as const;

/** Faster coherence MP3 crossfade on Athena so brief `coherent` is audible (Muse keeps 5.5s / 7.5s). */
export const ATHENA_COHERENCE_CROSSFADE_ATTACK_SEC = 3.25;
export const ATHENA_COHERENCE_CROSSFADE_RELEASE_SEC = 5.5;
