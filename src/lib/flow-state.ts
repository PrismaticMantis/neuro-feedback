// Coherence Detection
// Detects when: Beta < Alpha, low variance, sustained 5+ seconds

import type {
  BrainwaveBands,
  CoherenceDwellDiagnostics,
  CoherenceRelativeGateDebug,
  CoherenceStatus,
} from '../types';

// Feature flag for expressive modulation (calmScore and creativeFlowScore)
// When false, all expressive modulation behavior is disabled and app behaves identically to current version
export const ENABLE_EXPRESSIVE_MODULATION = true;

export interface CoherenceConfig {
  sustainedMs: number; // How long conditions must be met (default 5000ms)
  varianceThreshold: number; // Maximum variance allowed (default 0.15)
  noiseThreshold: number; // Maximum noise level (default 0.3)
  betaAlphaRatioThreshold: number; // Beta/Alpha must be below this (default 1.0)
  minSignalPower: number; // Minimum total band power to consider signal valid (default 0.05)
  minVariance: number; // Minimum variance - too low means no real signal (default 0.001)
  useRelativeMode?: boolean; // PART 1: Use relative coherence (Easy mode only, default false)
  /** When set (e.g. Athena bridge), overrides default 0.5 for `hasGoodContact`. Muse: leave unset. */
  minElectrodeQualityForValidity?: number;
  /** When true, `update()` attaches `dwellDiagnostics` (Athena debug only; keep false for Muse). */
  emitDwellDiagnostics?: boolean;
  /**
   * Min `bands.alpha` for `signalValid` / `hasAlpha`. Default 0.02 when unset (Muse).
   * BrainBit bridge may set lower — see `brainbit-coherence-stability.ts`.
   */
  signalValidMinAlpha?: number;
  /**
   * When set, only append α/β to the variance history if either differs from the last appended
   * sample by at least this amount. WebSocket bridges often update bands once per network chunk
   * while `update()` runs every animation frame — without dedupe, the 30+30 window fills with
   * duplicates and `signalVariance` collapses to ~0 (`dwellBlocker: minVariance`). Muse: omit.
   */
  varianceSampleDedupeEpsilon?: number;
  /**
   * After the 15s baseline window, `hasAlphaFloor` requires smoothed α ≥ this fraction of baseline mean α.
   * Default 0.5 (50%). BrainBit may set lower — low relative α + slow EMA can fail the floor while
   * instantaneous α still clears `signalValidMinAlpha` (`dwellBlocker: alphaFloor` vs `bandAlpha`).
   */
  alphaFloorBaselineRatio?: number;
  /**
   * Optional upper bound after baseline: `bands.alpha` must stay <= baseline * this ratio.
   * BrainBit uses this to reject movement/contact-pressure alpha surges. Muse leaves unset.
   */
  alphaCeilingBaselineRatio?: number;
  /**
   * Optional grace while dwell is accumulating: if conditions briefly fail after they were met,
   * keep the dwell timer alive for this many ms. Muse leaves unset for immediate reset.
   */
  conditionBreakGraceMs?: number;
}

const DEFAULT_CONFIG: CoherenceConfig = {
  sustainedMs: 5000,
  varianceThreshold: 0.15,
  noiseThreshold: 0.3,
  betaAlphaRatioThreshold: 1.0,
  minSignalPower: 0.05, // Require at least 5% total power
  minVariance: 0.001, // Require some variance (not flat line)
  useRelativeMode: false, // PART 1: Default to absolute thresholds (Normal/Hard mode)
};

// Alpha floor safeguard constants
const BASELINE_WINDOW_MS = 15000; // 15 seconds to establish baseline alpha
const ALPHA_FLOOR_RATIO = 0.50; // Alpha must be at least 50% of baseline
const ALPHA_SMOOTHING = 0.1; // EMA smoothing factor for alpha power

// PART 1: Relative coherence baseline calibration constants (Easy mode only)
const BASELINE_CAL_SECONDS = 30; // Baseline calibration window (30s)
const BASELINE_CAL_MAX_SECONDS = 60; // Max calibration window if signal poor
const RELATIVE_BETA_ALPHA_IMPROVEMENT = 0.88; // 12% improvement required
const RELATIVE_VARIANCE_IMPROVEMENT = 0.85; // 15% improvement required
const RELATIVE_ALPHA_FLOOR = 0.90; // Alpha must be at least 90% of baseline
const RELATIVE_EXIT_BETA_ALPHA_BUFFER = 0.93; // Exit if ratio > baseline * 0.93
const RELATIVE_EXIT_VARIANCE_BUFFER = 0.92; // Exit if variance > baseline * 0.92

