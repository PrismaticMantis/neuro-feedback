// Audio Engine for Entrainment and Coherence Crossfade
// Handles MP3-based baseline/coherence crossfade, shimmer layer, and binaural beats

import type {
  EntrainmentType,
  BinauralPreset,
  BinauralPresetName,
} from '../types';
import { CoherenceStateMachine, type SignalQuality, type CoherenceStateMachineConfig } from './coherence-state-machine';
import type { CoherenceState } from './coherence-state-machine';
import { ENABLE_EXPRESSIVE_MODULATION } from './flow-state';
import { ENABLE_PPG_MODULATION, DEBUG_PPG } from './muse-handler';

// Debug flag for coherence events (shimmer, sustained layer)
// Set to true to enable detailed coherence event logging
export const DEBUG_COHERENCE_EVENTS = true;

// Debug flag for movement cue events
// Set to true to enable detailed movement cue logging
export const DEBUG_MOVEMENT_CUES = true;

// Debug flag for movement cue AUDIO diagnostics (load/decode/play/gain chain)
// Set to true to log every step of the audio playback pipeline
export const DEBUG_MOVEMENT_AUDIO = false;

/**
 * COHERENCE TRIGGER PARAMETERS
 * 
 * Centralized parameters for shimmer and sustained layer activation.
 * These are tuned for real-world use where ~60%+ coherence is common.
 * 
 * SHIMMER LOGIC:
 * - Triggers when coherence crosses ABOVE shimmerTriggerThreshold
 * - OR when coherence stays above threshold for shimmerHoldMs
 * - Cooldown prevents spam (shimmerCooldownMs between triggers)
 * 
 * SUSTAINED LAYER LOGIC:
 * - Activates after sustainedHoldMs ABOVE sustainedThreshold
 * - Hysteresis: won't exit until coherence falls BELOW sustainedExitThreshold
 *   for sustainedExitHoldMs (prevents flickering)
 * 
 * DEBUG: Enable DEBUG_COHERENCE_EVENTS above for detailed logging
 */
const COHERENCE_TRIGGER_PARAMS = {
  // Shimmer trigger parameters
  shimmerTriggerThreshold: 0.55,    // Coherence % to trigger shimmer (lowered from implicit 0.75)
  shimmerHoldMs: 3000,              // Hold time above threshold before shimmer (3s)
  shimmerCooldownMs: 20000,         // Cooldown between shimmer triggers (20s, was 45s)
  
  // Sustained layer parameters
  sustainedThreshold: 0.58,         // Coherence % for sustained layer (lowered for achievability)
  sustainedHoldMs: 12000,           // Hold time above threshold to activate (12s, was 25s)
  sustainedExitThreshold: 0.48,     // Must fall below this to exit (hysteresis)
  sustainedExitHoldMs: 5000,        // Must stay below exit threshold for this long (5s)
};

// Crossfade constants (centralized for easy tweaking)
const CROSSFADE_CONSTANTS = {
  ATTACK_SECONDS: 5.5, // Smoother crossfade in (increased from 2.5)
  RELEASE_SECONDS: 7.5, // Smoother crossfade out (increased from 3.5)
  START_FADE_SECONDS: 4.0,
  // Shimmer tuning (quieter, rarer, smoother)
  SHIMMER_BASE_GAIN: 0.08, // Slightly increased for audibility (was 0.07)
  SHIMMER_MAX_GAIN: 0.14, // Increased for audibility (was 0.10)
  SHIMMER_RANGE: 0.06, // max - base (increased range)
  SHIMMER_FADE_IN_SECONDS: 4.0,  // Faster fade-in (was 6.0)
  SHIMMER_FADE_OUT_SECONDS: 8.0,  // Shorter fade-out (was 10.0)
  SHIMMER_FADE_OUT_DELAY_SECONDS: 1.0, // Delay before starting fade-out (hysteresis)
  SHIMMER_UPDATE_SMOOTH_SECONDS: 0.8, // Smooth update time for shimmer gain changes
  // Legacy constants (now controlled by COHERENCE_TRIGGER_PARAMS)
  SHIMMER_SUSTAIN_SECONDS: COHERENCE_TRIGGER_PARAMS.shimmerHoldMs / 1000,
  SHIMMER_COOLDOWN_SECONDS: COHERENCE_TRIGGER_PARAMS.shimmerCooldownMs / 1000,
  // Sustained coherence layer constants (now controlled by COHERENCE_TRIGGER_PARAMS)
  SUSTAINED_COHERENCE_SECONDS: COHERENCE_TRIGGER_PARAMS.sustainedHoldMs / 1000,
  SUSTAINED_ATTACK_SECONDS: 4.0, // Faster fade-in (was 5.5)
  SUSTAINED_RELEASE_SECONDS: 5.0, // Faster fade-out (was 6.0)
  SUSTAINED_COHERENCE_COOLDOWN_SECONDS: 30.0, // Reduced cooldown (was 60s)
  // Fog effect constants (active mind sustain gating)
  ACTIVE_SUSTAIN_SECONDS: 3.0, // Must be non-coherent for this long before fog appears
  FOG_REVERB_WET: 0.15, // Reverb wet mix (0-1), subtle spatial effect
  FOG_ATTACK_SECONDS: 3.0, // Fog fade-in time
  FOG_RELEASE_SECONDS: 4.0, // Fog fade-out time
  FOG_REVERB_ROOM_SIZE: 0.8, // Reverb room size (0-1)
  FOG_REVERB_DAMPING: 0.3, // Reverb damping (0-1), higher = less reverb
  FOG_HIGHPASS_CUTOFF: 80, // High-pass filter cutoff for reverb return (Hz)
  // Session end fade-out
  SESSION_END_FADE_SECONDS: 4.0, // Master gain fade-out duration on session end
};

// Binaural beat presets (carrier frequencies transposed down a tritone)
// Original 200Hz -> ~141Hz (200 * 2^(-6/12))
const BINAURAL_BASE_FREQ = 200 * Math.pow(2, -6 / 12); // ~141.42 Hz (tritone down)

export const BINAURAL_PRESETS: Record<Exclude<BinauralPresetName, 'custom'>, BinauralPreset> = {
  delta: {
    name: 'delta',
    label: 'Delta',
    beatFrequency: 2,
    carrierFrequency: BINAURAL_BASE_FREQ,
    description: 'Deep Sleep (0.5-4 Hz)',
  },
  theta: {
    name: 'theta',
    label: 'Theta',
    beatFrequency: 6,
    carrierFrequency: BINAURAL_BASE_FREQ,
    description: 'Deep Meditation (4-8 Hz)',
  },
  alpha: {
    name: 'alpha',
    label: 'Alpha',
    beatFrequency: 10,
    carrierFrequency: BINAURAL_BASE_FREQ,
    description: 'Relaxed Focus (8-13 Hz)',
  },
  beta: {
    name: 'beta',
    label: 'Beta',
    beatFrequency: 20,
    carrierFrequency: BINAURAL_BASE_FREQ,
    description: 'Alert Focus (13-30 Hz)',
  },
};

export interface AudioEngineConfig {
  entrainmentType: EntrainmentType;
  entrainmentVolume: number;
  binauralCarrierFreq: number;
  binauralBeatFreq: number;
}

// Export types for use in hooks/components (re-export from state machine)
export type { CoherenceState } from './coherence-state-machine';

export interface CoherenceMetrics {
  totalCoherentSeconds: number; // Total time coherence audio was active (Part 2: based on gain activation)
  longestCoherentStreakSeconds: number;
  totalCoherenceAudioTimeMs: number; // PART 2: Total time coherence gain was active (ms)
}

