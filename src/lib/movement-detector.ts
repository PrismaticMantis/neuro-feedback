/**
 * Movement Detector for Muse 2 Headband
 * 
 * Detects head movement during meditation sessions and triggers gentle audio cues
 * to help users return to stillness for better EEG signal quality.
 * 
 * PRIMARY: Accelerometer-based detection (Muse 2) using EMA baseline deviation
 * FALLBACK: EEG artifact detection (conservative, rarely triggers)
 * 
 * DETECTION METHOD (v2 — EMA baseline):
 * Maintains a slow-moving EMA baseline of accelerometer position.
 * Movement = deviation of current reading from baseline.
 *   delta = |x - baseX| + |y - baseY| + |z - baseZ|
 * 
 * WHY EMA BASELINE instead of per-sample delta:
 * The detector polls at 20Hz. A smooth head nod over 200ms produces ~4 polls,
 * each with a tiny per-sample delta (~0.04g) that individually falls below
 * threshold. With EMA baseline, the baseline barely moves during a nod
 * (time constant ~1s), so the FULL displacement is visible as a large delta.
 * 
 * WHY NOT magnitude-only:
 * Head rotation changes axis distribution while keeping magnitude near 1.0g.
 * Per-axis deviation from baseline catches rotations that magnitude misses.
 * 
 * UI Reference: This is an audio-only feature, no visual UI changes
 * 
 * Test Plan:
 * - iPhone/iPad + Muse 2: nod head, rotate head, slight shifts
 * - Verify cues are not spammy (cooldown enforced)
 * - Verify cue cycles 1-2-3-1
 * - Verify no interference with coherence layers and shimmer SFX
 */

import { museHandler } from './muse-handler';

// Debug flag for movement detection logging
// Set to true to enable detailed movement event logging
// To disable: set DEBUG_MOVEMENT = false
export const DEBUG_MOVEMENT = true;

/**
 * Movement Detection Configuration
 * 
 * EMA BASELINE APPROACH:
 * - baselineAlpha: How fast the baseline tracks the current position.
 *   Lower = slower tracking = more sensitive to movement.
 *   At 0.05 with 20Hz polling, time constant ≈ 1 second.
 *   During a 200ms nod, baseline moves only ~10% toward peak,
 *   so ~90% of the displacement is visible as delta.
 * 
 * - axisDeltaThreshold: Sum of per-axis deviations from baseline.
 *   0.04 catches moderate head nods (5-10°) while ignoring
 *   accelerometer noise at rest (~0.005-0.015 total).
 *   
 *   TUNING:
 *   - Increase if too sensitive (false positives from small tremors)
 *   - Decrease if missing real movements
 *   - Check console logs: [Move] diagnostic delta=... every 3s
 * 
 * - debounceMs: Minimum time between movement event processing
 *   150ms allows fast detection without redundant triggers
 * 
 * - cooldownMs: Minimum time between audio cue playback
 *   2000ms (2s) allows responsive cue triggering while staying gentle
 * 
 * - warmupSamples: Ignore first N samples to let baseline stabilize
 * 
 * EEG FALLBACK THRESHOLDS:
 * - eegArtifactThreshold: RMS spike multiplier to trigger
 *   3.0x = very conservative (broadband spike across channels)
 * - eegCooldownMs: Longer cooldown for fallback (10s)
 */
const MOVEMENT_CONFIG = {
  // Accelerometer-based detection (EMA baseline deviation)
  axisDeltaThreshold: 0.04,     // Sum of per-axis deviation from baseline to trigger
  debounceMs: 150,              // Minimum ms between processing movement
  cooldownMs: 2000,             // Minimum ms between cue playback (2 seconds)
  warmupSamples: 3,             // Ignore first N samples to let baseline init
  baselineAlpha: 0.05,          // EMA smoothing factor (lower = slower baseline, more sensitive)
  diagnosticIntervalMs: 3000,   // Log diagnostic info every N ms (debug only)
  
  // EEG artifact fallback (conservative)
  eegArtifactThreshold: 3.0,    // RMS multiplier for artifact detection
  eegCooldownMs: 10000,         // Longer cooldown for EEG fallback (10 seconds)
  eegMinChannelsAffected: 3,    // Must affect 3+ channels to trigger
};