export class CoherenceDetector {
  private config: CoherenceConfig;
  private conditionMetSince: number | null = null;
  private recentAlphaValues: number[] = [];
  private recentBetaValues: number[] = [];
  private historyLength = 30; // ~1 second of data at 30fps
  private lastVariancePushAlpha: number | null = null;
  private lastVariancePushBeta: number | null = null;
  private conditionBrokenSince: number | null = null;

  // Alpha floor safeguard tracking
  private sessionStartTime: number | null = null;
  private baselineAlphaSamples: number[] = [];
  private baselineAlphaPower: number | null = null;
  private smoothedAlphaPower: number | null = null;
  
  // PART 1: Relative coherence baseline calibration (Easy mode only)
  private baselineCalStartTime: number | null = null;
  private baselineCalSamples: Array<{
    betaAlphaRatio: number;
    variance: number;
    noise: number;
    alphaPower: number;
  }> = [];
  private baselineBetaAlphaRatioAvg: number | null = null;
  private baselineSignalVarianceAvg: number | null = null;
  private baselineNoiseAvg: number | null = null;
  private baselineAlphaAvg: number | null = null;
  private baselineCalComplete: boolean = false;

  // Callbacks
  onEnterCoherence?: () => void;
  onExitCoherence?: () => void;

  private _isActive = false;