const DEFAULT_CONFIG: AudioEngineConfig = {
  entrainmentType: 'none',
  entrainmentVolume: 0.3,
  binauralCarrierFreq: BINAURAL_BASE_FREQ, // Already transposed down a tritone
  binauralBeatFreq: 10,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // MP3 buffers
  private baselineBuffer: AudioBuffer | null = null;
  private coherenceBuffer: AudioBuffer | null = null;
  private shimmerBuffer: AudioBuffer | null = null;
  private sustainedCoherenceBuffer: AudioBuffer | null = null;
  
  // Movement cue buffers (3 alternating cues for gentle movement reminders)
  private movementCueBuffers: (AudioBuffer | null)[] = [null, null, null];

  // Buffer sources (always playing, synced)
  private baselineSource: AudioBufferSourceNode | null = null;
  private coherenceSource: AudioBufferSourceNode | null = null;
  private shimmerSource: AudioBufferSourceNode | null = null;
  private sustainedCoherenceSource: AudioBufferSourceNode | null = null;

  // Gain nodes for crossfade
  private baselineGain: GainNode | null = null;
  private coherenceGain: GainNode | null = null;
  private shimmerGain: GainNode | null = null;
  private sustainedCoherenceGain: GainNode | null = null;
  
  // Movement cue playback (cycling through 3 cues, polyphonic/stackable)
  private movementCueGain: GainNode | null = null;
  private movementCueIndex: number = 0; // Cycles 0 -> 1 -> 2 -> 0...
  private lastMovementCueTime: number = 0; // Timestamp of last cue start (anti-spam)
  private static readonly MOVEMENT_CUE_MIN_INTERVAL_MS = 150; // Minimum ms between cues (low to allow polyphonic overlap on quick shakes)

  // Shimmer limiter
  private shimmerLimiter: DynamicsCompressorNode | null = null;

  // Fog effect nodes (active mind effect - reverb-based)
  private fogReverbWetGain: GainNode | null = null; // Wet reverb signal gain
  private fogReverbDryGain: GainNode | null = null; // Dry signal gain
  private fogReverbHighpass: BiquadFilterNode | null = null; // High-pass filter for reverb return
  private fogReverbDelay1: DelayNode | null = null; // Reverb delay 1
  private fogReverbDelay2: DelayNode | null = null; // Reverb delay 2
  private fogReverbDelay3: DelayNode | null = null; // Reverb delay 3
  private fogReverbFeedbackGain: GainNode | null = null; // Reverb feedback gain
  private fogReverbMixGain: GainNode | null = null; // Controls wet/dry mix (0 = no fog, 1 = full fog)

  // Entrainment nodes (binaural only)
  private entrainmentGain: GainNode | null = null;
  private binauralLeft: OscillatorNode | null = null;
  private binauralRight: OscillatorNode | null = null;
  private binauralMerger: ChannelMergerNode | null = null;

  // Unified coherence state machine (single source of truth)
  private coherenceStateMachine: CoherenceStateMachine;
  
  // Streak tracking (for metrics only, not for state transitions)
  private currentCoherentStreakStart: number | null = null;

  // Metrics
  private metrics: CoherenceMetrics = {
    totalCoherentSeconds: 0,
    longestCoherentStreakSeconds: 0,
    totalCoherenceAudioTimeMs: 0, // PART 2: Audio-based time tracking
  };

  // Smooth coherence strength for adaptive shimmer
  private smoothedCoherenceStrength: number = 0;
  
  // Expressive modulation (calmScore and creativeFlowScore) - only used if feature flag enabled
  private smoothedCalmScore: number = 0;
  private smoothedCreativeFlowScore: number = 0;
  private expressiveModulationEQ: BiquadFilterNode | null = null; // EQ for warmth/clarity modulation
  
  // PPG (heart rate) modulation - only used if ENABLE_PPG_MODULATION is true
  private smoothedBPM: number | null = null; // Smoothed BPM for stable modulation
  private ppgBPMSmoothingAlpha = 0.05; // Heavy smoothing for BPM (very slow changes)
  private ppgModulationInterval: ReturnType<typeof setInterval> | null = null; // Interval for gentle modulation
  private ppgModulationLastLogTime: number = 0; // For throttled debug logging
  private ppgLowpassFilter: BiquadFilterNode | null = null; // Lowpass filter for PPG modulation
  private ppgBaseCutoff: number = 8000; // Base cutoff frequency (Hz) - will be modulated around this
  private currentCoherenceState: CoherenceState = 'baseline'; // Track current state for depth calculation
  
  // Shimmer tracking (based on direct coherence value)
  private shimmerEnabled: boolean = false; // Whether shimmer is currently enabled
  private shimmerLastTriggerTime: number | null = null; // When shimmer last triggered (for cooldown)
  private coherenceAboveShimmerSince: number | null = null; // When coherence first went above shimmer threshold
  
  // Sustained coherence tracking (with hysteresis)
  private sustainedCoherenceLastFadeOutTime: number | null = null; // When sustained layer last faded out (for cooldown)
  private sustainedCoherenceEnabled: boolean = false; // Whether sustained layer is currently enabled
  private sustainedExitStartTime: number | null = null; // When coherence first dropped below exit threshold (for hysteresis)
  private coherenceAboveSustainedSince: number | null = null; // When coherence first went above sustained threshold

  // Fog effect tracking (active mind sustain gating)
  private activeMindEnteredAt: number | null = null; // When non-coherent state started
  private fogEnabled: boolean = false; // Whether fog is currently active
  
  // Coherence time tracking (Part 2: track based on audio layer activation)
  private coherenceGainActiveStart: number | null = null; // When coherence gain became active
  private totalCoherenceAudioTime: number = 0; // Total time coherence audio was active (ms)

  private config: AudioEngineConfig;
  private isEntrainmentPlaying = false;
  private isAudioLoaded = false;
  private isSessionActive = false;
  private sourcesStarted = false; // Guard to prevent multiple starts
  private initPromise: Promise<void> | null = null; // Single-flight guard for init
  private isLoadingAudio = false; // Guard to prevent parallel audio loading

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize coherence state machine with default thresholds (will be updated based on difficulty)
    this.coherenceStateMachine = new CoherenceStateMachine({
      enterThreshold: 0.75,
      exitThreshold: 0.70,
      enterSustainSeconds: 1.8,
      exitSustainSeconds: 0.6,
      maxPacketGapMs: 1000,
      minContactQuality: 0.5,
      enableDebugLogging: true, // Enable for debugging
    });
    
    // Subscribe to state changes to trigger audio transitions
    this.coherenceStateMachine.onStateChange = (newState, oldState) => {
      this.handleCoherenceStateChange(newState, oldState);
    };
  }

  /**
   * Update coherence state machine config based on difficulty preset
   * Called when user changes difficulty setting in UI
   */
  setDifficultyPreset(coherenceSensitivity: number): void {
    // Determine difficulty level from sensitivity (0-1)
    // EASY: sensitivity < 0.33
    // MEDIUM/HARD: sensitivity >= 0.33 (use default values)
    const isEasy = coherenceSensitivity < 0.33;

    let config: Partial<CoherenceStateMachineConfig>;
    
    if (isEasy) {
      // EASY preset: easier to enter, harder to exit
      config = {
        enterThreshold: 0.68,
        exitThreshold: 0.63,
        enterSustainSeconds: 1.0,
        exitSustainSeconds: 1.0,
      };
      console.log('[AudioEngine] Difficulty preset: EASY', config);
    } else {
      // MEDIUM/HARD preset: default values (unchanged)
      config = {
        enterThreshold: 0.75,
        exitThreshold: 0.70,
        enterSustainSeconds: 1.8,
        exitSustainSeconds: 0.6,
      };
      const presetName = coherenceSensitivity < 0.67 ? 'MEDIUM' : 'HARD';
      console.log(`[AudioEngine] Difficulty preset: ${presetName}`, config);
    }

    // Update state machine config
    this.coherenceStateMachine.setConfig(config);
  }

  /**
   * Initialize audio context (must be called after user gesture)
   */
  async init(): Promise<void> {
    // Single-flight guard: if init is already in progress, wait for it
    if (this.initPromise) {
      console.warn('[AudioEngine] ⚠️ Init already in progress, waiting for existing init...');
      return this.initPromise;
    }

    // If already initialized, return immediately
    if (this.ctx && this.isAudioLoaded) {
      console.warn('[AudioEngine] ⚠️ Already initialized, skipping init');
      return;
    }

    console.warn('[AudioEngine] ===== INIT START =====');
    console.warn('[AudioEngine] Creating AudioContext...');

    // Create init promise for single-flight guard
    this.initPromise = (async () => {
      try {
        if (this.ctx) {
          console.warn('[AudioEngine] AudioContext already exists, reusing');
          return;
        }

        this.ctx = new AudioContext();
        console.warn('[AudioEngine] ✅ AudioContext created, state:', this.ctx.state);

        // Monitor audio context state changes (important for iOS)
        this.ctx.addEventListener('statechange', () => {
          console.warn('[AudioEngine] AudioContext state changed to:', this.ctx!.state);
        });

        if (this.ctx.state === 'suspended') {
          console.warn('[AudioEngine] AudioContext suspended, attempting resume...');
          await this.ctx.resume();
          console.warn('[AudioEngine] ✅ AudioContext resumed, state:', this.ctx.state);
        }

        // Create master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        
        // Create PPG lowpass filter for modulation (if feature enabled)
        if (ENABLE_PPG_MODULATION) {
          this.ppgLowpassFilter = this.ctx.createBiquadFilter();
          this.ppgLowpassFilter.type = 'lowpass';
          this.ppgLowpassFilter.frequency.value = this.ppgBaseCutoff; // Start at base cutoff
          this.ppgLowpassFilter.Q.value = 1.0; // Moderate Q for smooth response
          
          // Connect: masterGain -> ppgLowpassFilter -> destination
          this.masterGain.connect(this.ppgLowpassFilter);
          this.ppgLowpassFilter.connect(this.ctx.destination);
          console.warn('[AudioEngine] ✅ PPG lowpass filter created for modulation');
        } else {
          // Feature disabled - connect master gain directly to destination
          this.masterGain.connect(this.ctx.destination);
        }
        console.warn('[AudioEngine] ✅ Master gain created and connected');

        // Create entrainment gain
        this.entrainmentGain = this.ctx.createGain();
        this.entrainmentGain.gain.value = 0;
        this.entrainmentGain.connect(this.masterGain);
        console.warn('[AudioEngine] ✅ Entrainment gain created');

        // Load audio files (only if not already loaded)
        if (!this.isAudioLoaded || !this.baselineBuffer || !this.coherenceBuffer) {
          console.warn('[AudioEngine] Loading audio files...');
          await this.loadAudioFiles();
          console.warn('[AudioEngine] ✅ Audio files loaded');
        } else {
          console.warn('[AudioEngine] ⚠️ Audio buffers already loaded, skipping loadAudioFiles');
        }

        // Create gain nodes for crossfade (only if not already created)
        if (!this.baselineGain) {
          this.baselineGain = this.ctx.createGain();
          this.coherenceGain = this.ctx.createGain();
          this.shimmerGain = this.ctx.createGain();
          this.sustainedCoherenceGain = this.ctx.createGain();

          // Initialize gains
          this.baselineGain.gain.value = 0;
          this.coherenceGain.gain.value = 0;
          this.shimmerGain.gain.value = 0;
          this.sustainedCoherenceGain.gain.value = 0;

                  // Connect to master
                  this.baselineGain.connect(this.masterGain);
                  
                  // Create expressive modulation EQ if feature enabled (insert into coherence chain)
                  if (ENABLE_EXPRESSIVE_MODULATION) {
                    this.expressiveModulationEQ = this.ctx.createBiquadFilter();
                    this.expressiveModulationEQ.type = 'peaking'; // Parametric EQ
                    this.expressiveModulationEQ.frequency.value = 1000; // Center frequency
                    this.expressiveModulationEQ.Q.value = 1.0; // Moderate Q
                    this.expressiveModulationEQ.gain.value = 0; // Start neutral (no modulation)
                    
                    // Insert EQ into coherence chain: coherenceGain -> EQ -> masterGain
                    this.coherenceGain.connect(this.expressiveModulationEQ);
                    this.expressiveModulationEQ.connect(this.masterGain);
                    console.warn('[AudioEngine] ✅ Expressive modulation EQ created and inserted into coherence chain');
                  } else {
                    // Feature disabled - connect coherence gain directly to master
                    this.coherenceGain.connect(this.masterGain);
                  }
                  
                  this.sustainedCoherenceGain.connect(this.masterGain);
                  console.warn('[AudioEngine] ✅ Crossfade gain nodes created');
                } else {
                  console.warn('[AudioEngine] ⚠️ Gain nodes already exist, skipping creation');
                }

        // Create shimmer limiter (only if not already created)
        if (!this.shimmerLimiter && this.shimmerGain && this.masterGain) {
          this.shimmerLimiter = this.ctx.createDynamicsCompressor();
          this.shimmerLimiter.threshold.value = -6;
          this.shimmerLimiter.knee.value = 0;
          this.shimmerLimiter.ratio.value = 20;
          this.shimmerLimiter.attack.value = 0.001;
          this.shimmerLimiter.release.value = 0.1;

          // Shimmer chain: gain -> limiter -> master
          this.shimmerGain.connect(this.shimmerLimiter);
          this.shimmerLimiter.connect(this.masterGain);
          console.warn('[AudioEngine] ✅ Shimmer limiter created');
        }

        // Create movement cue gain node (only if not already created)
        if (!this.movementCueGain && this.masterGain) {
          this.movementCueGain = this.ctx.createGain();
          this.movementCueGain.gain.value = 0.5; // Subtle volume for cues
          this.movementCueGain.connect(this.masterGain);
          console.warn('[AudioEngine] ✅ Movement cue gain node created');
        }

        // Create fog effect nodes (reverb-based spatial effect) - only if not already created
        if (!this.fogReverbDelay1) {
          console.warn('[AudioEngine] Creating fog effect nodes...');
          // Reverb implementation using multiple delays with feedback
          
          // Create delay nodes for reverb (different delay times for spatial effect)
          this.fogReverbDelay1 = this.ctx.createDelay(1.0);
          this.fogReverbDelay1.delayTime.value = 0.03; // 30ms delay
          
          this.fogReverbDelay2 = this.ctx.createDelay(1.0);
          this.fogReverbDelay2.delayTime.value = 0.05; // 50ms delay
          
          this.fogReverbDelay3 = this.ctx.createDelay(1.0);
          this.fogReverbDelay3.delayTime.value = 0.07; // 70ms delay
          
          // Feedback gain for reverb tail
          this.fogReverbFeedbackGain = this.ctx.createGain();
          this.fogReverbFeedbackGain.gain.value = CROSSFADE_CONSTANTS.FOG_REVERB_ROOM_SIZE * 0.3; // Subtle feedback
          
          // High-pass filter for reverb return (keep low end clean)
          this.fogReverbHighpass = this.ctx.createBiquadFilter();
          this.fogReverbHighpass.type = 'highpass';
          this.fogReverbHighpass.frequency.value = CROSSFADE_CONSTANTS.FOG_HIGHPASS_CUTOFF;
          this.fogReverbHighpass.Q.value = 1.0;
          
          // Wet reverb signal gain
          this.fogReverbWetGain = this.ctx.createGain();
          this.fogReverbWetGain.gain.value = 0; // Start at 0 (no fog)
          
          // Dry signal gain (always 1.0, dry signal stays present)
          this.fogReverbDryGain = this.ctx.createGain();
          this.fogReverbDryGain.gain.value = 1.0;
          
          // Mix gain controls overall fog intensity (0 = no fog, 1 = full fog)
          this.fogReverbMixGain = this.ctx.createGain();
          this.fogReverbMixGain.gain.value = 0; // Start at 0 (no fog)
          
          // Build reverb network:
          // masterGain -> split to dry and reverb
          // Dry: masterGain -> fogReverbDryGain -> destination
          // Reverb: masterGain -> fogReverbMixGain -> delays -> feedback -> highpass -> fogReverbWetGain -> destination
          
          // Disconnect masterGain from destination
          if (this.masterGain) {
            this.masterGain.disconnect();
            
            // Dry signal path (always present)
            this.masterGain.connect(this.fogReverbDryGain);
            this.fogReverbDryGain.connect(this.ctx.destination);
            
            // Reverb signal path (fog effect)
            this.masterGain.connect(this.fogReverbMixGain);
            this.fogReverbMixGain.connect(this.fogReverbDelay1);
            this.fogReverbMixGain.connect(this.fogReverbDelay2);
            this.fogReverbMixGain.connect(this.fogReverbDelay3);
          }
          
          // Connect delays to feedback and highpass
          this.fogReverbDelay1.connect(this.fogReverbFeedbackGain);
          this.fogReverbDelay2.connect(this.fogReverbFeedbackGain);
          this.fogReverbDelay3.connect(this.fogReverbFeedbackGain);
          
          // Feedback loop (subtle)
          this.fogReverbFeedbackGain.connect(this.fogReverbDelay1);
          this.fogReverbFeedbackGain.connect(this.fogReverbDelay2);
          this.fogReverbFeedbackGain.connect(this.fogReverbDelay3);
          
          // Reverb output through highpass filter
          this.fogReverbDelay1.connect(this.fogReverbHighpass);
          this.fogReverbDelay2.connect(this.fogReverbHighpass);
          this.fogReverbDelay3.connect(this.fogReverbHighpass);
          
          // Highpass -> wet gain -> destination
          this.fogReverbHighpass.connect(this.fogReverbWetGain);
          this.fogReverbWetGain.connect(this.ctx.destination);
          console.warn('[AudioEngine] ✅ Fog effect nodes created');
        } else {
          console.warn('[AudioEngine] ⚠️ Fog effect nodes already exist, skipping creation');
        }

        this.isAudioLoaded = true;
        console.warn('[AudioEngine] ✅ ===== INIT COMPLETE =====');
      } catch (error) {
        console.error('[AudioEngine] ❌ ===== INIT FAILED =====');
        console.error('[AudioEngine] Error:', error);
        if (error instanceof Error) {
          console.error('[AudioEngine] Error message:', error.message);
          console.error('[AudioEngine] Error stack:', error.stack);
        }
        // Clear init promise on error so it can be retried
        this.initPromise = null;
        throw error;
      } finally {
        // Clear init promise after completion (success or failure)
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Load all audio buffer files needed for session audio.
   * All 7 files are fetched + decoded in parallel for fast startup (~1s vs ~5s sequential).
   * Each file is independent — a single failure won't block the others.
   */
  private async loadAudioFiles(): Promise<void> {
    if (!this.ctx) throw new Error('AudioContext not initialized');

    // Single-flight guard: if already loading, wait for existing load
    if (this.isLoadingAudio) {
      console.warn('[AudioEngine] ⚠️ Audio loading already in progress, waiting...');
      while (this.isLoadingAudio) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    // Check if all buffers are already loaded
    if (this.baselineBuffer && this.coherenceBuffer && this.shimmerBuffer && this.sustainedCoherenceBuffer) {
      console.warn('[AudioEngine] ⚠️ Audio buffers already loaded, skipping loadAudioFiles');
      return;
    }

    this.isLoadingAudio = true;
    const t0 = performance.now();
    console.warn('[AudioEngine] ===== LOAD AUDIO FILES START (parallel) =====');

    /** Helper: fetch + decode a single audio file. Returns null on any failure. */
    const loadOne = async (path: string, label: string): Promise<AudioBuffer | null> => {
      try {
        const resp = await fetch(path);
        if (!resp.ok) {
          console.warn(`[AudioEngine] ⚠️ ${label} fetch failed: ${resp.status}`);
          return null;
        }
        const buf = await this.ctx!.decodeAudioData(await resp.arrayBuffer());
        console.warn(`[AudioEngine] ✅ ${label} loaded (${buf.duration.toFixed(1)}s)`);
        return buf;
      } catch (err) {
        console.warn(`[AudioEngine] ⚠️ ${label} error:`, err);
        return null;
      }
    };

    /** Shimmer has mp3 → wav fallback */
    const loadShimmer = async (): Promise<AudioBuffer | null> => {
      const mp3 = await loadOne('/audio/shimmer.mp3', 'shimmer.mp3');
      if (mp3) return mp3;
      return loadOne('/audio/shimmer.wav', 'shimmer.wav');
    };

    try {
      // Fire ALL fetches in parallel — each is independent, no memory issues on modern devices
      const [baseline, coherence, shimmer, sustained, cue1, cue2, cue3] =
        await Promise.all([
          this.baselineBuffer             ? Promise.resolve(this.baselineBuffer)             : loadOne('/audio/baseline.mp3', 'baseline'),
          this.coherenceBuffer            ? Promise.resolve(this.coherenceBuffer)            : loadOne('/audio/coherence-v3.mp3', 'coherence'),
          this.shimmerBuffer              ? Promise.resolve(this.shimmerBuffer)              : loadShimmer(),
          this.sustainedCoherenceBuffer   ? Promise.resolve(this.sustainedCoherenceBuffer)   : loadOne('/audio/sustained-coherence.mp3', 'sustained-coherence'),
          this.movementCueBuffers[0]      ? Promise.resolve(this.movementCueBuffers[0])      : loadOne('/audio/movement-cue-1.mp3', 'movement-cue-1'),
          this.movementCueBuffers[1]      ? Promise.resolve(this.movementCueBuffers[1])      : loadOne('/audio/movement-cue-2.mp3', 'movement-cue-2'),
          this.movementCueBuffers[2]      ? Promise.resolve(this.movementCueBuffers[2])      : loadOne('/audio/movement-cue-3.mp3', 'movement-cue-3'),
        ]);

      // Assign results (null = that file failed, non-critical)
      if (baseline)  this.baselineBuffer = baseline;
      if (coherence) this.coherenceBuffer = coherence;
      if (shimmer)   this.shimmerBuffer = shimmer;
      if (sustained) this.sustainedCoherenceBuffer = sustained;
      if (cue1) this.movementCueBuffers[0] = cue1;
      if (cue2) this.movementCueBuffers[1] = cue2;
      if (cue3) this.movementCueBuffers[2] = cue3;

      const elapsed = (performance.now() - t0).toFixed(0);
      console.warn(`[AudioEngine] ✅ ===== LOAD AUDIO FILES COMPLETE (${elapsed}ms) =====`, {
        baseline: !!this.baselineBuffer,
        coherence: !!this.coherenceBuffer,
        shimmer: !!this.shimmerBuffer,
        sustainedCoherence: !!this.sustainedCoherenceBuffer,
        movementCues: this.movementCueBuffers.map(b => !!b),
      });
    } catch (error) {
      console.error('[AudioEngine] ❌ ===== LOAD AUDIO FILES FAILED =====', error);
      console.warn('[AudioEngine] ⚠️ Continuing with partial audio load (some buffers may be missing)');
    } finally {
      this.isLoadingAudio = false;
    }
  }

  /**
   * Start session audio (baseline fade-in)
   */
  async startSession(): Promise<void> {
    console.warn('[AudioEngine] ===== START SESSION CALLED =====');
    
    // Ensure initialized (with single-flight guard)
    if (!this.ctx || !this.isAudioLoaded) {
      console.warn('[AudioEngine] Not initialized, calling init()...');
      await this.init();
      console.warn('[AudioEngine] ✅ Init complete, continuing startSession');
    }

    if (this.isSessionActive) {
      console.warn('[AudioEngine] ⚠️ Session already active, skipping startSession');
      return;
    }

    // Ensure audio context is running (critical for iOS)
    const ctx = this.ctx!;
    console.warn('[AudioEngine] AudioContext state:', ctx.state);
    
    if (ctx.state === 'suspended') {
      console.warn('[AudioEngine] ⚠️ Audio context is suspended, attempting to resume...');
      try {
        await ctx.resume();
        console.warn('[AudioEngine] ✅ Audio context resumed successfully, state:', ctx.state);
      } catch (error) {
        console.error('[AudioEngine] ❌ Failed to resume audio context:', error);
        // Don't throw - allow graceful degradation
        console.warn('[AudioEngine] ⚠️ Continuing despite suspend state (may not play audio)');
      }
    }

    // Double-check state after resume attempt
    const currentState = ctx.state;
    if (currentState !== 'running') {
      console.warn('[AudioEngine] ⚠️ Audio context is not running. Current state:', currentState);
      // Try one more time
      try {
        await ctx.resume();
        const newState = ctx.state;
        console.warn('[AudioEngine] After second resume attempt, state:', newState);
        if (newState !== 'running') {
          console.warn('[AudioEngine] ⚠️ Audio context still not running, but continuing (state:', newState, ')');
          // Don't throw - allow graceful degradation
        }
      } catch (error) {
        console.error('[AudioEngine] ❌ Audio context failed to start:', error);
        // Don't throw - allow graceful degradation
        console.warn('[AudioEngine] ⚠️ Continuing despite audio context error');
      }
    }

    console.warn('[AudioEngine] ✅ Audio context confirmed, state:', ctx.state);

    // Guard: prevent multiple starts
    if (this.sourcesStarted) {
      console.warn('[AudioEngine] ⚠️ Sources already started, skipping');
      return;
    }

    // Validate buffers are loaded (graceful degradation - don't throw)
    if (!this.baselineBuffer) {
      console.error('[AudioEngine] ❌ Baseline buffer not loaded');
      // Don't throw - allow graceful degradation
      console.warn('[AudioEngine] ⚠️ Continuing without baseline audio');
    }
    if (!this.coherenceBuffer) {
      console.error('[AudioEngine] ❌ Coherence buffer not loaded');
      // Don't throw - allow graceful degradation
      console.warn('[AudioEngine] ⚠️ Continuing without coherence audio');
    }
    if (!this.shimmerBuffer) {
      console.warn('[AudioEngine] ⚠️ Shimmer buffer not loaded (will skip shimmer)');
    }
    if (!this.sustainedCoherenceBuffer) {
      console.error('[AudioEngine] ❌ Sustained coherence buffer not loaded');
      // Don't throw - allow graceful degradation
      console.warn('[AudioEngine] ⚠️ Continuing without sustained coherence audio');
    }

    // If critical buffers are missing, don't start sources
    if (!this.baselineBuffer || !this.coherenceBuffer) {
      console.error('[AudioEngine] ❌ Critical buffers missing, cannot start session');
      // Don't throw - just return gracefully
      return;
    }

    // Reset metrics
    this.metrics = {
      totalCoherentSeconds: 0,
      longestCoherentStreakSeconds: 0,
      totalCoherenceAudioTimeMs: 0, // PART 2: Audio-based time tracking
    };
    
    // Reset coherence time tracking
    this.totalCoherenceAudioTime = 0;
    this.coherenceGainActiveStart = null;
    
    // Reset PPG modulation state
    this.currentCoherenceState = 'baseline';
    
    // Reset movement cue cycle (start fresh each session)
    this.resetMovementCueIndex();
    
    // Reset state machine
    this.coherenceStateMachine.reset();
    this.currentCoherentStreakStart = null;
    // Reset shimmer tracking
    this.shimmerEnabled = false;
    this.shimmerLastTriggerTime = null;
    this.coherenceAboveShimmerSince = null;
    // Reset sustained coherence tracking
    this.sustainedCoherenceLastFadeOutTime = null;
    this.sustainedCoherenceEnabled = false;
    this.sustainedExitStartTime = null;
    this.coherenceAboveSustainedSince = null;
    // Reset fog tracking
    this.activeMindEnteredAt = null;
    this.fogEnabled = false;

    // CRITICAL: Capture start time AFTER all async operations and with iOS-safe offset
    // Use small offset (0.1s) to avoid iOS start glitches and ensure context is fully ready
    const currentTime = this.ctx!.currentTime;
    const startOffset = 0.1; // 100ms offset for iOS compatibility
    const t0 = currentTime + startOffset;

    console.log('[AudioEngine] Sample-sync timing:', {
      currentTime,
      startOffset,
      t0,
      contextState: ctx.state,
      note: 'Both baseline and coherence will start at t0 for perfect sync',
    });

    // Create and configure baseline source (looped, playbackRate = 1)
    if (this.baselineBuffer && this.baselineGain) {
      this.baselineSource = this.ctx!.createBufferSource();
      this.baselineSource.buffer = this.baselineBuffer;
      this.baselineSource.loop = true;
      this.baselineSource.playbackRate.value = 1.0; // Explicitly set to 1 for sync
      this.baselineSource.connect(this.baselineGain);
      console.log('[AudioEngine] Created baseline source', {
        loop: true,
        playbackRate: this.baselineSource.playbackRate.value,
        bufferDuration: this.baselineBuffer.duration,
      });
    } else {
      console.error('[AudioEngine] Missing baseline buffer or gain node');
      throw new Error('Cannot create baseline source');
    }

    // Create and configure coherence source (looped, playbackRate = 1)
    if (this.coherenceBuffer && this.coherenceGain) {
      this.coherenceSource = this.ctx!.createBufferSource();
      this.coherenceSource.buffer = this.coherenceBuffer;
      this.coherenceSource.loop = true;
      this.coherenceSource.playbackRate.value = 1.0; // Explicitly set to 1 for sync
      this.coherenceSource.connect(this.coherenceGain);
      console.log('[AudioEngine] Created coherence source', {
        loop: true,
        playbackRate: this.coherenceSource.playbackRate.value,
        bufferDuration: this.coherenceBuffer.duration,
      });
    } else {
      console.error('[AudioEngine] Missing coherence buffer or gain node');
      throw new Error('Cannot create coherence source');
    }

    // CRITICAL: Start both sources atomically with the SAME t0 reference
    // This ensures perfect sample-level sync - both tracks start at exact same AudioContext time
    this.baselineSource.start(t0);
    this.coherenceSource.start(t0);
    this.sourcesStarted = true;

    console.log('[AudioEngine] ✓✓✓ BOTH SOURCES STARTED AT SAME TIME t0 =', t0, '✓✓✓', {
      baselineStarted: true,
      coherenceStarted: true,
      syncTime: t0,
      timeDifference: 0,
      note: 'Perfect sample-sync achieved - both tracks running simultaneously',
    });

    // Create and start shimmer source (looped, muted) - also at t0 for sync
    if (this.shimmerBuffer && this.shimmerGain) {
      this.shimmerSource = this.ctx!.createBufferSource();
      this.shimmerSource.buffer = this.shimmerBuffer;
      this.shimmerSource.loop = true;
      this.shimmerSource.playbackRate.value = 1.0;
      this.shimmerSource.connect(this.shimmerGain);
      this.shimmerSource.start(t0); // Start at same time for sync
      console.log('[AudioEngine] Started shimmer source at t0 =', t0);
    } else {
      console.warn('[AudioEngine] Skipping shimmer source (buffer not loaded)');
    }

    // Create and start sustained coherence source (looped, muted) - also at t0 for sync
    if (this.sustainedCoherenceBuffer && this.sustainedCoherenceGain) {
      this.sustainedCoherenceSource = this.ctx!.createBufferSource();
      this.sustainedCoherenceSource.buffer = this.sustainedCoherenceBuffer;
      this.sustainedCoherenceSource.loop = true;
      this.sustainedCoherenceSource.playbackRate.value = 1.0;
      this.sustainedCoherenceSource.connect(this.sustainedCoherenceGain);
      this.sustainedCoherenceSource.start(t0); // Start at same time for sync
      console.log('[AudioEngine] Started sustained coherence source at t0 =', t0);
    } else {
      console.warn('[AudioEngine] Skipping sustained coherence source (buffer not loaded)');
    }

    // Fade in baseline (session start) - use t0 for scheduling
    if (this.baselineGain) {
      // Set initial gain to 0 immediately
      this.baselineGain.gain.cancelScheduledValues(t0);
      this.baselineGain.gain.setValueAtTime(0, t0);
      // Ramp to full volume over fade duration
      this.baselineGain.gain.linearRampToValueAtTime(
        1.0,
        t0 + CROSSFADE_CONSTANTS.START_FADE_SECONDS
      );
      console.log(`[AudioEngine] Baseline gain fading in over ${CROSSFADE_CONSTANTS.START_FADE_SECONDS}s`, {
        startTime: t0,
        initialGain: 0,
        targetGain: 1.0,
        fadeDuration: CROSSFADE_CONSTANTS.START_FADE_SECONDS,
      });
    }

    this.isSessionActive = true;
    
    // Verify everything is set up correctly
    const verification = {
      contextState: this.ctx!.state,
      baselineSource: !!this.baselineSource,
      coherenceSource: !!this.coherenceSource,
      shimmerSource: !!this.shimmerSource,
      sustainedCoherenceSource: !!this.sustainedCoherenceSource,
      baselineGain: this.baselineGain?.gain.value,
      coherenceGain: this.coherenceGain?.gain.value,
      shimmerGain: this.shimmerGain?.gain.value,
      sustainedCoherenceGain: this.sustainedCoherenceGain?.gain.value,
      masterGain: this.masterGain?.gain.value,
    };
    
    console.log('[AudioEngine] Session started with baseline fade-in', verification);
    
    // Check if we can actually hear audio by checking gain chain
    if (verification.baselineGain === 0 && verification.masterGain === 1 && verification.contextState === 'running') {
      console.log('[AudioEngine] ✓ Audio chain is correctly configured - baseline should be audible after fade-in');
    } else {
      console.warn('[AudioEngine] ⚠ Potential audio configuration issue detected:', verification);
    }
  }

  /**
   * End session audio with smooth fade-out
   */
  stopSession(): void {
    if (!this.ctx || !this.isSessionActive) return;

    const now = this.ctx.currentTime;
    const fadeTime = CROSSFADE_CONSTANTS.SESSION_END_FADE_SECONDS;

    console.log('[AudioEngine] Starting smooth session end fade-out', { fadeTime });

    // Fade out fog first if active (before master fade)
    if (this.fogReverbMixGain && this.fogEnabled) {
      this.fadeOutFog(now);
    }

    // Global fade-out using masterGain (smooth and clean)
    if (this.masterGain) {
      const currentGain = this.masterGain.gain.value;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(currentGain, now);
      this.masterGain.gain.linearRampToValueAtTime(0.001, now + fadeTime);
    }

    // Stop sources after fade completes
    setTimeout(() => {
      try {
        this.baselineSource?.stop();
        this.coherenceSource?.stop();
        this.shimmerSource?.stop();
        this.sustainedCoherenceSource?.stop();
      } catch {
        // Ignore if already stopped
      }
      this.baselineSource = null;
      this.coherenceSource = null;
      this.shimmerSource = null;
      this.sustainedCoherenceSource = null;
      this.sourcesStarted = false; // Reset guard for next session
      
      // Reset master gain to 1.0 for next session
      if (this.masterGain) {
        this.masterGain.gain.cancelScheduledValues(this.ctx!.currentTime);
        this.masterGain.gain.setValueAtTime(1.0, this.ctx!.currentTime);
      }
    }, (fadeTime + 0.1) * 1000);

    this.isSessionActive = false;
    
    // Reset state machine
    this.coherenceStateMachine.reset();
    this.currentCoherentStreakStart = null;
    this.sourcesStarted = false; // Reset guard
    // Reset fog tracking
    this.activeMindEnteredAt = null;
    this.fogEnabled = false;
    // Reset shimmer tracking
    this.shimmerEnabled = false;
    this.shimmerLastTriggerTime = null;
    this.coherenceAboveShimmerSince = null;
    // Reset sustained coherence tracking
    this.sustainedCoherenceLastFadeOutTime = null;
    this.sustainedCoherenceEnabled = false;
    this.sustainedExitStartTime = null;
    this.coherenceAboveSustainedSince = null;
    // PART 2: Finalize coherence audio time tracking
    if (this.coherenceGainActiveStart !== null) {
      const finalDuration = Date.now() - this.coherenceGainActiveStart;
      this.totalCoherenceAudioTime += finalDuration;
      console.log('[AudioEngine] Finalized coherence time on stop:', {
        finalDuration,
        finalDurationSeconds: (finalDuration / 1000).toFixed(2),
        totalCoherenceTimeMs: this.totalCoherenceAudioTime,
        totalCoherenceTimeSeconds: (this.totalCoherenceAudioTime / 1000).toFixed(2),
      });
      this.coherenceGainActiveStart = null;
    }

    // Reset sources started flag for next session
    this.sourcesStarted = false;
    
    // Stop any playing movement cue
    this.resetMovementCueIndex();

    // Stop PPG modulation interval if running
    if (ENABLE_PPG_MODULATION && this.ppgModulationInterval) {
      clearInterval(this.ppgModulationInterval);
      this.ppgModulationInterval = null;
      this.smoothedBPM = null;
      
      // Reset lowpass filter to base cutoff
      if (this.ppgLowpassFilter && this.ctx) {
        const now = this.ctx.currentTime;
        const currentCutoff = this.ppgLowpassFilter.frequency.value;
        this.ppgLowpassFilter.frequency.cancelScheduledValues(now);
        this.ppgLowpassFilter.frequency.setValueAtTime(currentCutoff, now);
        this.ppgLowpassFilter.frequency.linearRampToValueAtTime(this.ppgBaseCutoff, now + 0.5);
      }
    }

    console.warn('[AudioEngine] ✅ Session stopped with smooth fade-out');
  }

  /**
   * Update coherence value (called from coherence detection)
   * Now uses unified state machine with signal quality gating
   * 
   * @param expressiveScores Optional calmScore and creativeFlowScore for expressive modulation
   *                         Only used if ENABLE_EXPRESSIVE_MODULATION is true
   * @param ppg Optional PPG (heart rate) metrics for subtle BPM-based modulation
   *            Only used if ENABLE_PPG_MODULATION is true
   */
  updateCoherence(
    coherence: number,
    signalQuality: SignalQuality,
    expressiveScores?: { calmScore: number; creativeFlowScore: number },
    ppg?: { bpm: number | null; confidence: number; lastBeatMs: number | null }
  ): void {
    if (!this.ctx || !this.isSessionActive) {
      // Log why we're not updating (for debugging)
      if (!this.ctx) console.warn('[AudioEngine] updateCoherence called but ctx is null');
      if (!this.isSessionActive) console.warn('[AudioEngine] updateCoherence called but session is not active');
      return;
    }

    const now = this.ctx.currentTime;
    const currentTime = Date.now();

    // Update unified state machine (handles all state transitions)
    const newState = this.coherenceStateMachine.update(coherence, signalQuality, currentTime);
    
    // Update expressive modulation scores (if feature enabled and scores provided)
    if (ENABLE_EXPRESSIVE_MODULATION && expressiveScores) {
      // Smooth the scores (gentle, slow changes - no abrupt transitions)
      const smoothingAlpha = 0.05; // Very slow smoothing (~20 updates to reach target)
      this.smoothedCalmScore = this.smoothedCalmScore * (1 - smoothingAlpha) + expressiveScores.calmScore * smoothingAlpha;
      this.smoothedCreativeFlowScore = this.smoothedCreativeFlowScore * (1 - smoothingAlpha) + expressiveScores.creativeFlowScore * smoothingAlpha;
    } else {
      // Feature disabled or no scores provided - reset to neutral
      this.smoothedCalmScore = 0;
      this.smoothedCreativeFlowScore = 0;
    }
    
    // ============================================
    // SHIMMER TRIGGER LOGIC (based on direct coherence value, not state machine)
    // ============================================
    const shimmerParams = COHERENCE_TRIGGER_PARAMS;
    const coherencePercent = coherence; // Already 0-1
    
    // Check if coherence is above shimmer trigger threshold
    if (coherencePercent >= shimmerParams.shimmerTriggerThreshold) {
      // Track when we first went above threshold
      if (this.coherenceAboveShimmerSince === null) {
        this.coherenceAboveShimmerSince = currentTime;
        if (DEBUG_COHERENCE_EVENTS) {
          console.log(`[AudioEngine] ✨ Coherence above shimmer threshold (${(coherencePercent * 100).toFixed(1)}% >= ${(shimmerParams.shimmerTriggerThreshold * 100).toFixed(0)}%)`);
        }
      }
      
      // Check hold time and cooldown
      const aboveThresholdMs = currentTime - this.coherenceAboveShimmerSince;
      const cooldownOk = this.shimmerLastTriggerTime === null || 
        (currentTime - this.shimmerLastTriggerTime) >= shimmerParams.shimmerCooldownMs;
      
      if (aboveThresholdMs >= shimmerParams.shimmerHoldMs && cooldownOk && !this.shimmerEnabled) {
        // Enable shimmer!
        this.shimmerEnabled = true;
        this.shimmerLastTriggerTime = currentTime;
        console.log(`[AudioEngine] ✨ SHIMMER TRIGGERED after ${(aboveThresholdMs / 1000).toFixed(1)}s above threshold (coherence: ${(coherencePercent * 100).toFixed(1)}%)`);
        // Initial shimmer fade-in (use longer fade time for smooth entry)
        this.fadeInShimmer(now);
      } else if (this.shimmerEnabled) {
        // Update shimmer gain while enabled (adaptive to coherence strength)
        this.updateShimmerGain(now);
      }
      
      // Log progress toward shimmer (throttled)
      if (DEBUG_COHERENCE_EVENTS && !this.shimmerEnabled && aboveThresholdMs > 0) {
        const progressPercent = Math.min(100, (aboveThresholdMs / shimmerParams.shimmerHoldMs) * 100);
        const logInterval = 1000; // Log every 1s
        if (aboveThresholdMs % logInterval < 100) {
          console.log(`[AudioEngine] ✨ Shimmer progress: ${progressPercent.toFixed(0)}% (${(aboveThresholdMs / 1000).toFixed(1)}s / ${(shimmerParams.shimmerHoldMs / 1000).toFixed(0)}s)`, 
            cooldownOk ? '' : `[cooldown: ${((shimmerParams.shimmerCooldownMs - (currentTime - (this.shimmerLastTriggerTime || 0))) / 1000).toFixed(0)}s remaining]`);
        }
      }
    } else {
      // Coherence dropped below shimmer threshold
      if (this.coherenceAboveShimmerSince !== null) {
        if (DEBUG_COHERENCE_EVENTS) {
          console.log(`[AudioEngine] ✨ Coherence dropped below shimmer threshold (${(coherencePercent * 100).toFixed(1)}% < ${(shimmerParams.shimmerTriggerThreshold * 100).toFixed(0)}%)`);
        }
        this.coherenceAboveShimmerSince = null;
      }
      
      // Fade out shimmer if enabled
      if (this.shimmerEnabled) {
        this.shimmerEnabled = false;
        console.log('[AudioEngine] ✨ Shimmer fading out (coherence dropped below threshold)');
        // Explicitly fade out shimmer (don't rely on state machine)
        if (this.shimmerGain && this.ctx) {
          const shimmerNow = this.ctx.currentTime;
          const currentShimmerGain = Math.max(0.001, this.shimmerGain.gain.value);
          this.shimmerGain.gain.cancelScheduledValues(shimmerNow);
          this.shimmerGain.gain.setValueAtTime(currentShimmerGain, shimmerNow);
          this.shimmerGain.gain.linearRampToValueAtTime(
            0.001,
            shimmerNow + CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_SECONDS
          );
        }
      }
    }
    
    // Calculate coherence strength for adaptive shimmer gain
    const strength = Math.max(0, Math.min(1, (coherencePercent - shimmerParams.shimmerTriggerThreshold) / (1 - shimmerParams.shimmerTriggerThreshold)));
    this.smoothedCoherenceStrength = this.smoothedCoherenceStrength * 0.9 + strength * 0.1;
    
    // ============================================
    // SUSTAINED LAYER LOGIC (with hysteresis to prevent flickering)
    // ============================================
    
    // Check if coherence is above sustained threshold
    if (coherencePercent >= shimmerParams.sustainedThreshold) {
      // Track when we first went above threshold
      if (this.coherenceAboveSustainedSince === null) {
        this.coherenceAboveSustainedSince = currentTime;
        if (DEBUG_COHERENCE_EVENTS) {
          console.log(`[AudioEngine] 🎯 Coherence above sustained threshold (${(coherencePercent * 100).toFixed(1)}% >= ${(shimmerParams.sustainedThreshold * 100).toFixed(0)}%)`);
        }
      }
      
      // Reset exit timer since we're above threshold
      this.sustainedExitStartTime = null;
      
      // Check hold time and cooldown
      const aboveThresholdMs = currentTime - this.coherenceAboveSustainedSince;
      const cooldownOk = this.sustainedCoherenceLastFadeOutTime === null || 
        (currentTime - this.sustainedCoherenceLastFadeOutTime) >= CROSSFADE_CONSTANTS.SUSTAINED_COHERENCE_COOLDOWN_SECONDS * 1000;
      
      if (aboveThresholdMs >= shimmerParams.sustainedHoldMs && cooldownOk && !this.sustainedCoherenceEnabled) {
        // Enable sustained layer!
        this.sustainedCoherenceEnabled = true;
        console.log(`[AudioEngine] 🎯 SUSTAINED LAYER ACTIVATED after ${(aboveThresholdMs / 1000).toFixed(1)}s above threshold (coherence: ${(coherencePercent * 100).toFixed(1)}%)`);
        this.fadeInSustainedCoherence(now);
      }
      
      // Log progress toward sustained (throttled)
      if (DEBUG_COHERENCE_EVENTS && !this.sustainedCoherenceEnabled && aboveThresholdMs > 0) {
        const progressPercent = Math.min(100, (aboveThresholdMs / shimmerParams.sustainedHoldMs) * 100);
        const logInterval = 2000; // Log every 2s
        if (aboveThresholdMs % logInterval < 100) {
          console.log(`[AudioEngine] 🎯 Sustained progress: ${progressPercent.toFixed(0)}% (${(aboveThresholdMs / 1000).toFixed(1)}s / ${(shimmerParams.sustainedHoldMs / 1000).toFixed(0)}s)`,
            cooldownOk ? '' : `[cooldown: ${(CROSSFADE_CONSTANTS.SUSTAINED_COHERENCE_COOLDOWN_SECONDS - ((currentTime - (this.sustainedCoherenceLastFadeOutTime || 0)) / 1000)).toFixed(0)}s remaining]`);
        }
      }
    } else if (coherencePercent < shimmerParams.sustainedExitThreshold) {
      // Coherence dropped below exit threshold (hysteresis)
      if (this.sustainedCoherenceEnabled) {
        // Start tracking time below exit threshold (hysteresis)
        if (this.sustainedExitStartTime === null) {
          this.sustainedExitStartTime = currentTime;
          if (DEBUG_COHERENCE_EVENTS) {
            console.log(`[AudioEngine] 🎯 Coherence below exit threshold (${(coherencePercent * 100).toFixed(1)}% < ${(shimmerParams.sustainedExitThreshold * 100).toFixed(0)}%), starting hysteresis timer`);
          }
        }
        
        // Check if we've been below exit threshold long enough (hysteresis)
        const belowExitMs = currentTime - this.sustainedExitStartTime;
        if (belowExitMs >= shimmerParams.sustainedExitHoldMs) {
          // Disable sustained layer (hysteresis complete)
          this.sustainedCoherenceEnabled = false;
          this.sustainedCoherenceLastFadeOutTime = currentTime;
          this.coherenceAboveSustainedSince = null;
          this.sustainedExitStartTime = null;
          console.log(`[AudioEngine] 🎯 SUSTAINED LAYER DEACTIVATED after ${(belowExitMs / 1000).toFixed(1)}s below exit threshold`);
          this.fadeOutSustainedCoherence(now);
        } else if (DEBUG_COHERENCE_EVENTS && belowExitMs > 0) {
          // Log hysteresis progress
          const exitProgress = (belowExitMs / shimmerParams.sustainedExitHoldMs * 100).toFixed(0);
          if (belowExitMs % 1000 < 100) {
            console.log(`[AudioEngine] 🎯 Sustained exit hysteresis: ${exitProgress}% (${(belowExitMs / 1000).toFixed(1)}s / ${(shimmerParams.sustainedExitHoldMs / 1000).toFixed(0)}s)`);
          }
        }
      } else {
        // Not enabled - just reset above threshold timer
        this.coherenceAboveSustainedSince = null;
      }
    } else {
      // Coherence is between exit and entry thresholds - maintain current state
      // Reset exit timer if above exit threshold but below entry threshold
      if (coherencePercent >= shimmerParams.sustainedExitThreshold) {
        this.sustainedExitStartTime = null;
      }
      // Also reset above-threshold timer if below entry threshold
      if (coherencePercent < shimmerParams.sustainedThreshold) {
        this.coherenceAboveSustainedSince = null;
      }
    }
    
    // ============================================
    // STATE MACHINE CALLBACKS (for crossfade audio)
    // ============================================
    if (newState === 'coherent') {
      // Track streak for metrics
      if (this.currentCoherentStreakStart === null) {
        this.currentCoherentStreakStart = currentTime;
      }
      
      // Reset active mind timer - coherence is present
      if (this.activeMindEnteredAt !== null) {
        this.activeMindEnteredAt = null;
      }
      // Fade out fog if it was enabled
      if (this.fogEnabled) {
        this.fadeOutFog(now);
        this.fogEnabled = false;
      }
      
      // Apply expressive modulation (if feature enabled)
      if (ENABLE_EXPRESSIVE_MODULATION) {
        this.applyExpressiveModulation(now);
      }
    } else {
      // Track active mind sustain
      if (newState === 'baseline') {
        this.updateActiveMindSustain(currentTime, now);
      }
      
      // If we just exited coherent state, update metrics
      if (this.currentCoherentStreakStart !== null) {
        const streakDuration = (currentTime - this.currentCoherentStreakStart) / 1000;
        this.metrics.totalCoherentSeconds += streakDuration;
        if (streakDuration > this.metrics.longestCoherentStreakSeconds) {
          this.metrics.longestCoherentStreakSeconds = streakDuration;
        }
        this.currentCoherentStreakStart = null;
      }
      
      // Reset expressive modulation when not coherent (if feature enabled)
      if (ENABLE_EXPRESSIVE_MODULATION) {
        this.resetExpressiveModulation(now);
      }

      // Reset PPG modulation when in baseline state (if feature enabled)
      if (ENABLE_PPG_MODULATION && newState === 'baseline') {
        this.resetPPGModulation();
      }
    }

    // Update current state for PPG depth calculation
    this.currentCoherenceState = newState;

    // Update PPG modulation (if feature enabled and in stabilizing/coherent states)
    // Allow PPG modulation during stabilizing and coherent states (not just coherent)
    if (ENABLE_PPG_MODULATION && (newState === 'stabilizing' || newState === 'coherent') && ppg) {
      this.updatePPGModulation(ppg, newState);
    } else if (ENABLE_PPG_MODULATION && newState === 'baseline' && ppg) {
      // Optional: allow reduced modulation during baseline (commented out by default)
      // Uncomment the line below to enable baseline PPG modulation at reduced depth
      // this.updatePPGModulation(ppg, newState);
    }
  }

  /**
   * Handle coherence state change (called by state machine callback)
   * CRITICAL: This is where audio gating happens - must match state 1:1
   */
  private handleCoherenceStateChange(newState: CoherenceState, oldState: CoherenceState): void {
    if (!this.ctx || !this.isSessionActive) return;
    
    const now = this.ctx.currentTime;
    const currentTime = Date.now();
    
    // PART 2: Track coherence gain activation for accurate time reporting
    if (newState === 'coherent') {
      // Coherence gain will become active - start tracking
      if (this.coherenceGainActiveStart === null) {
        this.coherenceGainActiveStart = currentTime;
        console.log('[AudioEngine] Coherence tracking started at:', currentTime);
      }
    } else {
      // Coherence gain is no longer active - accumulate time
      if (this.coherenceGainActiveStart !== null) {
        const activeDuration = currentTime - this.coherenceGainActiveStart;
        this.totalCoherenceAudioTime += activeDuration;
        console.log('[AudioEngine] Coherence period ended, accumulated:', {
          duration: activeDuration,
          durationSeconds: (activeDuration / 1000).toFixed(2),
          totalAccumulated: this.totalCoherenceAudioTime,
          totalAccumulatedSeconds: (this.totalCoherenceAudioTime / 1000).toFixed(2),
        });
        this.coherenceGainActiveStart = null;
      }
    }
    
    console.log(`[AudioEngine] 🎵 State change: ${oldState} -> ${newState}`, {
      timestamp: now,
      targetGains: {
        baseline: newState === 'coherent' ? 0 : 1,
        coherence: newState === 'coherent' ? 1 : 0,
        shimmer: newState === 'coherent' && this.shimmerEnabled ? 'adaptive' : 0,
        sustainedCoherence: newState === 'coherent' && this.sustainedCoherenceEnabled ? 1 : 0,
      },
    });
    
    if (newState === 'coherent') {
      // Entering coherent - crossfade to coherence audio
      this.startCrossfadeToCoherence(now);
    } else {
      // Exiting coherent (to baseline or stabilizing) - crossfade to baseline
      // CRITICAL: This ensures coherence audio is NEVER playing when state != coherent
      this.startCrossfadeToBaseline(now);
    }
  }


  /**
   * Update active mind sustain timer and trigger fog if needed
   */
  private updateActiveMindSustain(currentTime: number, now: number): void {
    // Start timer if not already started
    if (this.activeMindEnteredAt === null) {
      this.activeMindEnteredAt = currentTime;
      console.log('[AudioEngine] Active mind state entered - starting sustain timer');
      return;
    }

    // Check if sustain time has passed
    const sustainTime = (currentTime - this.activeMindEnteredAt) / 1000;
    
    if (sustainTime >= CROSSFADE_CONSTANTS.ACTIVE_SUSTAIN_SECONDS) {
      // Sustain completed - enable fog if not already enabled
      if (!this.fogEnabled) {
        this.fogEnabled = true;
        console.log(`[AudioEngine] 🌫️ Active mind sustained for ${sustainTime.toFixed(1)}s - Enabling fog effect`);
        this.fadeInFog(now);
      }
    } else {
      // Still in sustain period - log progress occasionally
      const progressSeconds = Math.floor(sustainTime * 2) / 2; // Round to 0.5s
      if (progressSeconds !== Math.floor((sustainTime - 0.1) * 2) / 2) {
        console.log(`[AudioEngine] Active mind: ${sustainTime.toFixed(1)}s / ${CROSSFADE_CONSTANTS.ACTIVE_SUSTAIN_SECONDS}s (fog will enable at ${CROSSFADE_CONSTANTS.ACTIVE_SUSTAIN_SECONDS}s)`);
      }
    }
  }

  /**
   * Fade in fog effect (active mind) - reverb-based spatial effect
   */
  private fadeInFog(now: number): void {
    if (!this.fogReverbMixGain || !this.fogReverbWetGain) return;

    console.log('[AudioEngine] 🌫️ Fading in fog effect (reverb-based)');

    // Cancel any existing scheduled changes
    this.fogReverbMixGain.gain.cancelScheduledValues(now);
    this.fogReverbWetGain.gain.cancelScheduledValues(now);

    // Get current values
    const currentMix = this.fogReverbMixGain.gain.value;
    const currentWet = this.fogReverbWetGain.gain.value;

    // Fade in fog mix gain (controls reverb input level)
    // 0 = no fog, 1 = full fog reverb
    this.fogReverbMixGain.gain.setValueAtTime(currentMix, now);
    this.fogReverbMixGain.gain.linearRampToValueAtTime(
      1.0, // Full reverb input when fog is active
      now + CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS
    );

    // Fade in reverb wet gain (controls reverb output level)
    // Wet mix is subtle (10-20%) to keep it spatial, not overwhelming
    const targetWet = CROSSFADE_CONSTANTS.FOG_REVERB_WET;
    this.fogReverbWetGain.gain.setValueAtTime(currentWet, now);
    this.fogReverbWetGain.gain.linearRampToValueAtTime(
      targetWet,
      now + CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS
    );

    console.log('[AudioEngine] Fog fade-in scheduled (reverb)', {
      mixGain: `${currentMix.toFixed(3)} -> 1.000`,
      wetGain: `${currentWet.toFixed(3)} -> ${targetWet.toFixed(3)}`,
      duration: CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS,
      note: 'Dry signal remains at full volume, reverb adds spatial fog effect',
    });
  }

  /**
   * Fade out fog effect (coherence returning) - reverb-based spatial effect
   */
  private fadeOutFog(now: number): void {
    if (!this.fogReverbMixGain || !this.fogReverbWetGain) return;

    console.log('[AudioEngine] 🌫️ Fading out fog effect (reverb-based)');

    // Cancel any existing scheduled changes
    this.fogReverbMixGain.gain.cancelScheduledValues(now);
    this.fogReverbWetGain.gain.cancelScheduledValues(now);

    // Get current values
    const currentMix = this.fogReverbMixGain.gain.value;
    const currentWet = this.fogReverbWetGain.gain.value;

    // Fade out fog mix gain (back to 0 = no fog)
    this.fogReverbMixGain.gain.setValueAtTime(currentMix, now);
    this.fogReverbMixGain.gain.linearRampToValueAtTime(
      0.0, // No reverb input when fog is off
      now + CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS
    );

    // Fade out reverb wet gain (back to 0)
    this.fogReverbWetGain.gain.setValueAtTime(currentWet, now);
    this.fogReverbWetGain.gain.linearRampToValueAtTime(
      0.0, // No reverb output when fog is off
      now + CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS
    );

    console.log('[AudioEngine] Fog fade-out scheduled (reverb)', {
      mixGain: `${currentMix.toFixed(3)} -> 0.000`,
      wetGain: `${currentWet.toFixed(3)} -> 0.000`,
      duration: CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS,
    });
  }

  /**
   * Apply expressive modulation based on calmScore and creativeFlowScore
   * Only called when ENABLE_EXPRESSIVE_MODULATION is true and state is 'coherent'
   * 
   * calmScore -> spaciousness (width, warmth, noise reduction)
   * creativeFlowScore -> musical definition (clarity, harmonic motion)
   */
  private applyExpressiveModulation(now: number): void {
    if (!ENABLE_EXPRESSIVE_MODULATION || !this.expressiveModulationEQ) {
      return; // Feature disabled or EQ not created
    }

    // Map calmScore to warmth (boost low-mids around 300-500Hz for warmth)
    // Map creativeFlowScore to clarity (boost high-mids around 2-4kHz for clarity)
    // Combine both effects with subtle blending
    
    // Warmth boost: calmScore * 3dB max boost at ~400Hz
    const warmthBoost = this.smoothedCalmScore * 3.0; // 0-3dB boost
    
    // Clarity boost: creativeFlowScore * 2.5dB max boost at ~3kHz
    const clarityBoost = this.smoothedCreativeFlowScore * 2.5; // 0-2.5dB boost
    
    // Use a single parametric EQ that blends between warmth and clarity
    // When calmScore is high, emphasize warmth (lower frequency)
    // When creativeFlowScore is high, emphasize clarity (higher frequency)
    // Blend the center frequency based on which score is dominant
    const warmthWeight = this.smoothedCalmScore / (this.smoothedCalmScore + this.smoothedCreativeFlowScore + 0.001);
    const clarityWeight = this.smoothedCreativeFlowScore / (this.smoothedCalmScore + this.smoothedCreativeFlowScore + 0.001);
    
    // Blend center frequency: 400Hz (warmth) to 3000Hz (clarity)
    const centerFreq = 400 + (3000 - 400) * clarityWeight;
    
    // Total gain is weighted combination of both boosts
    const totalGain = warmthBoost * warmthWeight + clarityBoost * clarityWeight;
    
    // Apply changes smoothly (cancel existing, set new values)
    this.expressiveModulationEQ.frequency.cancelScheduledValues(now);
    this.expressiveModulationEQ.gain.cancelScheduledValues(now);
    
    // Smooth transitions (gentle, slow changes)
    const currentFreq = this.expressiveModulationEQ.frequency.value;
    const currentGain = this.expressiveModulationEQ.gain.value;
    
    // Update frequency (smooth transition over 2 seconds)
    this.expressiveModulationEQ.frequency.setValueAtTime(currentFreq, now);
    this.expressiveModulationEQ.frequency.linearRampToValueAtTime(centerFreq, now + 2.0);
    
    // Update gain (smooth transition over 2 seconds)
    this.expressiveModulationEQ.gain.setValueAtTime(currentGain, now);
    this.expressiveModulationEQ.gain.linearRampToValueAtTime(totalGain, now + 2.0);
  }

  /**
   * Reset expressive modulation when not in coherent state
   * Only called when ENABLE_EXPRESSIVE_MODULATION is true
   */
  private resetExpressiveModulation(now: number): void {
    if (!ENABLE_EXPRESSIVE_MODULATION || !this.expressiveModulationEQ) {
      return; // Feature disabled or EQ not created
    }

    // Fade out modulation smoothly (return to neutral)
    this.expressiveModulationEQ.gain.cancelScheduledValues(now);
    const currentGain = this.expressiveModulationEQ.gain.value;
    
    // Fade to neutral (0dB) over 1 second
    this.expressiveModulationEQ.gain.setValueAtTime(currentGain, now);
    this.expressiveModulationEQ.gain.linearRampToValueAtTime(0, now + 1.0);
    
    // Reset smoothed scores
    this.smoothedCalmScore = 0;
    this.smoothedCreativeFlowScore = 0;
  }

  /**
   * Update PPG (heart rate) based audio modulation
   * Now active during 'stabilizing' and 'coherent' states (not just coherent)
   * Modulates lowpass filter cutoff frequency for clearly audible but smooth effect
   * Uses BPM/60 Hz clamped to 0.7-1.3 Hz as modulation rate
   * To disable: set ENABLE_PPG_MODULATION = false in muse-handler.ts
   */
  private updatePPGModulation(
    ppg: { bpm: number | null; confidence: number; lastBeatMs: number | null },
    _state: CoherenceState // State parameter kept for API consistency, but we use this.currentCoherenceState instead
  ): void {
    if (!ENABLE_PPG_MODULATION || !this.ctx || !this.ppgLowpassFilter) {
      return; // Feature disabled or not initialized
    }

    // Confidence gating: only modulate if confidence is high enough
    if (ppg.confidence < 0.6 || ppg.bpm === null) {
      // Not confident enough - disable modulation
      this.resetPPGModulation();
      return;
    }

    // Smooth BPM (heavy smoothing to avoid jittery behavior)
    // At this point, we know ppg.bpm is not null (checked above)
    const bpm = ppg.bpm!; // Non-null assertion safe due to check above
    if (this.smoothedBPM === null) {
      this.smoothedBPM = bpm;
    } else {
      this.smoothedBPM =
        this.smoothedBPM * (1 - this.ppgBPMSmoothingAlpha) +
        bpm * this.ppgBPMSmoothingAlpha;
    }

    // Modulation depth constants (used inside interval based on current state)
    const depthCoherent = 0.20; // 20% modulation during coherence
    const depthStabilizing = 0.12; // 12% modulation during stabilizing
    // Note: Baseline modulation depth would be 0.06 if enabled (currently disabled)

    // Start modulation interval if not already running
    if (!this.ppgModulationInterval) {
      let phase = 0; // Phase accumulator for sine wave
      
      this.ppgModulationInterval = setInterval(() => {
        if (!this.ppgLowpassFilter || !ENABLE_PPG_MODULATION) {
          return;
        }

        // Only modulate if we have valid smoothed BPM
        if (this.smoothedBPM === null) {
          return;
        }

        // Get current state for depth calculation (may have changed)
        const currentState = this.currentCoherenceState;
        
        let currentDepth: number;
        if (currentState === 'coherent') {
          currentDepth = depthCoherent;
        } else if (currentState === 'stabilizing') {
          currentDepth = depthStabilizing;
        } else {
          currentDepth = 0; // No modulation in baseline (unless enabled)
        }

        // Calculate modulation frequency from BPM: BPM/60 Hz, clamped to 0.7-1.3 Hz (perceptible range)
        const ppgRateHz = Math.max(0.7, Math.min(1.3, this.smoothedBPM / 60));
        const modPeriod = 1000 / ppgRateHz; // Period in ms

        // Update phase (increment by small step each interval)
        phase += (100 / modPeriod) * Math.PI * 2; // 100ms interval
        if (phase > Math.PI * 2) {
          phase -= Math.PI * 2;
        }

        // Calculate normalized wave value (-1 to 1)
        const normalizedWave = Math.sin(phase);

        // Calculate cutoff frequency variation: base ± (depth * normalizedWave)
        // Depth is a fraction (0-1), so we scale it to Hz range
        // Example: baseCutoff=8000Hz, depth=0.20, normalizedWave=1.0 → cutoff=8000 + (8000*0.20*1.0) = 9600Hz
        // Example: baseCutoff=8000Hz, depth=0.20, normalizedWave=-1.0 → cutoff=8000 + (8000*0.20*-1.0) = 6400Hz
        const cutoffVariation = this.ppgBaseCutoff * currentDepth * normalizedWave;
        const targetCutoff = this.ppgBaseCutoff + cutoffVariation;

        // Apply to lowpass filter cutoff smoothly (use current time for scheduling)
        const audioNow = this.ctx!.currentTime;
        this.ppgLowpassFilter.frequency.cancelScheduledValues(audioNow);
        const currentCutoff = this.ppgLowpassFilter.frequency.value;
        
        // Smooth transition (gentle ramping)
        this.ppgLowpassFilter.frequency.setValueAtTime(currentCutoff, audioNow);
        this.ppgLowpassFilter.frequency.linearRampToValueAtTime(targetCutoff, audioNow + 0.1);

        // Debug logging (throttled to once every 4-5 seconds)
        if (DEBUG_PPG) {
          const now = Date.now();
          const timeSinceLastLog = now - this.ppgModulationLastLogTime;
          if (timeSinceLastLog >= 4000) { // Log at most once every 4 seconds
            console.log('[AudioEngine] PPG modulation active:', {
              state: currentState,
              bpm: this.smoothedBPM.toFixed(1),
              confidence: ppg.confidence.toFixed(2),
              ppgRateHz: ppgRateHz.toFixed(2) + ' Hz',
              modPeriod: modPeriod.toFixed(0) + ' ms',
              modulationDepth: (currentDepth * 100).toFixed(1) + '%',
              baseCutoff: this.ppgBaseCutoff + ' Hz',
              currentCutoff: currentCutoff.toFixed(0) + ' Hz',
              targetCutoff: targetCutoff.toFixed(0) + ' Hz',
            });
            this.ppgModulationLastLogTime = now;
          }
        }
      }, 100); // Update every 100ms for smooth modulation

      console.log('[AudioEngine] ✅ PPG modulation interval started for BPM-based lowpass filter modulation');
    }
  }

  /**
   * Reset PPG modulation when in baseline state or confidence is low
   * Only called when ENABLE_PPG_MODULATION is true
   */
  private resetPPGModulation(): void {
    if (!ENABLE_PPG_MODULATION) {
      return; // Feature disabled
    }

    // Stop modulation interval
    if (this.ppgModulationInterval) {
      clearInterval(this.ppgModulationInterval);
      this.ppgModulationInterval = null;
    }

    // Reset smoothed BPM
    this.smoothedBPM = null;

    // Reset lowpass filter to base cutoff (smooth transition)
    if (this.ppgLowpassFilter && this.ctx) {
      const now = this.ctx.currentTime;
      const currentCutoff = this.ppgLowpassFilter.frequency.value;
      this.ppgLowpassFilter.frequency.cancelScheduledValues(now);
      this.ppgLowpassFilter.frequency.setValueAtTime(currentCutoff, now);
      this.ppgLowpassFilter.frequency.linearRampToValueAtTime(this.ppgBaseCutoff, now + 0.5); // Smooth return over 0.5s
    }
  }

  /**
   * Start crossfade from baseline to coherence
   */
  private startCrossfadeToCoherence(now: number): void {
    if (!this.baselineGain || !this.coherenceGain || !this.shimmerGain) return;

    // Cancel any existing scheduled changes
    this.baselineGain.gain.cancelScheduledValues(now);
    this.coherenceGain.gain.cancelScheduledValues(now);
    this.shimmerGain.gain.cancelScheduledValues(now);

    const currentBaseline = this.baselineGain.gain.value;
    const currentCoherence = this.coherenceGain.gain.value;

    // Crossfade baseline -> coherence
    this.baselineGain.gain.setValueAtTime(currentBaseline, now);
    this.baselineGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_CONSTANTS.ATTACK_SECONDS);

    this.coherenceGain.gain.setValueAtTime(currentCoherence, now);
    this.coherenceGain.gain.linearRampToValueAtTime(1.0, now + CROSSFADE_CONSTANTS.ATTACK_SECONDS);

    // Shimmer will be handled separately after sustain period (see updateCoherence)
    // Don't start shimmer here - wait for sustain requirement

    console.log('[AudioEngine] 🎵 CROSSFADING TO COHERENCE 🎵', {
      baselineGain: `${currentBaseline.toFixed(3)} -> 0.000`,
      coherenceGain: `${currentCoherence.toFixed(3)} -> 1.000`,
      attackSeconds: CROSSFADE_CONSTANTS.ATTACK_SECONDS,
      bothTracksPlaying: true,
      note: 'Both baseline and coherence tracks are playing simultaneously during crossfade',
    });
  }

  /**
   * Start crossfade from coherence to baseline
   */
  private startCrossfadeToBaseline(now: number): void {
    if (!this.baselineGain || !this.coherenceGain || !this.shimmerGain) return;

    // Cancel any existing scheduled changes
    this.baselineGain.gain.cancelScheduledValues(now);
    this.coherenceGain.gain.cancelScheduledValues(now);
    this.shimmerGain.gain.cancelScheduledValues(now);

    const currentBaseline = this.baselineGain.gain.value;
    const currentCoherence = this.coherenceGain.gain.value;
    const currentShimmer = this.shimmerGain.gain.value;

    // Crossfade coherence -> baseline
    this.baselineGain.gain.setValueAtTime(currentBaseline, now);
    this.baselineGain.gain.linearRampToValueAtTime(1.0, now + CROSSFADE_CONSTANTS.RELEASE_SECONDS);

    this.coherenceGain.gain.setValueAtTime(currentCoherence, now);
    this.coherenceGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_CONSTANTS.RELEASE_SECONDS);

    // Smooth fade out shimmer (not abrupt)
    this.shimmerGain.gain.cancelScheduledValues(now);
    const currentShimmerGain = Math.max(0.001, currentShimmer);
    this.shimmerGain.gain.setValueAtTime(currentShimmerGain, now);
    this.shimmerGain.gain.linearRampToValueAtTime(
      0.001, // Use 0.001 instead of 0 to prevent clicks
      now + CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_SECONDS
    );
    
    console.log('[AudioEngine] Shimmer fading out smoothly', {
      from: currentShimmerGain.toFixed(3),
      to: 0,
      duration: CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_SECONDS,
    });

    console.log('[AudioEngine] Crossfading to baseline');
  }

  /**
   * Fade in shimmer layer (initial trigger)
   */
  private fadeInShimmer(now: number): void {
    if (!this.shimmerGain || !this.shimmerEnabled) return;

    const targetGain = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);
    
    // Cancel any existing scheduled changes
    this.shimmerGain.gain.cancelScheduledValues(now);
    
    // Start from near-zero and fade to target over the fade-in period
    const currentGain = Math.max(0.001, this.shimmerGain.gain.value);
    this.shimmerGain.gain.setValueAtTime(currentGain, now);
    this.shimmerGain.gain.linearRampToValueAtTime(
      targetGain,
      now + CROSSFADE_CONSTANTS.SHIMMER_FADE_IN_SECONDS
    );

    console.log('[AudioEngine] ✨ Shimmer fading in', {
      from: currentGain.toFixed(3),
      to: targetGain.toFixed(3),
      duration: CROSSFADE_CONSTANTS.SHIMMER_FADE_IN_SECONDS,
    });
  }

  /**
   * Update shimmer gain based on coherence strength (adaptive)
   */
  private updateShimmerGain(now: number): void {
    if (!this.shimmerGain || !this.shimmerEnabled) return;

    const targetGain = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);
    
    this.updateShimmerGainSmooth(now, targetGain, CROSSFADE_CONSTANTS.SHIMMER_UPDATE_SMOOTH_SECONDS);
  }

  /**
   * Fade in sustained coherence layer
   */
  private fadeInSustainedCoherence(now: number): void {
    if (!this.sustainedCoherenceGain) return;

    const currentGain = Math.max(0.001, this.sustainedCoherenceGain.gain.value);
    this.sustainedCoherenceGain.gain.cancelScheduledValues(now);
    this.sustainedCoherenceGain.gain.setValueAtTime(currentGain, now);
    this.sustainedCoherenceGain.gain.linearRampToValueAtTime(
      1.0,
      now + CROSSFADE_CONSTANTS.SUSTAINED_ATTACK_SECONDS
    );

    console.log('[AudioEngine] 🎯 Sustained coherence layer fading in', {
      from: currentGain.toFixed(3),
      to: 1.0,
      duration: CROSSFADE_CONSTANTS.SUSTAINED_ATTACK_SECONDS,
    });
  }

  /**
   * Fade out sustained coherence layer
   */
  private fadeOutSustainedCoherence(now: number): void {
    if (!this.sustainedCoherenceGain) return;

    const currentGain = Math.max(0.001, this.sustainedCoherenceGain.gain.value);
    this.sustainedCoherenceGain.gain.cancelScheduledValues(now);
    this.sustainedCoherenceGain.gain.setValueAtTime(currentGain, now);
    this.sustainedCoherenceGain.gain.linearRampToValueAtTime(
      0.001,
      now + CROSSFADE_CONSTANTS.SUSTAINED_RELEASE_SECONDS
    );

    console.log('[AudioEngine] 🎯 Sustained coherence layer fading out', {
      from: currentGain.toFixed(3),
      to: 0.001,
      duration: CROSSFADE_CONSTANTS.SUSTAINED_RELEASE_SECONDS,
    });
  }

  /**
   * Smoothly update shimmer gain (helper method)
   */
  private updateShimmerGainSmooth(now: number, targetGain: number, duration: number): void {
    if (!this.shimmerGain) return;

    // Cancel any existing scheduled changes
    this.shimmerGain.gain.cancelScheduledValues(now);
    
    // Get current gain (use 0.001 minimum to prevent clicks)
    const currentGain = Math.max(0.001, this.shimmerGain.gain.value);
    const finalTargetGain = Math.max(0.001, targetGain);
    
    // Only update if there's a meaningful change (> 1% difference)
    if (Math.abs(currentGain - finalTargetGain) > 0.01) {
      this.shimmerGain.gain.setValueAtTime(currentGain, now);
      this.shimmerGain.gain.linearRampToValueAtTime(finalTargetGain, now + duration);
    }
  }

  // ============================================
  // MOVEMENT CUE PLAYBACK
  // ============================================
  
  /**
   * Ensure AudioContext is in 'running' state.
   * Call from a user gesture handler (e.g. button click) on iOS to guarantee resume works.
   * @returns true if context is running after this call
   */
  async ensureContextRunning(): Promise<boolean> {
    if (!this.ctx) {
      if (DEBUG_MOVEMENT_AUDIO) console.warn('[MoveCue] ensureContextRunning: no AudioContext');
      return false;
    }
    if (this.ctx.state === 'running') return true;

    if (DEBUG_MOVEMENT_AUDIO) {
      console.log('[MoveCue] ensureContextRunning: state=' + this.ctx.state + ', calling resume()...');
    }
    try {
      await this.ctx.resume();
      if (DEBUG_MOVEMENT_AUDIO) {
        console.log('[MoveCue] ensureContextRunning: resumed, state=' + this.ctx.state);
      }
    } catch (e) {
      console.error('[MoveCue] ensureContextRunning: resume() failed:', e);
      return false;
    }
    // Re-read state after resume (TypeScript narrows the type above, so cast)
    return (this.ctx.state as string) === 'running';
  }

  /**
   * Play the next movement cue in the 1-2-3 cycle.
   * 
   * BEHAVIOR:
   * - Cycles through cues deterministically: 1 -> 2 -> 3 -> 1 -> ...
   * - Will not play if a cue is already playing (prevents overlap/stacking)
   * - Respects master volume
   * - Does not duck or pause main audio layers
   * - If context is suspended, fires a resume() attempt for the NEXT call
   * 
   * TUNING:
   * - Adjust movementCueGain.gain.value in init() to change volume
   * - Movement cue files should be pre-mixed to appropriate level
   * 
   * @returns The cue number that was played (1, 2, or 3), or 0 if no cue played
   */
  playMovementCue(): number {
    // Step 1: Check context exists
    if (!this.ctx) {
      if (DEBUG_MOVEMENT_AUDIO) console.warn('[MoveCue] BLOCKED step1: no AudioContext');
      return 0;
    }

    // Step 2: Log session state (DO NOT gate on isSessionActive — it can be stale
    // if startSession() hit an early return due to missing baseline/coherence buffers,
    // which leaves isSessionActive=false even though the session UI is visible and the
    // movement detector is actively running. Movement cues must still play.)
    if (DEBUG_MOVEMENT_AUDIO && !this.isSessionActive) {
      console.warn('[MoveCue] NOTE: isSessionActive=false (session audio may have failed to start, but cues still play)');
    }

    // Step 3: Check context state — try resume if suspended (fire-and-forget for next poll)
    if ((this.ctx.state as string) !== 'running') {
      if (DEBUG_MOVEMENT_AUDIO) {
        console.warn('[MoveCue] BLOCKED step3: ctx.state=' + this.ctx.state + ' (firing resume for next attempt)');
      }
      this.ctx.resume().catch(() => {});
      return 0;
    }

    // Step 4: Anti-spam minimum interval (allows polyphonic overlap, prevents machine-gun)
    const now = Date.now();
    if (now - this.lastMovementCueTime < AudioEngine.MOVEMENT_CUE_MIN_INTERVAL_MS) {
      if (DEBUG_MOVEMENT_AUDIO) console.log('[MoveCue] BLOCKED step4: anti-spam interval');
      return 0;
    }

    // Step 5: Check buffer — attempt on-the-fly reload if null
    let buffer = this.movementCueBuffers[this.movementCueIndex];
    if (!buffer) {
      if (DEBUG_MOVEMENT_AUDIO) {
        console.warn('[MoveCue] step5: buffer[' + this.movementCueIndex + '] is null — attempting on-the-fly load', {
          allBuffers: this.movementCueBuffers.map((b, i) =>
            b ? 'cue' + (i + 1) + ':' + b.duration.toFixed(2) + 's' : 'cue' + (i + 1) + ':null'
          ),
        });
      }
      // Fire-and-forget async reload so future triggers have the buffer
      this.reloadMovementCueBuffer(this.movementCueIndex);
      this.movementCueIndex = (this.movementCueIndex + 1) % 3;
      return 0;
    }

    // Step 6: Check gain node (create on-the-fly if it was never initialized)
    if (!this.movementCueGain) {
      if (this.ctx && this.masterGain) {
        if (DEBUG_MOVEMENT_AUDIO) console.warn('[MoveCue] step6: gain node was null — creating on-the-fly');
        this.movementCueGain = this.ctx.createGain();
        this.movementCueGain.gain.value = 0.5;
        this.movementCueGain.connect(this.masterGain);
      } else if (this.ctx) {
        // No masterGain — connect directly to destination as a last resort
        if (DEBUG_MOVEMENT_AUDIO) console.warn('[MoveCue] step6: gain+master null — connecting direct to destination');
        this.movementCueGain = this.ctx.createGain();
        this.movementCueGain.gain.value = 0.5;
        this.movementCueGain.connect(this.ctx.destination);
      } else {
        if (DEBUG_MOVEMENT_AUDIO) console.warn('[MoveCue] BLOCKED step6: no ctx for gain creation');
        return 0;
      }
    }

    // All guards passed — play the cue (polyphonic: each call creates a fresh source)
    this.lastMovementCueTime = now;
    return this.playCueFromBuffer(buffer);
  }

  /**
   * Internal helper: play a movement cue buffer through the gain chain.
   * Polyphonic — each call creates a new fire-and-forget AudioBufferSourceNode
   * so multiple cues can overlap if triggers arrive quickly.
   */
  private playCueFromBuffer(buffer: AudioBuffer): number {
    if (!this.ctx || !this.movementCueGain) return 0;

    const cueNumber = this.movementCueIndex + 1;

    // Create a fresh one-shot source (polyphonic — does not stop previous sources)
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(this.movementCueGain);

    source.onended = () => {
      // Fire-and-forget cleanup — source is already GC-eligible once disconnected
      try { source.disconnect(); } catch { /* already disconnected */ }
      if (DEBUG_MOVEMENT_AUDIO) {
        console.log('[MoveCue] cue ' + cueNumber + ' ended');
      }
    };

    source.start(0);

    if (DEBUG_MOVEMENT_AUDIO) {
      console.log('[MoveCue] ▶ PLAYING cue ' + cueNumber, {
        duration: buffer.duration.toFixed(2) + 's',
        gainValue: this.movementCueGain.gain.value,
        masterGainValue: this.masterGain?.gain?.value,
        ctxState: this.ctx.state,
      });
    }

    this.movementCueIndex = (this.movementCueIndex + 1) % 3;
    return cueNumber;
  }

  /**
   * Attempt to reload a single movement cue buffer that was null.
   * Fire-and-forget — logs results but doesn't block.
   */
  private async reloadMovementCueBuffer(index: number): Promise<void> {
    if (!this.ctx) return;
    const cueNum = index + 1;
    const filename = `movement-cue-${cueNum}.mp3`;
    try {
      if (DEBUG_MOVEMENT_AUDIO) console.log('[MoveCue] Reloading ' + filename + '...');
      const resp = await fetch(`/audio/${filename}`);
      if (!resp.ok) {
        console.warn('[MoveCue] Reload ' + filename + ' failed: HTTP ' + resp.status);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();
      this.movementCueBuffers[index] = await this.ctx.decodeAudioData(arrayBuffer);
      if (DEBUG_MOVEMENT_AUDIO) {
        console.log('[MoveCue] ✅ Reloaded ' + filename + ' duration=' +
          this.movementCueBuffers[index]!.duration.toFixed(2) + 's');
      }
    } catch (err) {
      console.warn('[MoveCue] Reload ' + filename + ' error:', err);
    }
  }

  /**
   * Test-play the next movement cue (async, called from the DEBUG test button).
   * 
   * This method is designed to be called from a user gesture (button click),
   * which is REQUIRED on iOS to resume a suspended AudioContext.
   * 
   * Unlike playMovementCue(), this method:
   * - Awaits AudioContext.resume() (guaranteed to work from user gesture on iOS)
   * - Does NOT require isSessionActive (so it works even if session state is wrong)
   * - Attempts to reload the buffer from network if it is null
   * - Creates the gain node if missing
   * - Logs every step for full diagnosis
   * 
   * @returns The cue number played (1-3), or 0 if playback failed
   */
  async testPlayMovementCue(): Promise<number> {
    console.log('[MoveCue] === TEST PLAY START ===');
    console.log('[MoveCue] Diagnostics:', {
      hasCtx: !!this.ctx,
      ctxState: this.ctx?.state ?? 'N/A',
      isSessionActive: this.isSessionActive,
      cueIndex: this.movementCueIndex,
      buffers: this.movementCueBuffers.map((b, i) =>
        b ? 'cue' + (i + 1) + ':' + b.duration.toFixed(2) + 's' : 'cue' + (i + 1) + ':null'
      ),
      hasGainNode: !!this.movementCueGain,
      gainValue: this.movementCueGain?.gain?.value ?? 'N/A',
      masterGainValue: this.masterGain?.gain?.value ?? 'N/A',
    });

    // 1) Ensure context exists
    if (!this.ctx) {
      console.error('[MoveCue] TEST FAIL: No AudioContext. Engine not initialized.');
      return 0;
    }

    // 2) Resume context (this is a user gesture, so iOS allows it)
    if (this.ctx.state !== 'running') {
      console.log('[MoveCue] Resuming AudioContext (state=' + this.ctx.state + ')...');
      try {
        await this.ctx.resume();
        console.log('[MoveCue] Resumed → state=' + this.ctx.state);
      } catch (e) {
        console.error('[MoveCue] TEST FAIL: resume() threw:', e);
        return 0;
      }
      // Re-read state after resume (TypeScript narrows the type above, so cast)
      if ((this.ctx.state as string) !== 'running') {
        console.error('[MoveCue] TEST FAIL: state still ' + this.ctx.state + ' after resume');
        return 0;
      }
    }

    // 3) Ensure gain node exists (recreate if missing)
    if (!this.movementCueGain) {
      console.log('[MoveCue] Creating missing gain node...');
      this.movementCueGain = this.ctx.createGain();
      this.movementCueGain.gain.value = 0.5;
      if (this.masterGain) {
        this.movementCueGain.connect(this.masterGain);
        console.log('[MoveCue] Gain node connected to masterGain');
      } else {
        // Fallback: connect directly to destination
        this.movementCueGain.connect(this.ctx.destination);
        console.warn('[MoveCue] No masterGain — connected gain directly to destination');
      }
    }

    // 4) Check buffer — attempt reload if null
    let buffer = this.movementCueBuffers[this.movementCueIndex];
    if (!buffer) {
      const cueNum = this.movementCueIndex + 1;
      const url = '/audio/movement-cue-' + cueNum + '.mp3';
      console.log('[MoveCue] Buffer[' + this.movementCueIndex + '] is null. Fetching ' + url + '...');
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error('[MoveCue] TEST FAIL: fetch ' + url + ' → ' + resp.status + ' ' + resp.statusText);
          return 0;
        }
        console.log('[MoveCue] Fetch OK (' + resp.status + '), decoding...');
        const ab = await resp.arrayBuffer();
        console.log('[MoveCue] ArrayBuffer size: ' + ab.byteLength + ' bytes');
        this.movementCueBuffers[this.movementCueIndex] = await this.ctx.decodeAudioData(ab);
        buffer = this.movementCueBuffers[this.movementCueIndex];
        console.log('[MoveCue] Decoded! Duration: ' + buffer!.duration.toFixed(2) + 's');
      } catch (e) {
        console.error('[MoveCue] TEST FAIL: fetch/decode error:', e);
        return 0;
      }
    }

    if (!buffer) {
      console.error('[MoveCue] TEST FAIL: buffer still null after reload');
      return 0;
    }

    // 5) Play (polyphonic — no need to stop previous cues)
    const result = this.playCueFromBuffer(buffer);
    console.log('[MoveCue] === TEST PLAY ' + (result > 0 ? 'SUCCESS cue ' + result : 'FAILED') + ' ===');
    return result;
  }

  /**
   * Reset movement cue index to start fresh (called on session start/stop)
   */
  resetMovementCueIndex(): void {
    this.movementCueIndex = 0;
    this.lastMovementCueTime = 0;
  }

  /**
   * Set movement cue volume (0-1)
   * @param volume Volume level from 0 (silent) to 1 (full)
   */
  setMovementCueVolume(volume: number): void {
    if (this.movementCueGain && this.ctx) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      this.movementCueGain.gain.setTargetAtTime(clampedVolume, this.ctx.currentTime, 0.1);
      if (DEBUG_MOVEMENT_CUES) {
        console.log('[AudioEngine] Movement cue volume set to:', clampedVolume);
      }
    }
  }

  /**
   * Start entrainment audio (binaural beats only)
   */
  async startEntrainment(type?: EntrainmentType): Promise<void> {
    if (!this.ctx || !this.entrainmentGain) {
      await this.init();
    }

    // Ensure audio context is running (critical for iOS)
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') {
      console.log('[AudioEngine] Audio context is suspended, attempting to resume for entrainment...');
      try {
        await ctx.resume();
        console.log('[AudioEngine] Audio context resumed successfully for entrainment, state:', ctx.state);
      } catch (error) {
        console.error('[AudioEngine] Failed to resume audio context for entrainment:', error);
        throw new Error('Failed to resume audio context for entrainment. User interaction may be required.');
      }
    }

    // Capture the current type before updating (for comparison)
    const currentType = this.config.entrainmentType;
    const targetType = type || this.config.entrainmentType;

    if (type) {
      this.config.entrainmentType = type;
    }

    if (this.config.entrainmentType === 'none' || this.config.entrainmentType === 'isochronic') {
      this.stopEntrainment();
      return;
    }

    // Only stop if we're already playing a different type
    if (this.isEntrainmentPlaying && currentType !== targetType) {
      this.stopEntrainment();
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const now = this.ctx!.currentTime;

    if (this.config.entrainmentType === 'binaural') {
      this.startBinaural(now);
    }

    // Smooth fade in with exponential curve
    this.entrainmentGain!.gain.setValueAtTime(0.001, now);
    this.entrainmentGain!.gain.exponentialRampToValueAtTime(
      this.config.entrainmentVolume + 0.001,
      now + 1.5
    );

    this.isEntrainmentPlaying = true;
    console.log(`[AudioEngine] Started ${this.config.entrainmentType} entrainment`);
  }

  /**
   * Start binaural beats (with tritone-down frequency)
   */
  private startBinaural(now: number): void {
    if (!this.ctx || !this.entrainmentGain) {
      console.error('[AudioEngine] Cannot start binaural: missing context or gain');
      return;
    }

    // Stop existing binaural if running
    if (this.binauralLeft || this.binauralRight) {
      this.stopBinaural();
      // Small delay to ensure cleanup
      now = this.ctx.currentTime + 0.01;
    }

    const { binauralCarrierFreq, binauralBeatFreq } = this.config;

    // Create stereo merger
    this.binauralMerger = this.ctx.createChannelMerger(2);
    this.binauralMerger.connect(this.entrainmentGain);

    // Left ear - carrier frequency (already transposed down a tritone in preset)
    this.binauralLeft = this.ctx.createOscillator();
    this.binauralLeft.type = 'sine';
    this.binauralLeft.frequency.value = binauralCarrierFreq;

    // Right ear - carrier + beat frequency
    this.binauralRight = this.ctx.createOscillator();
    this.binauralRight.type = 'sine';
    this.binauralRight.frequency.value = binauralCarrierFreq + binauralBeatFreq;

    // Create individual gains for each ear
    const leftGain = this.ctx.createGain();
    const rightGain = this.ctx.createGain();
    leftGain.gain.value = 0.5;
    rightGain.gain.value = 0.5;

    this.binauralLeft.connect(leftGain);
    this.binauralRight.connect(rightGain);

    leftGain.connect(this.binauralMerger, 0, 0);
    rightGain.connect(this.binauralMerger, 0, 1);

    this.binauralLeft.start(now);
    this.binauralRight.start(now);
    console.log('[AudioEngine] Started binaural beats', {
      carrier: binauralCarrierFreq,
      beat: binauralBeatFreq,
      left: binauralCarrierFreq,
      right: binauralCarrierFreq + binauralBeatFreq,
    });
  }

  /**
   * Stop binaural beats (internal helper)
   */
  private stopBinaural(): void {
    if (this.binauralLeft) {
      try {
        this.binauralLeft.stop();
      } catch (e) {
        // Already stopped
      }
      this.binauralLeft = null;
    }
    if (this.binauralRight) {
      try {
        this.binauralRight.stop();
      } catch (e) {
        // Already stopped
      }
      this.binauralRight = null;
    }
    if (this.binauralMerger) {
      this.binauralMerger.disconnect();
      this.binauralMerger = null;
    }
  }

  /**
   * Stop entrainment audio
   */
  stopEntrainment(): void {
    if (!this.ctx || !this.isEntrainmentPlaying) return;

    const now = this.ctx.currentTime;

    // Smooth exponential fade out
    if (this.entrainmentGain) {
      const currentGain = Math.max(0.001, this.entrainmentGain.gain.value);
      this.entrainmentGain.gain.setValueAtTime(currentGain, now);
      this.entrainmentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    }

    // Stop binaural after fade completes
    setTimeout(() => {
      this.stopBinaural();
    }, 900);

    this.isEntrainmentPlaying = false;
    console.log('[AudioEngine] Stopped entrainment');
  }

  /**
   * Reward methods kept for backward compatibility (no-ops)
   */
  async startReward(): Promise<void> {
    // Disabled - oscillator-based rewards removed
    // Use coherence crossfade instead
  }

  stopReward(): void {
    // Disabled - oscillator-based rewards removed
  }

  /**
   * Set entrainment volume (0-1)
   */
  setEntrainmentVolume(volume: number): void {
    this.config.entrainmentVolume = Math.max(0, Math.min(1, volume));
    if (this.entrainmentGain && this.ctx) {
      this.entrainmentGain.gain.setTargetAtTime(
        this.isEntrainmentPlaying ? this.config.entrainmentVolume : 0,
        this.ctx.currentTime,
        0.1
      );
    }
  }

  /**
   * Set binaural beat frequency (Hz)
   */
  setBinauralBeatFreq(freq: number): void {
    this.config.binauralBeatFreq = freq;
    if (this.binauralRight && this.ctx) {
      this.binauralRight.frequency.setTargetAtTime(
        this.config.binauralCarrierFreq + freq,
        this.ctx.currentTime,
        0.5
      );
    }
  }

  /**
   * Set binaural carrier frequency (Hz) - already transposed down a tritone
   */
  setBinauralCarrierFreq(freq: number): void {
    this.config.binauralCarrierFreq = freq;
    if (this.ctx) {
      if (this.binauralLeft) {
        this.binauralLeft.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
      }
      if (this.binauralRight) {
        this.binauralRight.frequency.setTargetAtTime(
          freq + this.config.binauralBeatFreq,
          this.ctx.currentTime,
          0.5
        );
      }
    }
  }

  /**
   * Apply a binaural preset
   */
  applyBinauralPreset(presetName: Exclude<BinauralPresetName, 'custom'>): void {
    const preset = BINAURAL_PRESETS[presetName];
    if (preset) {
      this.config.binauralBeatFreq = preset.beatFrequency;
      this.config.binauralCarrierFreq = preset.carrierFrequency;

      // If binaural is currently playing, update the frequencies
      if (this.isEntrainmentPlaying && this.config.entrainmentType === 'binaural') {
        this.setBinauralCarrierFreq(preset.carrierFrequency);
        this.setBinauralBeatFreq(preset.beatFrequency);
      }
    }
  }

  /**
   * Get current config
   */
  getConfig(): AudioEngineConfig {
    return { ...this.config };
  }

  /**
   * Get coherence state
   */
  getCoherenceState(): CoherenceState {
    return this.coherenceStateMachine.getState();
  }

  /**
   * Get coherence metrics
   */
  getCoherenceMetrics(): CoherenceMetrics {
    // Calculate current coherence time including active period if still coherent
    let currentCoherenceTimeMs = this.totalCoherenceAudioTime;
    if (this.coherenceGainActiveStart !== null && this.isSessionActive) {
      // Add time since coherence started (if still in coherent state)
      const activeDuration = Date.now() - this.coherenceGainActiveStart;
      currentCoherenceTimeMs += activeDuration;
    }
    
    // Debug logging (can be removed after verification)
    console.log('[AudioEngine] getCoherenceMetrics:', {
      accumulated: this.totalCoherenceAudioTime,
      activeStart: this.coherenceGainActiveStart,
      isSessionActive: this.isSessionActive,
      currentTotal: currentCoherenceTimeMs,
      currentTotalSeconds: (currentCoherenceTimeMs / 1000).toFixed(2),
    });
    
    return {
      ...this.metrics,
      totalCoherenceAudioTimeMs: currentCoherenceTimeMs, // Use actual tracked time, not metrics object
    };
  }

  /**
   * Check if entrainment is playing
   */
  get entrainmentPlaying(): boolean {
    return this.isEntrainmentPlaying;
  }

  /**
   * Check if reward is playing (always false - kept for backward compatibility)
   */
  get rewardPlaying(): boolean {
    return false; // Oscillator-based rewards disabled
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.stopSession();
    this.stopEntrainment();

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }

    this.isAudioLoaded = false;
    this.isSessionActive = false;
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
