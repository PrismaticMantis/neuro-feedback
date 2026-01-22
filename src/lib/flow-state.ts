// Flow State Detection
// Detects when: Beta < Alpha, low variance, sustained 5+ seconds

import type { BrainwaveBands, FlowState } from '../types';

export interface FlowStateConfig {
  sustainedMs: number; // How long conditions must be met (default 5000ms)
  varianceThreshold: number; // Maximum variance allowed (default 0.15)
  noiseThreshold: number; // Maximum noise level (default 0.3)
  betaAlphaRatioThreshold: number; // Beta/Alpha must be below this (default 1.0)
  minSignalPower: number; // Minimum total band power to consider signal valid (default 0.05)
  minVariance: number; // Minimum variance - too low means no real signal (default 0.001)
}

const DEFAULT_CONFIG: FlowStateConfig = {
  sustainedMs: 5000,
  varianceThreshold: 0.15,
  noiseThreshold: 0.3,
  betaAlphaRatioThreshold: 1.0,
  minSignalPower: 0.05, // Require at least 5% total power
  minVariance: 0.001, // Require some variance (not flat line)
};

// Alpha floor safeguard constants
const BASELINE_WINDOW_MS = 15000; // 15 seconds to establish baseline alpha
const ALPHA_FLOOR_RATIO = 0.50; // Alpha must be at least 50% of baseline
const ALPHA_SMOOTHING = 0.1; // EMA smoothing factor for alpha power

export class FlowStateDetector {
  private config: FlowStateConfig;
  private conditionMetSince: number | null = null;
  private recentAlphaValues: number[] = [];
  private recentBetaValues: number[] = [];
  private historyLength = 30; // ~1 second of data at 30fps

  // Alpha floor safeguard tracking
  private sessionStartTime: number | null = null;
  private baselineAlphaSamples: number[] = [];
  private baselineAlphaPower: number | null = null;
  private smoothedAlphaPower: number | null = null;

  // Callbacks
  onEnterFlowState?: () => void;
  onExitFlowState?: () => void;

  private _isActive = false;

  constructor(config: Partial<FlowStateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update with new brainwave data
   * Call this every frame with smoothed band values
   */
  update(bands: BrainwaveBands, motionLevel: number = 0, electrodeContactQuality: number = 0): FlowState {
    const now = Date.now();

    // Initialize session start time on first update
    if (this.sessionStartTime === null) {
      this.sessionStartTime = now;
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

    // Store recent values for variance calculation
    this.recentAlphaValues.push(bands.alpha);
    this.recentBetaValues.push(bands.beta);

    while (this.recentAlphaValues.length > this.historyLength) {
      this.recentAlphaValues.shift();
      this.recentBetaValues.shift();
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

    // SIGNAL VALIDITY CHECKS:
    // 1. Must have minimum total signal power (not all zeros)
    const hasMinPower = totalPower >= this.config.minSignalPower;
    
    // 2. Must have some variance (not a flat line / no real signal)
    const hasMinVariance = signalVariance >= this.config.minVariance;
    
    // 3. Must have reasonable electrode contact (at least 50% quality)
    const hasGoodContact = electrodeContactQuality >= 0.5;
    
    // 4. Alpha must be detectable (key indicator of calm state)
    const hasAlpha = bands.alpha >= 0.02;

    // Signal is valid only if all validity checks pass
    const signalValid = hasMinPower && hasMinVariance && hasGoodContact && hasAlpha;

    // Alpha floor safeguard (only apply after baseline is established)
    let hasAlphaFloor = true; // Default to true if baseline not ready yet
    if (this.baselineAlphaPower !== null && this.smoothedAlphaPower !== null) {
      const alphaFloor = this.baselineAlphaPower * ALPHA_FLOOR_RATIO;
      hasAlphaFloor = this.smoothedAlphaPower >= alphaFloor;
    }

    // Check flow state conditions (only if signal is valid and alpha floor is met)
    const conditionsMet = signalValid &&
      hasAlphaFloor &&
      betaAlphaRatio < this.config.betaAlphaRatioThreshold &&
      signalVariance < this.config.varianceThreshold &&
      noiseLevel < this.config.noiseThreshold;

    if (conditionsMet) {
      if (this.conditionMetSince === null) {
        this.conditionMetSince = now;
      }
    } else {
      // Conditions broken or signal invalid - reset timer
      if (this._isActive) {
        this._isActive = false;
        this.onExitFlowState?.();
      }
      this.conditionMetSince = null;
    }

    // Check if sustained long enough
    const sustainedMs = this.conditionMetSince ? now - this.conditionMetSince : 0;

    if (sustainedMs >= this.config.sustainedMs && !this._isActive) {
      this._isActive = true;
      this.onEnterFlowState?.();
    }

    return {
      isActive: this._isActive,
      sustainedMs,
      betaAlphaRatio,
      signalVariance,
      noiseLevel,
    };
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
  setConfig(config: Partial<FlowStateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FlowStateConfig {
    return { ...this.config };
  }
}

/**
 * Calculate coherence score (0-1) based on brainwave data
 * Higher score = more coherent/stable state approaching Flow State
 */
export function calculateCoherence(bands: BrainwaveBands, variance: number, electrodeQuality: number = 1): number {
  const { alpha, beta, gamma, theta, delta } = bands;
  
  // Check if we have valid signal (not all zeros)
  const totalPower = alpha + beta + gamma + theta + delta;
  
  // SIGNAL VALIDITY: Return low coherence if signal is invalid
  if (totalPower < 0.05) {
    // No meaningful signal - return low value
    return 0.1;
  }
  
  if (electrodeQuality < 0.5) {
    // Poor electrode contact - signal unreliable
    return 0.15;
  }
  
  if (alpha < 0.01) {
    // No alpha detected - not a calm state
    return 0.2;
  }

  // Alpha prominence: higher alpha relative to high-frequency bands is good
  // Normalize alpha against total to get relative power
  const alphaRelative = alpha / totalPower;
  const alphaScore = Math.min(1, alphaRelative * 3); // Scale up since alpha is typically 0.1-0.3

  // Beta/Alpha ratio: lower is better (less mental activity)
  const betaAlphaRatio = alpha > 0.01 ? beta / alpha : 2;
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

  // Normalize to 0-1
  return Math.max(0, Math.min(1, coherence));
}

/**
 * Determine which zone the current coherence falls into
 */
export function getCoherenceZone(coherence: number): 'flow' | 'stabilizing' | 'noise' {
  if (coherence >= 0.7) return 'flow';
  if (coherence >= 0.4) return 'stabilizing';
  return 'noise';
}
