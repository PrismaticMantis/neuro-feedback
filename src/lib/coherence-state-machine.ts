// Unified Coherence State Machine
// Single source of truth for coherence state used by both UI and AudioEngine

export type CoherenceState = 'baseline' | 'stabilizing' | 'coherent';

export interface CoherenceStateMachineConfig {
  enterThreshold: number; // Coherence value to enter stabilizing (default 0.75)
  exitThreshold: number; // Coherence value to exit coherent (default 0.70)
  enterSustainSeconds: number; // How long to sustain enter threshold to become coherent (default 1.8)
  exitSustainSeconds: number; // How long to sustain exit threshold to leave coherent (default 0.6)
  maxPacketGapMs: number; // Max time without data before forcing baseline (default 1000)
  minContactQuality: number; // Minimum electrode contact quality (0-1, default 0.5)
  enableDebugLogging: boolean; // Enable debug logs (default false)
}

const DEFAULT_CONFIG: CoherenceStateMachineConfig = {
  enterThreshold: 0.75,
  exitThreshold: 0.70,
  enterSustainSeconds: 1.8,
  exitSustainSeconds: 0.6,
  maxPacketGapMs: 1000,
  minContactQuality: 0.5,
  enableDebugLogging: false,
};

export interface SignalQuality {
  isConnected: boolean;
  contactQuality: number; // 0-1
  timeSinceLastUpdate: number; // milliseconds
}

export class CoherenceStateMachine {
  private config: CoherenceStateMachineConfig;
  private state: CoherenceState = 'baseline';
  
  // Timers
  private enterTimerStart: number | null = null; // When we entered stabilizing
  private exitTimerStart: number | null = null; // When we dropped below exit threshold
  
  // Callbacks
  onStateChange?: (newState: CoherenceState, oldState: CoherenceState) => void;

