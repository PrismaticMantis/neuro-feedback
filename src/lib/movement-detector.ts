/**
 * Movement Detector for Muse 2 Headband
 * 
 * Detects head movement during meditation sessions and triggers gentle audio cues
 * to help users return to stillness for better EEG signal quality.
 * 
 * PRIMARY: Accelerometer-based detection (Muse 2)
 * FALLBACK: EEG artifact detection (conservative, rarely triggers)
 * 
 * UI Reference: This is an audio-only feature, no visual UI changes
 * 
 * Test Plan:
 * - iPhone + Muse 2: nod head, rotate head, slight shifts
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
 * ACCELEROMETER THRESHOLDS:
 * - movementThreshold: Delta in g-force magnitude to trigger movement event
 *   - 0.12g is a good starting point (slight head nod)
 *   - Increase if too sensitive (false positives)
 *   - Decrease if missing real movements
 * 
 * - debounceMs: Minimum time between movement event processing
 *   - 250ms prevents rapid-fire triggers from a single head motion
 * 
 * - cooldownMs: Minimum time between audio cue playback
 *   - 6000ms (6s) ensures cues are gentle nudges, not nagging
 * 
 * - baselineAlpha: EMA smoothing factor for baseline magnitude
 *   - 0.05 = slow adaptation (~20 samples to reach new baseline)
 *   - Higher = faster adaptation but less stable
 * 
 * EEG FALLBACK THRESHOLDS:
 * - eegArtifactThreshold: RMS spike multiplier to trigger
 *   - 3.0x = very conservative (broadband spike across channels)
 * - eegCooldownMs: Longer cooldown for fallback (10s)
 */
const MOVEMENT_CONFIG = {
  // Accelerometer-based detection
  movementThreshold: 0.12,    // g-force delta threshold (tune if needed)
  debounceMs: 250,            // Minimum ms between processing movement
  cooldownMs: 6000,           // Minimum ms between cue playback (6 seconds)
  baselineAlpha: 0.05,        // EMA smoothing for baseline (slower = more stable)
  
  // EEG artifact fallback (conservative)
  eegArtifactThreshold: 3.0,  // RMS multiplier for artifact detection
  eegCooldownMs: 10000,       // Longer cooldown for EEG fallback (10 seconds)
  eegMinChannelsAffected: 3,  // Must affect 3+ channels to trigger
};

/**
 * Movement event callback type
 * @param movementDelta - The magnitude of detected movement
 * @param source - 'accelerometer' or 'eeg_artifact'
 */
export type MovementEventCallback = (movementDelta: number, source: 'accelerometer' | 'eeg_artifact') => void;

/**
 * Movement Detector Class
 * 
 * Monitors Muse 2 accelerometer data and triggers callbacks when significant
 * head movement is detected. Falls back to EEG artifact detection if
 * accelerometer data is unavailable.
 */
export class MovementDetector {
  // Accelerometer baseline tracking
  private baselineMagnitude: number = 1.0; // Start at ~1g (gravity)
  
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
   * Check if accelerometer data is available from the Muse handler
   */
  private checkAccelerometerAvailability(): void {
    // Accelerometer is available if accX/accY/accZ are exposed by museHandler
    // The muse-js library supports accelerometerData subscription
    this.hasAccelerometer = true; // Muse 2 has accelerometer
    
    if (DEBUG_MOVEMENT) {
      console.log('[MovementDetector] Accelerometer availability:', this.hasAccelerometer);
    }
  }

  /**
   * Set the callback for movement events
   */
  setOnMovement(callback: MovementEventCallback | null): void {
    this.onMovementCallback = callback;
  }

  /**
   * Start monitoring for movement
   */
  start(): void {
    if (this.isEnabled) {
      if (DEBUG_MOVEMENT) {
        console.log('[MovementDetector] Already started, ignoring');
      }
      return;
    }

    this.isEnabled = true;
    this.resetBaselines();
    
    // Start update interval (poll accelerometer data at ~20Hz)
    this.updateInterval = setInterval(() => {
      this.update();
    }, 50); // 50ms = 20Hz
    
    if (DEBUG_MOVEMENT) {
      console.log('[MovementDetector] Started', {
        hasAccelerometer: this.hasAccelerometer,
        config: MOVEMENT_CONFIG,
      });
    }
  }