  constructor(config: Partial<CoherenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update with new brainwave data
   * Call this every frame with smoothed band values
   */
  update(bands: BrainwaveBands, motionLevel: number = 0, electrodeContactQuality: number = 0): CoherenceStatus {
    const now = Date.now();

    // Initialize session start time on first update
    if (this.sessionStartTime === null) {
      this.sessionStartTime = now;
      // PART 1: Initialize baseline calibration if in relative mode
      if (this.config.useRelativeMode) {
        this.baselineCalStartTime = now;
        this.baselineCalComplete = false;
      }
    }

    // Track baseline alpha during baseline window
    const sessionAge = now - this.sessionStartTime;
    if (sessionAge < BASELINE_WINDOW_MS) {
      // Still in baseline window - accumulate alpha samples
      this.baselineAlphaSamples.push(bands.alpha);
    } else if (this.baselineAlphaPower === null && this.baselineAlphaSamples.length > 0) {
      // Baseline window just ended - calculate baseline alpha
      const sum = this.baselineAlphaSamples.reduce((a, b) => a + b, 0);
      this.baselineAlphaPower = sum / this.baselineAlphaSamples.length;
      // Initialize smoothed alpha with baseline
      this.smoothedAlphaPower = this.baselineAlphaPower;
    }

    // Smooth alpha power (EMA) if baseline is established
    if (this.baselineAlphaPower !== null) {
      if (this.smoothedAlphaPower === null) {
        this.smoothedAlphaPower = bands.alpha;
      } else {
        this.smoothedAlphaPower = this.smoothedAlphaPower * (1 - ALPHA_SMOOTHING) + bands.alpha * ALPHA_SMOOTHING;
      }
    }

    // Store recent values for variance calculation (optional dedupe: see `varianceSampleDedupeEpsilon`)
    const eps = this.config.varianceSampleDedupeEpsilon;
    let appendVarianceSample = true;
    if (
      eps != null &&
      eps > 0 &&
      this.lastVariancePushAlpha != null &&
      this.lastVariancePushBeta != null
    ) {
      if (
        Math.abs(bands.alpha - this.lastVariancePushAlpha) < eps &&
        Math.abs(bands.beta - this.lastVariancePushBeta) < eps
      ) {
        appendVarianceSample = false;
      }
    }
    if (appendVarianceSample) {
      this.recentAlphaValues.push(bands.alpha);
      this.recentBetaValues.push(bands.beta);
      this.lastVariancePushAlpha = bands.alpha;
      this.lastVariancePushBeta = bands.beta;
      while (this.recentAlphaValues.length > this.historyLength) {
        this.recentAlphaValues.shift();
        this.recentBetaValues.shift();
      }
    }

    // Calculate total signal power
    const totalPower = bands.alpha + bands.beta + bands.gamma + bands.theta + bands.delta;

    // Calculate metrics
    const betaAlphaRatio = bands.alpha > 0.01 ? bands.beta / bands.alpha : 10;
    const signalVariance = this.calculateVariance([
      ...this.recentAlphaValues,
      ...this.recentBetaValues,
    ]);
    const noiseLevel = motionLevel + bands.gamma * 0.5; // Gamma often indicates noise/artifacts
    
    // SIGNAL VALIDITY CHECKS (needed for baseline calibration):
    const hasMinPower = totalPower >= this.config.minSignalPower;
    const hasMinVariance = signalVariance >= this.config.minVariance;
    const contactValidityFloor = this.config.minElectrodeQualityForValidity ?? 0.5;
    const hasGoodContact = electrodeContactQuality >= contactValidityFloor;
    const signalValidMinAlphaFloor = this.config.signalValidMinAlpha ?? 0.02;
    const hasAlpha = bands.alpha >= signalValidMinAlphaFloor;
    
    // PART 1: Baseline calibration for relative mode (Easy mode only)
    if (this.config.useRelativeMode && !this.baselineCalComplete && this.baselineCalStartTime !== null) {
      const calAge = (now - this.baselineCalStartTime) / 1000;
      
      // Collect samples during calibration window
      if (calAge < BASELINE_CAL_MAX_SECONDS) {
        // Only collect samples if signal quality is acceptable
        if (hasGoodContact && hasMinPower && hasMinVariance) {
          this.baselineCalSamples.push({
            betaAlphaRatio,
            variance: signalVariance,
            noise: noiseLevel,
            alphaPower: bands.alpha,
          });
        }
        
        // Complete calibration after minimum time if we have enough samples
        if (calAge >= BASELINE_CAL_SECONDS && this.baselineCalSamples.length >= 10) {
          // Calculate baseline averages
          const sumBetaAlpha = this.baselineCalSamples.reduce((sum, s) => sum + s.betaAlphaRatio, 0);
          const sumVariance = this.baselineCalSamples.reduce((sum, s) => sum + s.variance, 0);
          const sumNoise = this.baselineCalSamples.reduce((sum, s) => sum + s.noise, 0);
          const sumAlpha = this.baselineCalSamples.reduce((sum, s) => sum + s.alphaPower, 0);
          const count = this.baselineCalSamples.length;
          
          this.baselineBetaAlphaRatioAvg = sumBetaAlpha / count;
          this.baselineSignalVarianceAvg = sumVariance / count;
          this.baselineNoiseAvg = sumNoise / count;
          this.baselineAlphaAvg = sumAlpha / count;
          this.baselineCalComplete = true;
          
          console.log('[CoherenceDetector] Baseline calibration complete (relative mode)', {
            betaAlphaRatio: this.baselineBetaAlphaRatioAvg.toFixed(3),
            variance: this.baselineSignalVarianceAvg.toFixed(3),
            noise: this.baselineNoiseAvg.toFixed(3),
            alpha: this.baselineAlphaAvg.toFixed(3),
            samples: count,
          });
        }
      } else {
        // Max calibration time reached - use whatever samples we have
        if (this.baselineCalSamples.length >= 5) {
          const sumBetaAlpha = this.baselineCalSamples.reduce((sum, s) => sum + s.betaAlphaRatio, 0);
          const sumVariance = this.baselineCalSamples.reduce((sum, s) => sum + s.variance, 0);
          const sumNoise = this.baselineCalSamples.reduce((sum, s) => sum + s.noise, 0);
          const sumAlpha = this.baselineCalSamples.reduce((sum, s) => sum + s.alphaPower, 0);
          const count = this.baselineCalSamples.length;
          
          this.baselineBetaAlphaRatioAvg = sumBetaAlpha / count;
          this.baselineSignalVarianceAvg = sumVariance / count;
          this.baselineNoiseAvg = sumNoise / count;
          this.baselineAlphaAvg = sumAlpha / count;
          this.baselineCalComplete = true;
          
          console.log('[CoherenceDetector] Baseline calibration complete (max time reached)', {
            betaAlphaRatio: this.baselineBetaAlphaRatioAvg.toFixed(3),
            variance: this.baselineSignalVarianceAvg.toFixed(3),
            samples: count,
          });
        } else {
          // Not enough samples - disable relative mode
          console.warn('[CoherenceDetector] Baseline calibration failed - insufficient samples, disabling relative mode');
          this.config.useRelativeMode = false;
        }
      }
    }

    // Signal is valid only if all validity checks pass (already computed above)
    const signalValid = hasMinPower && hasMinVariance && hasGoodContact && hasAlpha;

    // Alpha floor safeguard (only apply after baseline is established)
    let hasAlphaFloor = true; // Default to true if baseline not ready yet
    let hasAlphaCeiling = true; // Default to true if unset / baseline not ready yet
    let alphaCeiling: number | null = null;
    if (this.baselineAlphaPower !== null && this.smoothedAlphaPower !== null) {
      const floorRatio = this.config.alphaFloorBaselineRatio ?? ALPHA_FLOOR_RATIO;
      const alphaFloor = this.baselineAlphaPower * floorRatio;
      hasAlphaFloor = this.smoothedAlphaPower >= alphaFloor;
      if (this.config.alphaCeilingBaselineRatio != null) {
        alphaCeiling = this.baselineAlphaPower * this.config.alphaCeilingBaselineRatio;
        hasAlphaCeiling = bands.alpha <= alphaCeiling;
      }
    }

    // PART 1: Check coherence conditions (absolute or relative based on mode)
    let conditionsMetRaw = false;
    let coherencePath: 'absolute' | 'relative' = 'absolute';
    let relativeBetaAlphaOk = false;
    let relativeVarianceOk = false;
    let relativeAlphaOk = false;

    if (this.config.useRelativeMode && this.baselineCalComplete) {
      coherencePath = 'relative';
      const noiseOkRel = noiseLevel < this.config.noiseThreshold;
      if (signalValid && hasGoodContact && noiseOkRel) {
        relativeBetaAlphaOk =
          betaAlphaRatio <= (this.baselineBetaAlphaRatioAvg! * RELATIVE_BETA_ALPHA_IMPROVEMENT);
        relativeVarianceOk =
          signalVariance <= (this.baselineSignalVarianceAvg! * RELATIVE_VARIANCE_IMPROVEMENT);
        relativeAlphaOk = bands.alpha >= (this.baselineAlphaAvg! * RELATIVE_ALPHA_FLOOR);
        conditionsMetRaw = relativeBetaAlphaOk && relativeVarianceOk && relativeAlphaOk;
      }
    } else {
      coherencePath = 'absolute';
      conditionsMetRaw =
        signalValid &&
        hasAlphaFloor &&
        hasAlphaCeiling &&
        betaAlphaRatio < this.config.betaAlphaRatioThreshold &&
        signalVariance < this.config.varianceThreshold &&
        noiseLevel < this.config.noiseThreshold;
    }

    let dwellGraceActive = false;
    let conditionsMet = conditionsMetRaw;
    const graceMs = this.config.conditionBreakGraceMs ?? 0;
    if (conditionsMetRaw) {
      this.conditionBrokenSince = null;
    } else if (graceMs > 0 && this.conditionMetSince !== null) {
      if (this.conditionBrokenSince === null) {
        this.conditionBrokenSince = now;
      }
      dwellGraceActive = now - this.conditionBrokenSince <= graceMs;
      if (dwellGraceActive) {
        conditionsMet = true;
      }
    }

    let dwellBlocker: string | null = null;
    if (this.config.emitDwellDiagnostics && !conditionsMetRaw) {
      if (coherencePath === 'relative') {
        if (!signalValid) {
          if (!hasMinPower) dwellBlocker = 'minPower';
          else if (!hasMinVariance) dwellBlocker = 'minVariance';
          else if (!hasGoodContact) dwellBlocker = 'contact';
          else if (!hasAlpha) dwellBlocker = 'bandAlpha';
        } else if (!hasGoodContact) {
          dwellBlocker = 'contact';
        } else if (noiseLevel >= this.config.noiseThreshold) {
          dwellBlocker = 'noise';
        } else if (!relativeBetaAlphaOk) {
          dwellBlocker = 'relativeBetaAlpha';
        } else if (!relativeVarianceOk) {
          dwellBlocker = 'relativeVariance';
        } else if (!relativeAlphaOk) {
          dwellBlocker = 'relativeAlpha';
        } else {
          dwellBlocker = 'unknown';
        }
      } else {
        if (!signalValid) {
          if (!hasMinPower) dwellBlocker = 'minPower';
          else if (!hasMinVariance) dwellBlocker = 'minVariance';
          else if (!hasGoodContact) dwellBlocker = 'contact';
          else if (!hasAlpha) dwellBlocker = 'bandAlpha';
        } else if (!hasAlphaFloor) {
          dwellBlocker = 'alphaFloor';
        } else if (!hasAlphaCeiling) {
          dwellBlocker = 'alphaSpike';
        } else if (betaAlphaRatio >= this.config.betaAlphaRatioThreshold) {
          dwellBlocker = 'betaAlpha';
        } else if (signalVariance >= this.config.varianceThreshold) {
          dwellBlocker = 'variance';
        } else if (noiseLevel >= this.config.noiseThreshold) {
          dwellBlocker = 'noise';
        } else {
          dwellBlocker = 'unknown';
        }
      }
    }

    if (conditionsMet) {
      if (this.conditionMetSince === null) {
        this.conditionMetSince = now;
      }
    } else {
      // Conditions broken or signal invalid - reset timer
      // PART 1: In relative mode, also check exit buffers (hysteresis)
      if (this._isActive) {
        let shouldExit = true;
        
        if (this.config.useRelativeMode && this.baselineCalComplete && signalValid && hasGoodContact) {
          // Check exit buffers (hysteresis for relative mode - use constants)
          const betaAlphaAboveBuffer = betaAlphaRatio > (this.baselineBetaAlphaRatioAvg! * RELATIVE_EXIT_BETA_ALPHA_BUFFER);
          const varianceAboveBuffer = signalVariance > (this.baselineSignalVarianceAvg! * RELATIVE_EXIT_VARIANCE_BUFFER);
          
          // Only exit if both buffers are exceeded
          if (!betaAlphaAboveBuffer && !varianceAboveBuffer) {
            shouldExit = false; // Still within buffer - don't exit yet
          }
        }
        
        if (shouldExit) {
          this._isActive = false;
          this.onExitCoherence?.();
        }
      }
      
      // Reset timer if conditions are truly broken (not just buffer check)
      if (!conditionsMet) {
        this.conditionMetSince = null;
      }
    }

    // Check if sustained long enough
    const sustainedMs = this.conditionMetSince ? now - this.conditionMetSince : 0;

    if (sustainedMs >= this.config.sustainedMs && !this._isActive) {
      this._isActive = true;
      this.onEnterCoherence?.();
    }

    const out: CoherenceStatus = {
      isActive: this._isActive,
      sustainedMs,
      betaAlphaRatio,
      signalVariance,
      noiseLevel,
    };

    if (this.config.emitDwellDiagnostics) {
      const pathDetail: CoherenceDwellDiagnostics['pathDetail'] =
        this.config.useRelativeMode && !this.baselineCalComplete
          ? 'absolute-prebaseline'
          : coherencePath === 'relative'
            ? 'relative'
            : 'absolute';

      let relativeGate: CoherenceRelativeGateDebug | null | undefined;
      if (
        this.config.useRelativeMode &&
        this.baselineCalComplete &&
        this.baselineBetaAlphaRatioAvg != null &&
        this.baselineSignalVarianceAvg != null &&
        this.baselineAlphaAvg != null
      ) {
        relativeGate = {
          betaAlphaMax: this.baselineBetaAlphaRatioAvg * RELATIVE_BETA_ALPHA_IMPROVEMENT,
          varianceMax: this.baselineSignalVarianceAvg * RELATIVE_VARIANCE_IMPROVEMENT,
          alphaMin: this.baselineAlphaAvg * RELATIVE_ALPHA_FLOOR,
          ratio: betaAlphaRatio,
          variance: signalVariance,
          alpha: bands.alpha,
          betaAlphaOk: relativeBetaAlphaOk,
          varianceOk: relativeVarianceOk,
          alphaOk: relativeAlphaOk,
        };
      } else if (this.config.useRelativeMode && !this.baselineCalComplete) {
        relativeGate = null;
      } else {
        relativeGate = undefined;
      }

      const floorRatio = this.config.alphaFloorBaselineRatio ?? ALPHA_FLOOR_RATIO;
      const dwellDiagnostics: CoherenceDwellDiagnostics = {
        conditionsMet,
        conditionsMetRaw,
        dwellGraceActive,
        conditionBreakGraceMs: graceMs > 0 ? graceMs : undefined,
        coherencePath,
        pathDetail,
        baselineCalComplete: this.baselineCalComplete,
        useRelativeMode: !!this.config.useRelativeMode,
        dwellBlocker,
        signalValid,
        hasAlphaFloor,
        hasAlphaCeiling,
        alphaCeilingMax: alphaCeiling,
        alphaCeilingBaselineRatio: this.config.alphaCeilingBaselineRatio,
        relativeGate,
        signalValidMinAlpha: signalValidMinAlphaFloor,
        bandsAlpha: bands.alpha,
        alphaBaselinePower: this.baselineAlphaPower,
        smoothedAlphaPower: this.smoothedAlphaPower,
        alphaFloorMin:
          this.baselineAlphaPower != null ? this.baselineAlphaPower * floorRatio : null,
        alphaFloorBaselineRatio: floorRatio,
        alphaBaselineWindowComplete: this.baselineAlphaPower !== null,
      };
      out.dwellDiagnostics = dwellDiagnostics;
    }

    return out;
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.conditionMetSince = null;
    this._isActive = false;
    this.recentAlphaValues = [];
    this.recentBetaValues = [];
    this.lastVariancePushAlpha = null;
    this.lastVariancePushBeta = null;
    this.conditionBrokenSince = null;
    // Reset alpha floor tracking
    this.sessionStartTime = null;
    this.baselineAlphaSamples = [];
    this.baselineAlphaPower = null;
    this.smoothedAlphaPower = null;
  }

  /**
   * Get current state
   */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CoherenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): CoherenceConfig {
    return { ...this.config };
  }
}