  constructor(config: Partial<CoherenceStateMachineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update state machine with new coherence value and signal quality
   * Returns the current state
   */
  update(
    coherence: number,
    signalQuality: SignalQuality,
    _currentTime: number = Date.now()
  ): CoherenceState {
    const currentTime = _currentTime;
    // Check signal quality - if signal is bad, force baseline
    const signalOk = this.checkSignalQuality(signalQuality);
    
    if (!signalOk) {
      // Signal is invalid - force baseline and reset timers
      if (this.state !== 'baseline') {
        const oldState = this.state;
        this.state = 'baseline';
        this.enterTimerStart = null;
        this.exitTimerStart = null;
        this.logStateChange(oldState, 'baseline', coherence, 'Signal quality check failed');
        this.onStateChange?.('baseline', oldState);
      }
      return this.state;
    }


    // State machine transitions
    const oldState = this.state;
    
    switch (this.state) {
      case 'baseline':
        if (coherence >= this.config.enterThreshold) {
          // Enter stabilizing phase
          this.state = 'stabilizing';
          this.enterTimerStart = currentTime;
          this.exitTimerStart = null; // Reset exit timer
          this.logStateChange(oldState, 'stabilizing', coherence, `Coherence >= ${this.config.enterThreshold}`);
          this.onStateChange?.('stabilizing', oldState);
        }
        break;

      case 'stabilizing':
        if (coherence < this.config.enterThreshold) {
          // Drop below threshold - return to baseline and RESET timer
          this.state = 'baseline';
          this.enterTimerStart = null; // CRITICAL: Reset timer
          this.exitTimerStart = null;
          this.logStateChange(oldState, 'baseline', coherence, `Coherence < ${this.config.enterThreshold} (reset)`);
          this.onStateChange?.('baseline', oldState);
        } else {
          // Still above threshold - check if sustain time has passed
          if (this.enterTimerStart === null) {
            // Should not happen, but reset if it does
            this.enterTimerStart = currentTime;
          }
          const sustainTime = (currentTime - this.enterTimerStart) / 1000;
          
          if (sustainTime >= this.config.enterSustainSeconds) {
            // Enter coherent state
            this.state = 'coherent';
            this.enterTimerStart = null; // Clear enter timer
            this.exitTimerStart = null; // Reset exit timer
            this.logStateChange(oldState, 'coherent', coherence, `Sustained for ${sustainTime.toFixed(2)}s`);
            this.onStateChange?.('coherent', oldState);
          } else {
            // Still stabilizing - log progress occasionally
            if (this.config.enableDebugLogging) {
              const progressSeconds = Math.floor(sustainTime * 2) / 2;
              if (progressSeconds !== Math.floor((sustainTime - 0.1) * 2) / 2) {
                console.log(`[CoherenceStateMachine] Stabilizing: ${sustainTime.toFixed(2)}s / ${this.config.enterSustainSeconds}s`);
              }
            }
          }
        }
        break;

      case 'coherent':
        if (coherence <= this.config.exitThreshold) {
          // Drop below exit threshold - start exit timer
          if (this.exitTimerStart === null) {
            this.exitTimerStart = currentTime;
            if (this.config.enableDebugLogging) {
              console.log(`[CoherenceStateMachine] Exit timer started (coherence ${coherence.toFixed(3)} <= ${this.config.exitThreshold})`);
            }
          } else {
            // Check if exit sustain time has passed
            const exitSustainTime = (currentTime - this.exitTimerStart) / 1000;
            if (exitSustainTime >= this.config.exitSustainSeconds) {
              // Exit coherent state
              this.state = 'baseline';
              this.exitTimerStart = null; // Clear exit timer
              this.enterTimerStart = null; // Reset enter timer
              this.logStateChange(oldState, 'baseline', coherence, `Exited after ${exitSustainTime.toFixed(2)}s below threshold`);
              this.onStateChange?.('baseline', oldState);
            } else {
              // Still in exit sustain period
              if (this.config.enableDebugLogging) {
                const progressSeconds = Math.floor(exitSustainTime * 2) / 2;
                if (progressSeconds !== Math.floor((exitSustainTime - 0.1) * 2) / 2) {
                  console.log(`[CoherenceStateMachine] Exiting: ${exitSustainTime.toFixed(2)}s / ${this.config.exitSustainSeconds}s`);
                }
              }
            }
          }
        } else {
          // Coherence recovered above exit threshold - cancel exit timer
          if (this.exitTimerStart !== null) {
            this.exitTimerStart = null;
            if (this.config.enableDebugLogging) {
              console.log(`[CoherenceStateMachine] Exit timer cancelled (coherence ${coherence.toFixed(3)} > ${this.config.exitThreshold})`);
            }
          }
        }
        break;
    }

    return this.state;
  }

  /**
   * Check if signal quality is acceptable
   * Returns false if signal should force baseline state
   */
  private checkSignalQuality(signalQuality: SignalQuality): boolean {
    // Must be connected
    if (!signalQuality.isConnected) {
      if (this.config.enableDebugLogging) {
        console.log('[CoherenceStateMachine] Signal check failed: not connected');
      }
      return false;
    }

    // Check contact quality
    if (signalQuality.contactQuality < this.config.minContactQuality) {
      if (this.config.enableDebugLogging) {
        console.log(`[CoherenceStateMachine] Signal check failed: contact quality ${signalQuality.contactQuality.toFixed(2)} < ${this.config.minContactQuality}`);
      }
      return false;
    }

    // Check data freshness
    if (signalQuality.timeSinceLastUpdate > this.config.maxPacketGapMs) {
      if (this.config.enableDebugLogging) {
        console.log(`[CoherenceStateMachine] Signal check failed: data gap ${signalQuality.timeSinceLastUpdate}ms > ${this.config.maxPacketGapMs}ms`);
      }
      return false;
    }

    return true;
  }

  /**
   * Log state change (if debug enabled)
   */
  private logStateChange(
    oldState: CoherenceState,
    newState: CoherenceState,
    coherence: number,
    reason: string
  ): void {
    if (this.config.enableDebugLogging) {
      console.log(`[CoherenceStateMachine] ${oldState} -> ${newState}`, {
        coherence: coherence.toFixed(3),
        reason,
        enterTimer: this.enterTimerStart ? ((Date.now() - this.enterTimerStart) / 1000).toFixed(2) + 's' : null,
        exitTimer: this.exitTimerStart ? ((Date.now() - this.exitTimerStart) / 1000).toFixed(2) + 's' : null,
      });
    }
  }

  /**
   * Get current state
   */
  getState(): CoherenceState {
    return this.state;
  }

  /**
   * Reset state machine (e.g., on session start/stop)
   */
  reset(): void {
    const oldState = this.state;
    this.state = 'baseline';
    this.enterTimerStart = null;
    this.exitTimerStart = null;
    
    if (oldState !== 'baseline') {
      this.logStateChange(oldState, 'baseline', 0, 'Reset');
      this.onStateChange?.('baseline', oldState);
    }
  }

  /**
   * Get timer information (for debugging)
   */
  getTimerInfo(): {
    enterTimerSeconds: number | null;
    exitTimerSeconds: number | null;
  } {
    const now = Date.now();
    return {
      enterTimerSeconds: this.enterTimerStart ? (now - this.enterTimerStart) / 1000 : null,
      exitTimerSeconds: this.exitTimerStart ? (now - this.exitTimerStart) / 1000 : null,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CoherenceStateMachineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): CoherenceStateMachineConfig {
    return { ...this.config };
  }
}
