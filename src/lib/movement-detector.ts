/**
 * Movement Detector for Muse 2 Headband
 * 
 * Detects head movement during meditation sessions and triggers gentle audio cues
 * to help users return to stillness for better EEG signal quality.
 * 
 * PRIMARY: Accelerometer-based detection (Muse 2) using EMA baseline deviation
 * FALLBACK: EEG artifact detection (conservative, rarely triggers)
 * 
 * DETECTION METHOD (v3 — EMA baseline + robust diagnostics):
 * Maintains a slow-moving EMA baseline of accelerometer position.
 * Movement = deviation of current reading from baseline.
 *   delta = |x - baseX| + |y - baseY| + |z - baseZ|
 * 
 * KEY CHANGE from v2:
 * - start() force-restarts even if already enabled (handles stale sessions)
 * - Diagnostic log runs BEFORE gate checks so failures are always visible
 * - Gate failures are explicitly logged (not silent)
 * - Threshold lowered to 0.025 for better sensitivity to gentle nods
 * 
 * UI Reference: This is an audio-only feature, no visual UI changes
 */

import { museHandler } from './muse-handler';

// Debug flag for movement detection logging
// Set to true to enable detailed movement event logging
// To disable: set DEBUG_MOVEMENT = false
export const DEBUG_MOVEMENT = true;

/**
 * Movement Detection Configuration  (v4 — one-shot trigger with refractory + re-arm)
 * 
 * EMA BASELINE APPROACH:
 * - baselineAlpha: How fast the baseline tracks the current position.
 *   Lower = slower tracking = more sensitive to movement.
 *   At 0.04 with 20Hz polling, time constant ≈ 1.25s.
 * 
 * ONE-SHOT TRIGGER MODEL:
 * A single head movement must produce exactly ONE cue.
 * After firing:
 *   1) Refractory period (refractoryMs): hard block — no triggers at all.
 *   2) Re-arm condition: delta must drop below rearmThreshold for
 *      rearmSettleMs before the detector can fire again.
 * This prevents "peak wobble" from machine-gunning while still
 * allowing distinct separate movements to produce distinct cues.
 *
 * TUNING (check [Move] diagnostic logs every 3s):
 *   - At rest, delta should be ~0.002-0.015 (noise floor)
 *   - A gentle nod produces delta ~0.05-0.15
 *   - A deliberate shake produces delta ~0.15-0.40
 *   - axisDeltaThreshold is set HIGH so only deliberate moves fire
 */