/**
 * Calculate coherence score (0-1) based on brainwave data
 * Higher score = more coherent/stable state
 *
 * `opts.scoreScale` — applied after the weighted sum, before clamp (BrainBit only; default 1).
 */
export function calculateCoherence(
  bands: BrainwaveBands,
  variance: number,
  electrodeQuality: number = 1,
  minElectrodeQualityGate: number = 0.5,
  opts?: { minAlphaQuiet?: number; scoreScale?: number },
): number {
  const { alpha, beta, gamma, theta, delta } = bands;
  const minAlphaQuiet = opts?.minAlphaQuiet ?? 0.01;
  const scoreScale = opts?.scoreScale ?? 1;

  // Check if we have valid signal (not all zeros)
  const totalPower = alpha + beta + gamma + theta + delta;

  // SIGNAL VALIDITY: Return low coherence if signal is invalid
  if (totalPower < 0.05) {
    // No meaningful signal - return low value
    return 0.1;
  }

  if (electrodeQuality < minElectrodeQualityGate) {
    // Poor electrode contact - signal unreliable
    return 0.15;
  }

  if (alpha < minAlphaQuiet) {
    // No alpha detected - not a calm state
    return 0.2;
  }

  // Alpha prominence: higher alpha relative to high-frequency bands is good
  // Normalize alpha against total to get relative power
  const alphaRelative = alpha / totalPower;
  const alphaScore = Math.min(1, alphaRelative * 3); // Scale up since alpha is typically 0.1-0.3

  // Beta/Alpha ratio: lower is better (less mental activity)
  const betaAlphaRatio = alpha > minAlphaQuiet ? beta / alpha : 2;
  const ratioScore = Math.max(0, Math.min(1, 1.5 - betaAlphaRatio));

  // Theta contribution: moderate theta is associated with relaxation
  const thetaRelative = theta / totalPower;
  const thetaScore = Math.min(1, thetaRelative * 2.5);

  // Stability score from variance (lower variance = more coherent)
  const stabilityScore = Math.max(0, 1 - Math.sqrt(variance) * 3);

  // Combine scores with weights
  const coherence = (
    alphaScore * 0.35 +
    ratioScore * 0.25 +
    thetaScore * 0.2 +
    stabilityScore * 0.2
  );

  // Normalize to 0-1 (optional scale for devices whose band geometry compresses the raw score)
  return Math.max(0, Math.min(1, coherence * scoreScale));
}