  /**
   * Stop monitoring for movement
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
      console.log('[MovementDetector] Stopped', {
        stats: this.stats,
      });
    }
  }

  /**
   * Reset baseline values (call when starting a new session)
   */
  private resetBaselines(): void {
    this.baselineMagnitude = 1.0; // ~1g at rest (gravity)
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
    
    // Primary: Check accelerometer
    if (this.hasAccelerometer && museHandler.connected) {
      this.checkAccelerometer(now);
    }
    
    // Fallback: Check EEG artifacts (only if accelerometer not triggering)
    // This is very conservative to avoid false positives
    if (museHandler.connected && now - this.lastCueTrigger > MOVEMENT_CONFIG.cooldownMs) {
      this.checkEegArtifacts(now);
    }
  }

  /**
   * Check accelerometer data for movement
   */
  private checkAccelerometer(now: number): void {
    // Get current accelerometer values from museHandler
    const accX = museHandler.accX;
    const accY = museHandler.accY;
    const accZ = museHandler.accZ;
    
    // Skip if no data (all zeros typically means no subscription)
    if (accX === 0 && accY === 0 && accZ === 0) {
      return;
    }
    
    this.stats.accelSamples++;
    
    // Calculate current magnitude (should be ~1g at rest due to gravity)
    const currentMagnitude = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
    
    // Update baseline with EMA
    this.baselineMagnitude = 
      this.baselineMagnitude * (1 - MOVEMENT_CONFIG.baselineAlpha) + 
      currentMagnitude * MOVEMENT_CONFIG.baselineAlpha;
    
    // Calculate movement delta
    const movementDelta = Math.abs(currentMagnitude - this.baselineMagnitude);
    
    // Check debounce
    if (now - this.lastMovementEvent < MOVEMENT_CONFIG.debounceMs) {
      return;
    }
    
    // Check if movement exceeds threshold
    if (movementDelta > MOVEMENT_CONFIG.movementThreshold) {
      this.lastMovementEvent = now;
      this.stats.movementEvents++;
      
      if (DEBUG_MOVEMENT) {
        console.log('[MovementDetector] Movement detected (accelerometer)', {
          movementDelta: movementDelta.toFixed(4),
          threshold: MOVEMENT_CONFIG.movementThreshold,
          currentMagnitude: currentMagnitude.toFixed(4),
          baselineMagnitude: this.baselineMagnitude.toFixed(4),
          accX: accX.toFixed(3),
          accY: accY.toFixed(3),
          accZ: accZ.toFixed(3),
          timestamp: now,
        });
      }
      
      // Check cooldown before triggering cue
      if (now - this.lastCueTrigger >= MOVEMENT_CONFIG.cooldownMs) {
        this.triggerMovementCue(movementDelta, 'accelerometer');
      } else if (DEBUG_MOVEMENT) {
        const remaining = MOVEMENT_CONFIG.cooldownMs - (now - this.lastCueTrigger);
        console.log('[MovementDetector] Movement detected but cooldown active', {
          cooldownRemaining: remaining,
        });
      }
    }
  }

  /**
   * Check EEG data for artifacts (fallback detection)
   * Uses RMS spike detection across channels
   * Very conservative to avoid false positives
   */
  private checkEegArtifacts(now: number): void {
    // Only use fallback if accelerometer isn't providing data
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
    
    // Get electrode quality (this is our proxy for signal disruption)
    const electrodeQuality = museHandler.getElectrodeQuality();
    
    // Count how many channels have poor quality (3 or 4)
    const poorChannels = electrodeQuality.filter(q => q >= 3).length;
    
    // Get band powers for artifact detection (look for broadband spike)
    const bands = museHandler.bandsDb;
    const totalPower = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma;
    
    // Update baseline for EEG
    if (this.eegRmsBaseline[0] === 0) {
      // Initialize baseline
      this.eegRmsBaseline[0] = totalPower;
    } else {
      // Update with EMA
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
        console.log('[MovementDetector] Artifact detected (EEG fallback)', {
          powerRatio: powerRatio.toFixed(2),
          threshold: MOVEMENT_CONFIG.eegArtifactThreshold,
          poorChannels,
          minChannels: MOVEMENT_CONFIG.eegMinChannelsAffected,
          timestamp: now,
        });
      }
      
      // Trigger cue if cooldown allows
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
      console.log('[MovementDetector] 🔔 Movement cue triggered', {
        movementDelta: movementDelta.toFixed(4),
        source,
        cueIndex: this.stats.cuesTriggered,
        timestamp: now,
      });
    }
    
    // Call the callback if set
    if (this.onMovementCallback) {
      this.onMovementCallback(movementDelta, source);
    }
  }

  /**
   * Get current detection stats
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
