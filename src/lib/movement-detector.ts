/**
 * Movement Detector for Muse 2 Headband
 * 
 * Detects head movement during meditation sessions and triggers gentle audio cues
 * to help users return to stillness for better EEG signal quality.
 * 
 * PRIMARY: Accelerometer-based detection (Muse 2) using per-axis delta
 * FALLBACK: EEG artifact detection (conservative, rarely triggers)
 * 
 * DETECTION METHOD:
 * Uses per-axis delta: delta = |x - prevX| + |y - prevY| + |z - prevZ|
 * This is superior to magnitude-based detection because head *rotation*
 * (e.g. turning/nodding) can keep magnitude near 1.0g while changing
 * individual axis values significantly. Per-axis delta catches rotations.
 * 
 * UI Reference: This is an audio-only feature, no visual UI changes
 * 
 * Test Plan:
 * - iPhone/iPad + Muse 2: nod head, rotate head, slight shifts
 * - Verify cues are not spammy (cooldown enforced)
 * - Verify cue cycles 1-2-3-1
 * - Verify no interference with coherence layers and shimmer SFX
 * - Press DEBUG "Test Movement Cue" button to isolate audio from detection
 */

import { museHandler } from './muse-handler';

// Debug flag for movement detection logging
// Set to true to enable detailed movement event logging
// To disable: set DEBUG_MOVEMENT = false
export const DEBUG_MOVEMENT = true;

/**
 * Movement Detection Configuration
 * 
 * AXIS-DELTA THRESHOLDS:
 * - axisDeltaThreshold: Sum of per-axis deltas to trigger movement event
 *   The Muse 2 accelerometer values are in g-force (scale 1/16384).
 *   At rest, values are roughly stable with gravity on one axis (~1.0g).
 *   A gentle head nod produces axis deltas of ~0.03-0.08 per axis.
 *   Sum of 3 axes: ~0.06 is a reasonable starting threshold.
 *   
 *   TUNING:
 *   - Increase if too sensitive (false positives from small tremors)
 *   - Decrease if missing real movements
 *   - Check console logs: [Move] delta=... threshold=...
 * 
 * - debounceMs: Minimum time between movement event processing
 *   250ms prevents rapid-fire triggers from a single head motion
 * 
 * - cooldownMs: Minimum time between audio cue playback
 *   6000ms (6s) ensures cues are gentle nudges, not nagging
 * 
 * EEG FALLBACK THRESHOLDS:
 * - eegArtifactThreshold: RMS spike multiplier to trigger
 *   3.0x = very conservative (broadband spike across channels)
 * - eegCooldownMs: Longer cooldown for fallback (10s)
 */