/**
 * Determine which zone the current coherence falls into
 */
export interface CoherenceZoneThresholds {
  /** Minimum coherence for `flow` (default 0.7). */
  flowMin?: number;
  /** Minimum coherence for `stabilizing` (default 0.4). */
  stabilizingMin?: number;
}

export function getCoherenceZone(
  coherence: number,
  thresholds: CoherenceZoneThresholds = {},
): 'flow' | 'stabilizing' | 'noise' {
  const flowMin = thresholds.flowMin ?? 0.7;
  const stabilizingMin = thresholds.stabilizingMin ?? 0.4;
  if (coherence >= flowMin) return 'flow';
  if (coherence >= stabilizingMin) return 'stabilizing';
  return 'noise';
}

/**
 * Calculate calm score (0-1) based on brainwave data
 * Higher score = more calm/relaxed state
 * Uses: alpha prominence, alpha/beta ratio, low variance (stability)
 */
export function calculateCalmScore(
  bands: BrainwaveBands,
  variance: number,
  electrodeQuality: number = 1
): number {
  if (!ENABLE_EXPRESSIVE_MODULATION) {
    return 0; // Feature disabled - return neutral value
  }

  const { alpha, beta, gamma, theta, delta } = bands;
  const totalPower = alpha + beta + gamma + theta + delta;

  // Signal validity checks
  if (totalPower < 0.05 || electrodeQuality < 0.5 || alpha < 0.01) {
    return 0;
  }

  // Alpha prominence: higher alpha relative to total power
  const alphaRelative = alpha / totalPower;
  const alphaProminenceScore = Math.min(1, alphaRelative * 3); // Scale up since alpha is typically 0.1-0.3

  // Alpha/Beta ratio: lower ratio (more alpha, less beta) = more calm
  const betaAlphaRatio = alpha > 0.01 ? beta / alpha : 2;
  const ratioScore = Math.max(0, Math.min(1, 1.5 - betaAlphaRatio));

  // Low variance (stability): lower variance = more stable/calm
  const stabilityScore = Math.max(0, 1 - Math.sqrt(variance) * 3);

  // Combine with weights
  const calmScore = (
    alphaProminenceScore * 0.4 +
    ratioScore * 0.35 +
    stabilityScore * 0.25
  );

  // Normalize and clamp to 0-1
  return Math.max(0, Math.min(1, calmScore));
}

