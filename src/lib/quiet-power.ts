// Quiet Power State Detection
// Detects when: Beta < Alpha, low variance, sustained 5+ seconds

import type { BrainwaveBands, QuietPowerState } from '../types';

export interface QuietPowerConfig {
  sustainedMs: number; // How long conditions must be met (default 5000ms)
  varianceThreshold: number; // Maximum variance allowed (default 0.15)
  noiseThreshold: number; // Maximum noise level (default 0.3)
  betaAlphaRatioThreshold: number; // Beta/Alpha must be below this (default 1.0)
}

const DEFAULT_CONFIG: QuietPowerConfig = {
  sustainedMs: 5000,
  varianceThreshold: 0.15,
  noiseThreshold: 0.3,
  betaAlphaRatioThreshold: 1.0,
};

export class QuietPowerDetector {
  private config: QuietPowerConfig;
  private conditionMetSince: number | null = null;
  private recentAlphaValues: number[] = [];
  private recentBetaValues: number[] = [];
  private historyLength = 30; // ~1 second of data at 30fps

  // Callbacks
  onEnterQuietPower?: () => void;
  onExitQuietPower?: () => void;

  private _isActive = false;

  constructor(config: Partial<QuietPowerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update with new brainwave data
   * Call this every frame with smoothed band values
   */
  update(bands: BrainwaveBands, motionLevel: number = 0): QuietPowerState {
    const now = Date.now();

    // Store recent values for variance calculation
    this.recentAlphaValues.push(bands.alpha);
    this.recentBetaValues.push(bands.beta);

    while (this.recentAlphaValues.length > this.historyLength) {
      this.recentAlphaValues.shift();
      this.recentBetaValues.shift();
    }

    // Calculate metrics
    const betaAlphaRatio = bands.alpha > 0.01 ? bands.beta / bands.alpha : 10;
    const signalVariance = this.calculateVariance([
      ...this.recentAlphaValues,
      ...this.recentBetaValues,
    ]);
    const noiseLevel = motionLevel + bands.gamma * 0.5; // Gamma often indicates noise/artifacts

    // Check all conditions
    const conditionsMet =
      betaAlphaRatio < this.config.betaAlphaRatioThreshold &&
      signalVariance < this.config.varianceThreshold &&
      noiseLevel < this.config.noiseThreshold;

    if (conditionsMet) {
      if (this.conditionMetSince === null) {
        this.conditionMetSince = now;
      }
    } else {
      // Conditions broken - reset timer
      if (this._isActive) {
        this._isActive = false;
        this.onExitQuietPower?.();
      }
      this.conditionMetSince = null;
    }

    // Check if sustained long enough
    const sustainedMs = this.conditionMetSince ? now - this.conditionMetSince : 0;

    if (sustainedMs >= this.config.sustainedMs && !this._isActive) {
      this._isActive = true;
      this.onEnterQuietPower?.();
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
  setConfig(config: Partial<QuietPowerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Calculate coherence score (0-1) based on brainwave data
 * Higher score = more coherent/stable state approaching Quiet Power
 */
export function calculateCoherence(bands: BrainwaveBands, variance: number): number {
  // Alpha prominence contributes positively
  const alphaProm = bands.alpha / (bands.beta + bands.gamma + 0.01);

  // Low variance contributes positively
  const stabilityScore = Math.max(0, 1 - variance * 5);

  // Beta/Alpha ratio (lower is better)
  const ratioScore = Math.max(0, 1 - bands.beta / (bands.alpha + 0.01));

  // Combine scores
  const coherence = (alphaProm * 0.4 + stabilityScore * 0.3 + ratioScore * 0.3);

  // Normalize to 0-1
  return Math.max(0, Math.min(1, coherence));
}

/**
 * Determine which zone the current coherence falls into
 */
export function getCoherenceZone(coherence: number): 'quiet' | 'stabilizing' | 'noise' {
  if (coherence >= 0.7) return 'quiet';
  if (coherence >= 0.4) return 'stabilizing';
  return 'noise';
}