/**
 * Movement event callback type
 * @param movementDelta - The axis-delta magnitude of detected movement
 * @param source - 'accelerometer' or 'eeg_artifact'
 */
export type MovementEventCallback = (movementDelta: number, source: 'accelerometer' | 'eeg_artifact') => void;

/**
 * Movement Detector Class
 * 
 * Monitors Muse 2 accelerometer data and triggers callbacks when significant
 * head movement is detected. Falls back to EEG artifact detection if
 * accelerometer data is unavailable.
 * 
 * End-to-end pipeline:
 * Muse 2 BLE -> muse-handler (accX/accY/accZ) -> MovementDetector (EMA baseline deviation)
 *   -> onMovementCallback -> audioEngine.playMovementCue() -> audible cue
 */
export class MovementDetector {
  // EMA baseline for accelerometer position (slow-moving average)
  private baseX = 0;
  private baseY = 0;
  private baseZ = 0;
  private baseInitialized = false;
  
  // Debounce and cooldown tracking
  private lastMovementEvent = 0;
  private lastCueTrigger = 0;
  
  // EEG fallback tracking
  private eegRmsBaseline: number[] = [0, 0, 0, 0]; // Per-channel RMS baseline
  private eegRmsAlpha = 0.1; // EMA for EEG baseline
  private lastEegCueTrigger = 0;
  
  // Detection state
  private isEnabled = false;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  
  // Diagnostic logging
  private lastDiagnosticLog = 0;
  
  // Callbacks
  private onMovementCallback: MovementEventCallback | null = null;
  
  // Statistics (for debugging)
  private stats = {
    accelSamples: 0,
    movementEvents: 0,
    cuesTriggered: 0,
    eegArtifacts: 0,
  };

  /**
   * Set the callback for movement events.
   * Typically wired to: (delta, source) => audioEngine.playMovementCue()
   */
  setOnMovement(callback: MovementEventCallback | null): void {
    this.onMovementCallback = callback;
  }