/**
 * Calculate creative flow score (0-1) based on brainwave data
 * Higher score = more creative/flow state
 * Uses: low variance (stability), low theta (penalize high theta), moderate beta (beta-in-midrange)
 */
export function calculateCreativeFlowScore(
  bands: BrainwaveBands,
  variance: number,
  electrodeQuality: number = 1
): number {
  if (!ENABLE_EXPRESSIVE_MODULATION) {
    return 0; // Feature disabled - return neutral value
  }

  const { alpha, beta, gamma, theta, delta } = bands;
  const totalPower = alpha + beta + gamma + theta + delta;

  // Signal validity checks
  if (totalPower < 0.05 || electrodeQuality < 0.5) {
    return 0;
  }

  // Low variance (stability): lower variance = more stable/flow-like
  const stabilityScore = Math.max(0, 1 - Math.sqrt(variance) * 3);

  // Low theta: penalize high theta (theta is associated with drowsiness, not creative flow)
  const thetaRelative = theta / totalPower;
  const lowThetaScore = Math.max(0, 1 - thetaRelative * 4); // Penalize high theta

  // Moderate beta: beta in midrange (not too low, not too high)
  // Creative flow often has moderate beta (alert but not anxious)
  const betaRelative = beta / totalPower;
  // Target range: 0.15-0.35 relative beta power
  let moderateBetaScore = 0;
  if (betaRelative >= 0.15 && betaRelative <= 0.35) {
    // In optimal range - score based on how close to center (0.25)
    const center = 0.25;
    const distance = Math.abs(betaRelative - center);
    moderateBetaScore = Math.max(0, 1 - (distance / 0.1)); // Peak at center, fall off
  } else if (betaRelative < 0.15) {
    // Too low - score based on distance from 0.15
    moderateBetaScore = Math.max(0, betaRelative / 0.15);
  } else {
    // Too high - score based on distance from 0.35
    moderateBetaScore = Math.max(0, (0.5 - betaRelative) / 0.15);
  }
  moderateBetaScore = Math.min(1, moderateBetaScore);

  // Combine with weights
  const creativeFlowScore = (
    stabilityScore * 0.4 +
    lowThetaScore * 0.35 +
    moderateBetaScore * 0.25
  );

  // Normalize and clamp to 0-1
  return Math.max(0, Math.min(1, creativeFlowScore));
}