const MOVEMENT_CONFIG = {
  // ── Trigger threshold ──
  axisDeltaThreshold: 0.18,     // Only deliberate head movement fires. Rest noise ~0.01, posture drift ~0.03-0.05, gentle nod ~0.06-0.10, deliberate nod/shake ~0.15+. (raised from 0.14)

  // ── Refractory (hard block after a trigger) ──
  refractoryMs: 600,            // After firing, block ALL triggers for 600ms. Prevents the same motion peak from multi-firing.

  // ── Re-arm (require motion to settle before allowing next trigger) ──
  rearmThreshold: 0.07,         // Delta must drop below this (~50% of trigger threshold) …
  rearmSettleMs: 120,           // … and stay below for this long before the detector re-arms.

  // ── Session start arming delay ──
  armingDelayMs: 5000,          // Ignore all triggers for first 5s (baseline settling + user getting comfortable).

  // ── Baseline ──
  warmupSamples: 5,             // Ignore first N accel samples to let EMA baseline init
  baselineAlpha: 0.04,          // EMA smoothing factor (lower = slower baseline = more sensitive to movement)

  // ── Debug ──
  diagnosticIntervalMs: 3000,   // Log status every N ms

  // ── EEG artifact fallback (conservative) ──
  eegArtifactThreshold: 3.0,
  eegCooldownMs: 10000,
  eegMinChannelsAffected: 3,
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
  
  // One-shot trigger state machine:
  //   'ready'      → delta > threshold → FIRE, transition to 'refractory'
  //   'refractory' → hard block for refractoryMs, then transition to 'rearming'
  //   'rearming'   → wait for delta < rearmThreshold for rearmSettleMs, then → 'ready'
  private triggerState: 'ready' | 'refractory' | 'rearming' = 'ready';
  private lastTriggerTs = 0;          // When the last cue fired
  private rearmBelowSince = 0;        // When delta first dropped below rearmThreshold (0 = not yet)
  
  // Arming delay: no cues for the first N ms after session start
  private sessionStartTs = 0;
  
  // EEG fallback tracking
  private eegRmsBaseline: number[] = [0, 0, 0, 0];
  private eegRmsAlpha = 0.1;
  private lastEegCueTrigger = 0;
  
  // Detection state
  private isEnabled = false;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  
  // Diagnostic logging
  private lastDiagnosticLog = 0;
  private zeroAccelCount = 0;  // Track how many consecutive polls saw all-zero accel
  
  // Callbacks
  private onMovementCallback: MovementEventCallback | null = null;
  
  // Statistics (for debugging)
  private stats = {
    accelSamples: 0,
    movementEvents: 0,
    cuesTriggered: 0,
    eegArtifacts: 0,
    gateFailures: 0,       // Times update() skipped due to connected/accelSubscribed
    callbackCalls: 0,      // Times we called the onMovement callback
  };

  /**
   * Set the callback for movement events.
   * Typically wired to: (delta, source) => audioEngine.playMovementCue()
   */
  setOnMovement(callback: MovementEventCallback | null): void {
    this.onMovementCallback = callback;
    if (DEBUG_MOVEMENT) {
      console.log('[Move] setOnMovement callback=' + (callback ? 'SET' : 'NULL'));
    }
  }

  /**
   * Start monitoring for movement.
   * Call this when session starts (after AudioContext is resumed from user gesture).
   * 
   * IMPORTANT: Always force-restarts even if already enabled.
   * This handles the edge case where a previous session ended abnormally
   * (navigation, error) without calling stop(). Without this, start()
   * would skip, leaving stale baselines and a dead callback.
   */
  start(): void {
    // Force-restart: stop first if already running (handles stale sessions)
    if (this.isEnabled) {
      if (DEBUG_MOVEMENT) {
        console.log('[Move] Force-restarting (was already enabled — stale session cleanup)');
      }
      this.forceStop();
    }

    this.isEnabled = true;
    this.resetState();
    
    // Start update interval (poll accelerometer data at ~20Hz)
    this.updateInterval = setInterval(() => {
      this.update();
    }, 50); // 50ms = 20Hz
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] ✅ Started', {
        museConnected: museHandler.connected,
        accelSubscribed: museHandler.accelSubscribed,
        accelSampleCount: museHandler.accelSampleCount,
        accX: museHandler.accX.toFixed(4),
        accY: museHandler.accY.toFixed(4),
        accZ: museHandler.accZ.toFixed(4),
        hasCallback: !!this.onMovementCallback,
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
    this.forceStop();
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Stopped', { stats: this.stats });
    }
  }

  /**
   * Internal stop — clears interval and disables. Does NOT check isEnabled.
   */
  private forceStop(): void {
    this.isEnabled = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
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
    this.triggerState = 'ready';
    this.lastTriggerTs = 0;
    this.rearmBelowSince = 0;
    this.sessionStartTs = Date.now();
    this.lastDiagnosticLog = 0;
    this.zeroAccelCount = 0;
    this.eegRmsBaseline = [0, 0, 0, 0];
    this.lastEegCueTrigger = 0;
    this.stats = {
      accelSamples: 0,
      movementEvents: 0,
      cuesTriggered: 0,
      eegArtifacts: 0,
      gateFailures: 0,
      callbackCalls: 0,
    };
    if (DEBUG_MOVEMENT) {
      console.log('[Move] Session armed — cues blocked for ' + MOVEMENT_CONFIG.armingDelayMs + 'ms');
    }
  }

  /**
   * Main update loop — runs at 20Hz.
   * 
   * DIAGNOSTIC LOG runs BEFORE any gate checks so we always see status,
   * even when gates block detection. This is critical for debugging
   * "no triggers at all" scenarios.
   */
  private update(): void {
    if (!this.isEnabled) return;
    
    const now = Date.now();
    const isConnected = museHandler.connected;
    const isAccelSub = museHandler.accelSubscribed;
    
    // ---- Diagnostic log: runs REGARDLESS of gate conditions ----
    if (DEBUG_MOVEMENT && now - this.lastDiagnosticLog > MOVEMENT_CONFIG.diagnosticIntervalMs) {
      this.lastDiagnosticLog = now;
      const accX = museHandler.accX;
      const accY = museHandler.accY;
      const accZ = museHandler.accZ;
      const allZero = accX === 0 && accY === 0 && accZ === 0;
      const armingLeft = Math.max(0, MOVEMENT_CONFIG.armingDelayMs - (now - this.sessionStartTs));

      // Compute current delta for diagnostic even if we haven't initialized baseline
      let diagDelta = 0;
      if (this.baseInitialized) {
        diagDelta = Math.abs(accX - this.baseX) + Math.abs(accY - this.baseY) + Math.abs(accZ - this.baseZ);
      }

      const hasNonZero = accX !== 0 || accY !== 0 || accZ !== 0;
      console.log(
        '[Move] STATUS' +
        ' conn=' + isConnected +
        ' accelSub=' + isAccelSub +
        ' hasData=' + hasNonZero +
        ' allZero=' + allZero +
        ' delta=' + diagDelta.toFixed(4) +
        ' thr=' + MOVEMENT_CONFIG.axisDeltaThreshold +
        ' state=' + this.triggerState +
        ' arm=' + armingLeft + 'ms' +
        ' triggers=' + this.stats.cuesTriggered +
        ' callbacks=' + this.stats.callbackCalls +
        ' acc=[' + accX.toFixed(3) + ',' + accY.toFixed(3) + ',' + accZ.toFixed(3) + ']' +
        ' base=[' + this.baseX.toFixed(3) + ',' + this.baseY.toFixed(3) + ',' + this.baseZ.toFixed(3) + ']'
      );
    }
    
    // ---- Primary: Check accelerometer ----
    // IMPORTANT: We no longer gate on accelSubscribed — it can be stale or not set
    // on some BLE implementations. Instead, checkAccelerometer() itself checks if
    // non-zero data is present. We only need Muse connected OR data flowing.
    const hasAccelData = museHandler.accX !== 0 || museHandler.accY !== 0 || museHandler.accZ !== 0;
    if (isConnected || hasAccelData) {
      this.checkAccelerometer(now);
    } else {
      this.stats.gateFailures++;
      // Log gate failure (throttled — only every diagnosticIntervalMs)
      if (this.stats.gateFailures === 1 || this.stats.gateFailures % 100 === 0) {
        if (DEBUG_MOVEMENT) {
          console.warn('[Move] ⚠️ GATE BLOCKED' +
            ' connected=' + isConnected + ' hasAccelData=' + hasAccelData +
            ' accelSubscribed=' + isAccelSub +
            ' (failure #' + this.stats.gateFailures + ')');
        }
      }
    }
    
    // ---- Fallback: EEG artifacts (only if accel not providing data AND arming delay passed) ----
    if (isConnected && !hasAccelData && (now - this.sessionStartTs >= MOVEMENT_CONFIG.armingDelayMs)) {
      this.checkEegArtifacts(now);
    }
  }

  /**
   * Check accelerometer data for movement using EMA baseline deviation.
   * 
   * ONE-SHOT STATE MACHINE:
   *   'ready'      → delta > threshold → FIRE → 'refractory'
   *   'refractory' → wait refractoryMs → 'rearming'
   *   'rearming'   → delta < rearmThreshold for rearmSettleMs → 'ready'
   */
  private checkAccelerometer(now: number): void {
    const accX = museHandler.accX;
    const accY = museHandler.accY;
    const accZ = museHandler.accZ;
    
    // Skip if no data (all zeros = no subscription or no data yet)
    if (accX === 0 && accY === 0 && accZ === 0) {
      this.zeroAccelCount++;
      if (this.zeroAccelCount === 100 && DEBUG_MOVEMENT) {
        console.warn('[Move] ⚠️ Accelerometer 0,0,0 for 5s.' +
          ' accelSubscribed=' + museHandler.accelSubscribed);
      }
      return;
    }
    
    this.zeroAccelCount = 0;
    this.stats.accelSamples++;
    
    // Initialize baseline on first valid sample
    if (!this.baseInitialized) {
      this.baseX = accX;
      this.baseY = accY;
      this.baseZ = accZ;
      this.baseInitialized = true;
      if (DEBUG_MOVEMENT) {
        console.log('[Accel] ✅ Baseline initialized x=' + accX.toFixed(4) + ' y=' + accY.toFixed(4) + ' z=' + accZ.toFixed(4));
      }
      return;
    }
    
    // Warmup: fast-track baseline
    if (this.stats.accelSamples < MOVEMENT_CONFIG.warmupSamples) {
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
    
    // Update baseline with EMA (slow tracking)
    const alpha = MOVEMENT_CONFIG.baselineAlpha;
    this.baseX += alpha * (accX - this.baseX);
    this.baseY += alpha * (accY - this.baseY);
    this.baseZ += alpha * (accZ - this.baseZ);
    
    // ── Arming delay: block all triggers for first N seconds ──
    const timeSinceStart = now - this.sessionStartTs;
    if (timeSinceStart < MOVEMENT_CONFIG.armingDelayMs) {
      return; // silent — diagnostic log already shows arming countdown
    }
    
    // ── One-shot state machine ──
    switch (this.triggerState) {
      
      case 'ready': {
        // Only fire if delta exceeds trigger threshold
        if (axisDelta > MOVEMENT_CONFIG.axisDeltaThreshold) {
          this.stats.movementEvents++;
          
          if (DEBUG_MOVEMENT) {
            console.log(
              '[Move] 🎯 FIRE delta=' + axisDelta.toFixed(4) +
              ' thr=' + MOVEMENT_CONFIG.axisDeltaThreshold +
              ' t=' + (timeSinceStart / 1000).toFixed(1) + 's'
            );
          }
          
          this.triggerState = 'refractory';
          this.lastTriggerTs = now;
          this.rearmBelowSince = 0;
          this.triggerMovementCue(axisDelta, 'accelerometer');
        }
        break;
      }
      
      case 'refractory': {
        // Hard block — wait for refractory period to pass
        if (now - this.lastTriggerTs >= MOVEMENT_CONFIG.refractoryMs) {
          this.triggerState = 'rearming';
          this.rearmBelowSince = 0;
          if (DEBUG_MOVEMENT) {
            console.log('[Move] Refractory done → rearming (delta=' + axisDelta.toFixed(4) + ')');
          }
        }
        break;
      }
      
      case 'rearming': {
        // Wait for motion to settle before allowing next trigger
        if (axisDelta < MOVEMENT_CONFIG.rearmThreshold) {
          // Delta is below re-arm threshold — start or continue settle timer
          if (this.rearmBelowSince === 0) {
            this.rearmBelowSince = now;
          }
          // Check if settled long enough
          if (now - this.rearmBelowSince >= MOVEMENT_CONFIG.rearmSettleMs) {
            this.triggerState = 'ready';
            if (DEBUG_MOVEMENT) {
              console.log('[Move] ✅ Re-armed (settled for ' + MOVEMENT_CONFIG.rearmSettleMs + 'ms, delta=' + axisDelta.toFixed(4) + ')');
            }
          }
        } else {
          // Delta still high — reset settle timer
          this.rearmBelowSince = 0;
        }
        break;
      }
    }
  }

  /**
   * Check EEG data for artifacts (fallback detection)
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
      
      this.triggerMovementCue(powerRatio, 'eeg_artifact');
    }
  }

  /**
   * Trigger a movement cue callback
   */
  private triggerMovementCue(movementDelta: number, source: 'accelerometer' | 'eeg_artifact'): void {
    this.stats.cuesTriggered++;
    
    if (DEBUG_MOVEMENT) {
      console.log('[Move] 🔔 TRIGGER cue #' + this.stats.cuesTriggered + ' source=' + source +
        ' delta=' + movementDelta.toFixed(4) + ' hasCallback=' + !!this.onMovementCallback);
    }
    
    if (this.onMovementCallback) {
      this.stats.callbackCalls++;
      try {
        this.onMovementCallback(movementDelta, source);
      } catch (err) {
        console.error('[Move] ❌ Callback threw an error:', err);
      }
    } else if (DEBUG_MOVEMENT) {
      console.warn('[Move] ⚠️ TRIGGER fired but onMovementCallback is NULL — no audio will play');
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