  /**
   * Start monitoring for movement.
   * Call this when session starts (after AudioContext is resumed from user gesture).
   */
  start(): void {
    if (this.isEnabled) {
      if (DEBUG_MOVEMENT) {
        console.log('[Move] Already started, ignoring');
      }
      return;
    }

    this.isEnabled = true;
    this.resetState();
    
    // Start update interval (poll accelerometer data at ~20Hz)
    this.updateInterval = setInterval(() => {
      this.update();
    }, 50); // 50ms = 20Hz
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Started', {
        accelSubscribed: museHandler.accelSubscribed,
        accelSampleCount: museHandler.accelSampleCount,
        museConnected: museHandler.connected,
        config: MOVEMENT_CONFIG,
      });
    }
  }

  /**
   * Stop monitoring for movement.
   * Call this when session ends.
   */
  stop(): void {
    if (!this.isEnabled) {
      return;
    }

    this.isEnabled = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Stopped', {
        stats: this.stats,
      });
    }
  }

  /**
   * Reset all state for a fresh session
   */
  private resetState(): void {
    this.baseX = 0;
    this.baseY = 0;
    this.baseZ = 0;
    this.baseInitialized = false;
    this.lastMovementEvent = 0;
    this.lastCueTrigger = 0;
    this.lastDiagnosticLog = 0;
    this.eegRmsBaseline = [0, 0, 0, 0];
    this.lastEegCueTrigger = 0;
    this.stats = {
      accelSamples: 0,
      movementEvents: 0,
      cuesTriggered: 0,
      eegArtifacts: 0,
    };
  }

  /**
   * Main update loop - checks accelerometer and EEG for movement.
   * 
   * Dynamically checks museHandler.accelSubscribed each tick instead of
   * caching a stale flag, so BLE reconnections are handled correctly.
   */
  private update(): void {
    if (!this.isEnabled) return;
    
    const now = Date.now();
    
    // Primary: Check accelerometer (dynamically verify subscription is active)
    if (museHandler.connected && museHandler.accelSubscribed) {
      this.checkAccelerometer(now);
    }
    
    // Fallback: Check EEG artifacts (only if accelerometer not providing data)
    if (museHandler.connected && now - this.lastCueTrigger > MOVEMENT_CONFIG.cooldownMs) {
      this.checkEegArtifacts(now);
    }
  }

  /**
   * Check accelerometer data for movement using EMA baseline deviation.
   * 
   * The baseline is a slow-moving EMA of accelerometer position.
   * When the head is still, baseline ≈ current → delta ≈ 0.
   * When the head moves, baseline lags behind → delta is large.
   * 
   * With alpha=0.05 at 20Hz, the baseline time constant is ~1 second.
   * A 200ms head nod produces ~90% of its displacement as delta.
   * This is far more reliable than per-sample delta, which fragments
   * smooth movements into tiny per-poll increments.
   */
  private checkAccelerometer(now: number): void {
    const accX = museHandler.accX;
    const accY = museHandler.accY;
    const accZ = museHandler.accZ;
    
    // Skip if no data (all zeros = no subscription or no data yet)
    if (accX === 0 && accY === 0 && accZ === 0) {
      return;
    }
    
    this.stats.accelSamples++;
    
    // Initialize baseline on first valid sample
    if (!this.baseInitialized) {
      this.baseX = accX;
      this.baseY = accY;
      this.baseZ = accZ;
      this.baseInitialized = true;
      if (DEBUG_MOVEMENT) {
        console.log('[Accel] Baseline initialized', {
          x: accX.toFixed(4), y: accY.toFixed(4), z: accZ.toFixed(4),
        });
      }
      return;
    }
    
    // Skip warmup period to let baseline stabilize
    if (this.stats.accelSamples < MOVEMENT_CONFIG.warmupSamples) {
      // Update baseline during warmup (fast tracking)
      this.baseX += 0.3 * (accX - this.baseX);
      this.baseY += 0.3 * (accY - this.baseY);
      this.baseZ += 0.3 * (accZ - this.baseZ);
      return;
    }
    
    // Calculate per-axis deviation from baseline
    const dx = Math.abs(accX - this.baseX);
    const dy = Math.abs(accY - this.baseY);
    const dz = Math.abs(accZ - this.baseZ);
    const axisDelta = dx + dy + dz;
    
    // Update baseline with EMA (slow tracking — this is the key to sensitivity)
    const alpha = MOVEMENT_CONFIG.baselineAlpha;
    this.baseX += alpha * (accX - this.baseX);
    this.baseY += alpha * (accY - this.baseY);
    this.baseZ += alpha * (accZ - this.baseZ);
    
    // Periodic diagnostic log (every N seconds, even if below threshold)
    if (DEBUG_MOVEMENT && now - this.lastDiagnosticLog > MOVEMENT_CONFIG.diagnosticIntervalMs) {
      this.lastDiagnosticLog = now;
      const cooldownLeft = Math.max(0, MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger));
      console.log(
        '[Move] diagnostic' +
        ' delta=' + axisDelta.toFixed(4) +
        ' thr=' + MOVEMENT_CONFIG.axisDeltaThreshold +
        ' cd=' + cooldownLeft + 'ms' +
        ' samples=' + this.stats.accelSamples +
        ' triggers=' + this.stats.cuesTriggered +
        ' acc=[' + accX.toFixed(3) + ',' + accY.toFixed(3) + ',' + accZ.toFixed(3) + ']' +
        ' base=[' + this.baseX.toFixed(3) + ',' + this.baseY.toFixed(3) + ',' + this.baseZ.toFixed(3) + ']'
      );
    }
    
    // Check debounce (minimum interval between movement event processing)
    if (now - this.lastMovementEvent < MOVEMENT_CONFIG.debounceMs) {
      return;
    }
    
    // Check if deviation from baseline exceeds threshold
    if (axisDelta > MOVEMENT_CONFIG.axisDeltaThreshold) {
      this.lastMovementEvent = now;
      this.stats.movementEvents++;
      
      if (DEBUG_MOVEMENT) {
        const cooldownRemaining = Math.max(0, MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger));
        console.log(
          '[Move] DETECTED delta=' + axisDelta.toFixed(4) +
          ' thr=' + MOVEMENT_CONFIG.axisDeltaThreshold +
          ' cooldown=' + cooldownRemaining + 'ms' +
          ' dx=' + dx.toFixed(4) + ' dy=' + dy.toFixed(4) + ' dz=' + dz.toFixed(4)
        );
      }
      
      // Check cooldown before triggering cue
      if (now - this.lastCueTrigger >= MOVEMENT_CONFIG.cooldownMs) {
        this.triggerMovementCue(axisDelta, 'accelerometer');
      } else if (DEBUG_MOVEMENT) {
        const remaining = MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger);
        console.log('[Move] Cooldown active, remaining=' + remaining + 'ms');
      }
    }
  }

  /**
   * Check EEG data for artifacts (fallback detection)
   * Uses RMS spike detection across channels.
   * Very conservative to avoid false positives.
   * Only active when accelerometer data is NOT flowing.
   */
  private checkEegArtifacts(now: number): void {
    const accX = museHandler.accX;
    const accY = museHandler.accY;
    const accZ = museHandler.accZ;
    
    // If accelerometer is providing data, don't use fallback
    if (accX !== 0 || accY !== 0 || accZ !== 0) {
      return;
    }
    
    // Check EEG fallback cooldown
    if (now - this.lastEegCueTrigger < MOVEMENT_CONFIG.eegCooldownMs) {
      return;
    }
    
    // Get electrode quality (proxy for signal disruption)
    const electrodeQuality = museHandler.getElectrodeQuality();
    const poorChannels = electrodeQuality.filter(q => q >= 3).length;
    
    // Get band powers for artifact detection (broadband spike)
    const bands = museHandler.bandsDb;
    const totalPower = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma;
    
    // Update EEG baseline with EMA
    if (this.eegRmsBaseline[0] === 0) {
      this.eegRmsBaseline[0] = totalPower;
    } else {
      this.eegRmsBaseline[0] = 
        this.eegRmsBaseline[0] * (1 - this.eegRmsAlpha) + 
        totalPower * this.eegRmsAlpha;
    }
    
    // Check for artifact: sudden broadband spike AND multiple poor channels
    const powerRatio = totalPower / Math.max(1, this.eegRmsBaseline[0]);
    
    if (powerRatio > MOVEMENT_CONFIG.eegArtifactThreshold && 
        poorChannels >= MOVEMENT_CONFIG.eegMinChannelsAffected) {
      
      this.stats.eegArtifacts++;
      this.lastEegCueTrigger = now;
      
      if (DEBUG_MOVEMENT) {
        console.log('[Move] EEG artifact detected (fallback)', {
          powerRatio: powerRatio.toFixed(2),
          threshold: MOVEMENT_CONFIG.eegArtifactThreshold,
          poorChannels,
        });
      }
      
      if (now - this.lastCueTrigger >= MOVEMENT_CONFIG.cooldownMs) {
        this.triggerMovementCue(powerRatio, 'eeg_artifact');
      }
    }
  }

  /**
   * Trigger a movement cue callback
   */
  private triggerMovementCue(movementDelta: number, source: 'accelerometer' | 'eeg_artifact'): void {
    const now = Date.now();
    this.lastCueTrigger = now;
    this.stats.cuesTriggered++;
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] TRIGGER cue #' + this.stats.cuesTriggered + ' source=' + source +
        ' delta=' + movementDelta.toFixed(4));
    }
    
    if (this.onMovementCallback) {
      this.onMovementCallback(movementDelta, source);
    }
  }

  /**
   * Get current detection stats (for debugging)
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Check if detector is currently active
   */
  get active(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if accelerometer is available (dynamic — checks muse-handler live)
   */
  get accelerometerAvailable(): boolean {
    return museHandler.accelSubscribed;
  }
}

// Singleton instance
export const movementDetector = new MovementDetector();