const MOVEMENT_CONFIG = {
  // Accelerometer-based detection (per-axis delta)
  axisDeltaThreshold: 0.06,     // Sum of |dx|+|dy|+|dz| to trigger (tune via logs)
  debounceMs: 250,              // Minimum ms between processing movement
  cooldownMs: 6000,             // Minimum ms between cue playback (6 seconds)
  warmupSamples: 5,             // Ignore first N samples to let prevAcc stabilize
  
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
 * Muse 2 BLE -> muse-handler (accX/accY/accZ) -> MovementDetector (axis-delta)
 *   -> onMovementCallback -> audioEngine.playMovementCue() -> audible cue
 */
export class MovementDetector {
  // Previous accelerometer values for axis-delta calculation
  private prevAccX: number = 0;
  private prevAccY: number = 0;
  private prevAccZ: number = 0;
  private hasPrevSample: boolean = false;
  
  // Debounce and cooldown tracking
  private lastMovementEvent: number = 0;
  private lastCueTrigger: number = 0;
  
  // EEG fallback tracking
  private eegRmsBaseline: number[] = [0, 0, 0, 0]; // Per-channel RMS baseline
  private eegRmsAlpha: number = 0.1; // EMA for EEG baseline
  private lastEegCueTrigger: number = 0;
  
  // Detection state
  private isEnabled: boolean = false;
  private hasAccelerometer: boolean = false;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  
  // Callbacks
  private onMovementCallback: MovementEventCallback | null = null;
  
  // Statistics (for debugging)
  private stats = {
    accelSamples: 0,
    movementEvents: 0,
    cuesTriggered: 0,
    eegArtifacts: 0,
  };

  constructor() {
    // Check if accelerometer data is available from Muse handler
    this.checkAccelerometerAvailability();
  }

  /**
   * Check if accelerometer data is available from the Muse handler.
   * 
   * The muse-js library subscribes to GATT characteristic 273e000a (accelerometer)
   * during connect(). We check:
   * 1. museHandler.accelSubscribed — was the subscription created?
   * 2. museHandler.accelSampleCount — is data actually arriving?
   * 
   * If not yet connected, we optimistically assume it will work (Muse 2 always
   * exposes accelerometer). The fallback (EEG artifacts) activates automatically
   * if accX/accY/accZ stay at 0.
   */
  private checkAccelerometerAvailability(): void {
    const subscribed = museHandler.accelSubscribed;
    const sampleCount = museHandler.accelSampleCount;
    
    // If connected and subscribed, or not yet connected (assume will be), mark as available
    this.hasAccelerometer = subscribed || !museHandler.connected;
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Accelerometer availability check:', {
        accelSubscribed: subscribed,
        accelSampleCount: sampleCount,
        museConnected: museHandler.connected,
        hasAccelerometer: this.hasAccelerometer,
      });
    }
  }

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

    // Re-check accelerometer availability at session start
    this.checkAccelerometerAvailability();

    this.isEnabled = true;
    this.resetBaselines();
    
    // Start update interval (poll accelerometer data at ~20Hz)
    this.updateInterval = setInterval(() => {
      this.update();
    }, 50); // 50ms = 20Hz
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Started', {
        hasAccelerometer: this.hasAccelerometer,
        accelSubscribed: museHandler.accelSubscribed,
        accelSampleCount: museHandler.accelSampleCount,
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
   * Reset baseline values (call when starting a new session)
   */
  private resetBaselines(): void {
    this.prevAccX = 0;
    this.prevAccY = 0;
    this.prevAccZ = 0;
    this.hasPrevSample = false;
    this.lastMovementEvent = 0;
    this.lastCueTrigger = 0;
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
   * Main update loop - checks accelerometer and EEG for movement
   */
  private update(): void {
    if (!this.isEnabled) return;
    
    const now = Date.now();
    
    // Primary: Check accelerometer (requires subscription AND Muse connected)
    if (this.hasAccelerometer && museHandler.connected) {
      this.checkAccelerometer(now);
    }
    
    // Fallback: Check EEG artifacts (only if accelerometer not providing data)
    if (museHandler.connected && now - this.lastCueTrigger > MOVEMENT_CONFIG.cooldownMs) {
      this.checkEegArtifacts(now);
    }
  }

  /**
   * Check accelerometer data for movement using per-axis delta.
   * 
   * Detection: delta = |x - prevX| + |y - prevY| + |z - prevZ|
   * This catches rotations that magnitude-only detection misses,
   * because rotating the head changes axis distribution while
   * keeping total magnitude near 1.0g.
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
    
    // If this is our first valid sample, store it and wait for the next
    if (!this.hasPrevSample) {
      this.prevAccX = accX;
      this.prevAccY = accY;
      this.prevAccZ = accZ;
      this.hasPrevSample = true;
      if (DEBUG_MOVEMENT) {
        console.log('[Accel] First sample received, initializing prev values', {
          x: accX.toFixed(4), y: accY.toFixed(4), z: accZ.toFixed(4),
        });
      }
      return;
    }
    
    // Skip warmup period to let values stabilize
    if (this.stats.accelSamples < MOVEMENT_CONFIG.warmupSamples) {
      this.prevAccX = accX;
      this.prevAccY = accY;
      this.prevAccZ = accZ;
      return;
    }
    
    // Calculate per-axis delta (sum of absolute differences)
    const dx = Math.abs(accX - this.prevAccX);
    const dy = Math.abs(accY - this.prevAccY);
    const dz = Math.abs(accZ - this.prevAccZ);
    const axisDelta = dx + dy + dz;
    
    // Update previous values for next iteration
    this.prevAccX = accX;
    this.prevAccY = accY;
    this.prevAccZ = accZ;
    
    // Check debounce
    if (now - this.lastMovementEvent < MOVEMENT_CONFIG.debounceMs) {
      return;
    }
    
    // Check if axis-delta exceeds threshold
    if (axisDelta > MOVEMENT_CONFIG.axisDeltaThreshold) {
      this.lastMovementEvent = now;
      this.stats.movementEvents++;
      
      if (DEBUG_MOVEMENT) {
        const cooldownRemaining = Math.max(0, MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger));
        console.log('[Move] delta=' + axisDelta.toFixed(4) +
          ' threshold=' + MOVEMENT_CONFIG.axisDeltaThreshold +
          ' cooldownRemaining=' + cooldownRemaining + 'ms', {
          dx: dx.toFixed(4), dy: dy.toFixed(4), dz: dz.toFixed(4),
          accX: accX.toFixed(4), accY: accY.toFixed(4), accZ: accZ.toFixed(4),
        });
      }
      
      // Check cooldown before triggering cue
      if (now - this.lastCueTrigger >= MOVEMENT_CONFIG.cooldownMs) {
        this.triggerMovementCue(axisDelta, 'accelerometer');
      } else if (DEBUG_MOVEMENT) {
        const remaining = MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger);
        console.log('[Move] Movement detected but cooldown active, remaining=' + remaining + 'ms');
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
   * Check if accelerometer is available
   */
  get accelerometerAvailable(): boolean {
    return this.hasAccelerometer;
  }
}

// Singleton instance
export const movementDetector = new MovementDetector();
