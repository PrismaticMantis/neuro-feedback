// Audio Engine for Entrainment and Coherence Crossfade
// Handles MP3-based baseline/coherence crossfade, shimmer layer, and binaural beats

import type {
  EntrainmentType,
  BinauralPreset,
  BinauralPresetName,
} from '../types';

// Crossfade constants (centralized for easy tweaking)
const CROSSFADE_CONSTANTS = {
  ENTER_THRESHOLD: 0.65, // Lowered from 0.75 to make it easier to trigger
  EXIT_THRESHOLD: 0.55,  // Lowered from 0.65 to match new enter threshold
  SUSTAIN_SECONDS: 2.0,  // Reduced from 3.0 to 2.0 seconds for faster response
  ATTACK_SECONDS: 3.5,
  RELEASE_SECONDS: 6.0,
  START_FADE_SECONDS: 4.0,
  SHIMMER_BASE_GAIN: 0.10,
  SHIMMER_MAX_GAIN: 0.25,
  SHIMMER_RANGE: 0.15, // max - base
  SHIMMER_FADE_IN_SECONDS: 4.0,  // Smooth fade-in time for shimmer
  SHIMMER_FADE_OUT_SECONDS: 5.0,  // Smooth fade-out time for shimmer
  SHIMMER_FADE_OUT_DELAY_SECONDS: 1.0, // Delay before starting fade-out (hysteresis)
  SHIMMER_UPDATE_SMOOTH_SECONDS: 0.8, // Smooth update time for shimmer gain changes
  // Fog effect constants (active mind sustain gating)
  ACTIVE_SUSTAIN_SECONDS: 3.0, // Must be non-coherent for this long before fog appears
  FOG_LEVEL: 0.35, // Fog gain level (0-1)
  FOG_ATTACK_SECONDS: 3.0, // Fog fade-in time
  FOG_RELEASE_SECONDS: 4.0, // Fog fade-out time
  FOG_LOWPASS_OPEN: 18000, // Lowpass frequency when fog is off (Hz)
  FOG_LOWPASS_CLOSED: 5000, // Lowpass frequency when fog is on (Hz)
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

// Export types for use in hooks/components
export type CoherenceState = 'baseline' | 'stabilizing' | 'coherent';

export interface CoherenceMetrics {
  totalCoherentSeconds: number;
  longestCoherentStreakSeconds: number;
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

  // Buffer sources (always playing, synced)
  private baselineSource: AudioBufferSourceNode | null = null;
  private coherenceSource: AudioBufferSourceNode | null = null;
  private shimmerSource: AudioBufferSourceNode | null = null;

  // Gain nodes for crossfade
  private baselineGain: GainNode | null = null;
  private coherenceGain: GainNode | null = null;
  private shimmerGain: GainNode | null = null;

  // Shimmer limiter
  private shimmerLimiter: DynamicsCompressorNode | null = null;

  // Fog effect nodes (active mind effect)
  private fogGain: GainNode | null = null;
  private fogLowpass: BiquadFilterNode | null = null;

  // Entrainment nodes (binaural only)
  private entrainmentGain: GainNode | null = null;
  private binauralLeft: OscillatorNode | null = null;
  private binauralRight: OscillatorNode | null = null;
  private binauralMerger: ChannelMergerNode | null = null;

  // Coherence state machine
  private coherenceState: CoherenceState = 'baseline';
  private coherenceEnteredAt: number | null = null;
  private currentCoherentStreakStart: number | null = null;

  // Metrics
  private metrics: CoherenceMetrics = {
    totalCoherentSeconds: 0,
    longestCoherentStreakSeconds: 0,
  };

  // Smooth coherence strength for adaptive shimmer
  private smoothedCoherenceStrength: number = 0;
  
  // Shimmer fade-out tracking (to prevent abrupt cutouts)
  private shimmerFadeOutStartTime: number | null = null;
  private shimmerTargetGain: number = 0;

  // Fog effect tracking (active mind sustain gating)
  private activeMindEnteredAt: number | null = null; // When non-coherent state started
  private fogEnabled: boolean = false; // Whether fog is currently active

  private config: AudioEngineConfig;
  private isEntrainmentPlaying = false;
  private isAudioLoaded = false;
  private isSessionActive = false;
  private sourcesStarted = false; // Guard to prevent multiple starts

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize audio context (must be called after user gesture)
   */
  async init(): Promise<void> {
    if (this.ctx) return;

    this.ctx = new AudioContext();

    // Monitor audio context state changes (important for iOS)
    this.ctx.addEventListener('statechange', () => {
      console.log('[AudioEngine] AudioContext state changed to:', this.ctx!.state);
    });

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
      console.log('[AudioEngine] AudioContext resumed in init, state:', this.ctx.state);
    }

    // Create master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    // Create entrainment gain
    this.entrainmentGain = this.ctx.createGain();
    this.entrainmentGain.gain.value = 0;
    this.entrainmentGain.connect(this.masterGain);

    // Load audio files
    await this.loadAudioFiles();

    // Create gain nodes for crossfade
    this.baselineGain = this.ctx.createGain();
    this.coherenceGain = this.ctx.createGain();
    this.shimmerGain = this.ctx.createGain();

    // Initialize gains
    this.baselineGain.gain.value = 0;
    this.coherenceGain.gain.value = 0;
    this.shimmerGain.gain.value = 0;

    // Connect to master
    this.baselineGain.connect(this.masterGain);
    this.coherenceGain.connect(this.masterGain);

    // Create shimmer limiter
    this.shimmerLimiter = this.ctx.createDynamicsCompressor();
    this.shimmerLimiter.threshold.value = -6;
    this.shimmerLimiter.knee.value = 0;
    this.shimmerLimiter.ratio.value = 20;
    this.shimmerLimiter.attack.value = 0.001;
    this.shimmerLimiter.release.value = 0.1;

    // Shimmer chain: gain -> limiter -> master
    this.shimmerGain.connect(this.shimmerLimiter);
    this.shimmerLimiter.connect(this.masterGain);

    // Create fog effect nodes (lowpass filter + gain)
    this.fogLowpass = this.ctx.createBiquadFilter();
    this.fogLowpass.type = 'lowpass';
    this.fogLowpass.frequency.value = CROSSFADE_CONSTANTS.FOG_LOWPASS_OPEN; // Start open (no fog)
    this.fogLowpass.Q.value = 1.0;

    this.fogGain = this.ctx.createGain();
    this.fogGain.gain.value = 1.0; // Start at 1.0 (full pass-through, no fog effect)

    // Fog chain: master -> fogLowpass -> fogGain -> destination
    // Route master output through fog filter chain
    // fogGain controls fog intensity: 1.0 = no fog, FOG_LEVEL = full fog
    // lowpass frequency creates the muffled effect
    this.masterGain.disconnect(); // Disconnect from destination
    this.masterGain.connect(this.fogLowpass);
    this.fogLowpass.connect(this.fogGain);
    this.fogGain.connect(this.ctx.destination);

    this.isAudioLoaded = true;
    console.log('[AudioEngine] Initialized with MP3 crossfade system');
  }

  /**
   * Load MP3 audio files from /public/audio
   */
  private async loadAudioFiles(): Promise<void> {
    if (!this.ctx) throw new Error('AudioContext not initialized');

    try {
      // Load baseline.mp3
      const baselineResponse = await fetch('/audio/baseline.mp3');
      const baselineArrayBuffer = await baselineResponse.arrayBuffer();
      this.baselineBuffer = await this.ctx.decodeAudioData(baselineArrayBuffer);

      // Load coherence-v2.mp3
      const coherenceResponse = await fetch('/audio/coherence-v2.mp3');
      const coherenceArrayBuffer = await coherenceResponse.arrayBuffer();
      this.coherenceBuffer = await this.ctx.decodeAudioData(coherenceArrayBuffer);

      // Load shimmer (try .mp3 first, fallback to .wav)
      let shimmerResponse: Response;
      try {
        shimmerResponse = await fetch('/audio/shimmer.mp3');
        if (!shimmerResponse.ok) throw new Error('shimmer.mp3 not found');
      } catch {
        shimmerResponse = await fetch('/audio/shimmer.wav');
      }
      const shimmerArrayBuffer = await shimmerResponse.arrayBuffer();
      this.shimmerBuffer = await this.ctx.decodeAudioData(shimmerArrayBuffer);

      console.log('[AudioEngine] Loaded audio files', {
        baseline: !!this.baselineBuffer,
        coherence: !!this.coherenceBuffer,
        shimmer: !!this.shimmerBuffer,
      });
    } catch (error) {
      console.error('[AudioEngine] Failed to load audio files:', error);
      throw error;
    }
  }

  /**
   * Start session audio (baseline fade-in)
   */
  async startSession(): Promise<void> {
    if (!this.ctx || !this.isAudioLoaded) {
      await this.init();
    }

    if (this.isSessionActive) {
      console.warn('[AudioEngine] Session already active');
      return;
    }

    // Ensure audio context is running (critical for iOS)
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') {
      console.log('[AudioEngine] Audio context is suspended, attempting to resume...');
      try {
        await ctx.resume();
        console.log('[AudioEngine] Audio context resumed successfully, state:', ctx.state);
      } catch (error) {
        console.error('[AudioEngine] Failed to resume audio context:', error);
        throw new Error('Failed to resume audio context. User interaction may be required.');
      }
    }

    // Double-check state after resume attempt
    const currentState = ctx.state;
    if (currentState !== 'running') {
      console.warn('[AudioEngine] Audio context is not running. Current state:', currentState);
      // Try one more time
      try {
        await ctx.resume();
        const newState = ctx.state;
        if (newState !== 'running') {
          throw new Error(`Audio context state is ${newState} instead of 'running'`);
        }
      } catch (error) {
        console.error('[AudioEngine] Audio context failed to start:', error);
        throw error;
      }
    }

    console.log('[AudioEngine] Audio context confirmed running, state:', ctx.state);

    // Guard: prevent multiple starts
    if (this.sourcesStarted) {
      console.warn('[AudioEngine] Sources already started, skipping');
      return;
    }

    // Validate buffers are loaded
    if (!this.baselineBuffer) {
      console.error('[AudioEngine] Baseline buffer not loaded');
      throw new Error('Baseline audio buffer not loaded');
    }
    if (!this.coherenceBuffer) {
      console.error('[AudioEngine] Coherence buffer not loaded');
      throw new Error('Coherence audio buffer not loaded');
    }
    if (!this.shimmerBuffer) {
      console.warn('[AudioEngine] Shimmer buffer not loaded (will skip shimmer)');
    }

    // Reset metrics
    this.metrics = {
      totalCoherentSeconds: 0,
      longestCoherentStreakSeconds: 0,
    };
    this.coherenceState = 'baseline';
    this.coherenceEnteredAt = null;
    this.currentCoherentStreakStart = null;
    this.shimmerFadeOutStartTime = null;
    this.shimmerTargetGain = 0;
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
      baselineGain: this.baselineGain?.gain.value,
      coherenceGain: this.coherenceGain?.gain.value,
      shimmerGain: this.shimmerGain?.gain.value,
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
   * End session audio
   */
  stopSession(): void {
    if (!this.ctx || !this.isSessionActive) return;

    const now = this.ctx.currentTime;

    // Fade out all sources
    const fadeTime = 2.0;

    if (this.baselineGain) {
      const currentGain = this.baselineGain.gain.value;
      this.baselineGain.gain.cancelScheduledValues(now);
      this.baselineGain.gain.setValueAtTime(currentGain, now);
      this.baselineGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    }

    if (this.coherenceGain) {
      const currentGain = this.coherenceGain.gain.value;
      this.coherenceGain.gain.cancelScheduledValues(now);
      this.coherenceGain.gain.setValueAtTime(currentGain, now);
      this.coherenceGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    }

    if (this.shimmerGain) {
      const currentGain = Math.max(0.001, this.shimmerGain.gain.value);
      this.shimmerGain.gain.cancelScheduledValues(now);
      this.shimmerGain.gain.setValueAtTime(currentGain, now);
      // Use consistent fade-out time for shimmer
      this.shimmerGain.gain.linearRampToValueAtTime(0.001, now + CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_SECONDS);
    }

    // Stop sources after fade
    setTimeout(() => {
      try {
        this.baselineSource?.stop();
        this.coherenceSource?.stop();
        this.shimmerSource?.stop();
      } catch {
        // Ignore if already stopped
      }
      this.baselineSource = null;
      this.coherenceSource = null;
      this.shimmerSource = null;
      this.sourcesStarted = false; // Reset guard for next session
    }, (fadeTime + 0.1) * 1000);

    // Fade out fog if active
    if (this.fogGain && this.fogLowpass && this.fogEnabled) {
      this.fadeOutFog(now);
    }

    this.isSessionActive = false;
    this.coherenceState = 'baseline';
    this.coherenceEnteredAt = null;
    this.currentCoherentStreakStart = null;
    this.sourcesStarted = false; // Reset guard
    // Reset fog tracking
    this.activeMindEnteredAt = null;
    this.fogEnabled = false;

    console.log('[AudioEngine] Session stopped');
  }

  /**
   * Update coherence value (called from coherence detection)
   */
  updateCoherence(coherence: number): void {
    if (!this.ctx || !this.isSessionActive) {
      // Log why we're not updating (for debugging)
      if (!this.ctx) console.warn('[AudioEngine] updateCoherence called but ctx is null');
      if (!this.isSessionActive) console.warn('[AudioEngine] updateCoherence called but session is not active');
      return;
    }

    const now = this.ctx.currentTime;

    // Calculate coherence strength for adaptive shimmer (0-1) and smooth it
    const strength = Math.max(0, Math.min(1, (coherence - CROSSFADE_CONSTANTS.ENTER_THRESHOLD) / (1 - CROSSFADE_CONSTANTS.ENTER_THRESHOLD)));
    this.smoothedCoherenceStrength = this.smoothedCoherenceStrength * 0.9 + strength * 0.1;

    // State machine logic
    const currentTime = Date.now();

    switch (this.coherenceState) {
      case 'baseline':
        if (coherence >= CROSSFADE_CONSTANTS.ENTER_THRESHOLD) {
          // Enter stabilizing phase
          this.coherenceState = 'stabilizing';
          this.coherenceEnteredAt = currentTime;
          // Reset active mind timer - coherence is returning
          if (this.activeMindEnteredAt !== null) {
            this.activeMindEnteredAt = null;
            console.log('[AudioEngine] Coherence returning - resetting active mind timer');
          }
          // Fade out fog if it was enabled
          if (this.fogEnabled) {
            this.fadeOutFog(now);
            this.fogEnabled = false;
          }
          console.log(`[AudioEngine] ✓ Coherence ${coherence.toFixed(3)} >= ${CROSSFADE_CONSTANTS.ENTER_THRESHOLD} - Entering stabilizing phase`);
        } else {
          // Still in baseline (non-coherent) - track active mind sustain
          this.updateActiveMindSustain(currentTime, now);
        }
        break;

      case 'stabilizing':
        if (coherence < CROSSFADE_CONSTANTS.ENTER_THRESHOLD) {
          // Drop below threshold - return to baseline
          this.coherenceState = 'baseline';
          this.coherenceEnteredAt = null;
          // Start tracking active mind sustain
          this.updateActiveMindSustain(currentTime, now);
          console.log(`[AudioEngine] ✗ Coherence ${coherence.toFixed(3)} < ${CROSSFADE_CONSTANTS.ENTER_THRESHOLD} - Dropped back to baseline`);
        } else {
          // Still stabilizing - coherence is present, so reset active mind timer
          if (this.activeMindEnteredAt !== null) {
            this.activeMindEnteredAt = null;
          }
          // Fade out fog if it was enabled
          if (this.fogEnabled) {
            this.fadeOutFog(now);
            this.fogEnabled = false;
          }
          // Check if sustain time has passed
          const sustainTime = (currentTime - this.coherenceEnteredAt!) / 1000;
          if (sustainTime >= CROSSFADE_CONSTANTS.SUSTAIN_SECONDS) {
            // Enter coherent state - start crossfade
            this.coherenceState = 'coherent';
            this.currentCoherentStreakStart = currentTime;
            console.log(`[AudioEngine] ✓✓ Sustained coherence for ${sustainTime.toFixed(1)}s - Entering coherent state and starting crossfade NOW`);
            this.startCrossfadeToCoherence(now);
          } else {
            // Log progress while stabilizing (every 0.5 seconds)
            const progressSeconds = Math.floor(sustainTime * 2) / 2; // Round to 0.5s
            if (progressSeconds !== Math.floor((sustainTime - 0.1) * 2) / 2) {
              console.log(`[AudioEngine] Stabilizing: coherence ${coherence.toFixed(3)}, ${sustainTime.toFixed(1)}s / ${CROSSFADE_CONSTANTS.SUSTAIN_SECONDS}s`);
            }
          }
        }
        break;

      case 'coherent':
        if (coherence <= CROSSFADE_CONSTANTS.EXIT_THRESHOLD) {
          // Drop below exit threshold - start fade-out delay timer
          if (this.shimmerFadeOutStartTime === null) {
            // Start the fade-out delay timer
            this.shimmerFadeOutStartTime = currentTime;
            console.log(`[AudioEngine] ⚠ Coherence ${coherence.toFixed(3)} <= ${CROSSFADE_CONSTANTS.EXIT_THRESHOLD} - Starting fade-out delay timer`);
          } else {
            // Check if delay has passed
            const fadeOutDelay = (currentTime - this.shimmerFadeOutStartTime) / 1000;
            if (fadeOutDelay >= CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_DELAY_SECONDS) {
              // Delay has passed - crossfade back to baseline
              this.coherenceState = 'baseline';
              const streakEnd = currentTime;
              if (this.currentCoherentStreakStart) {
                const streakDuration = (streakEnd - this.currentCoherentStreakStart) / 1000;
                this.metrics.totalCoherentSeconds += streakDuration;
                if (streakDuration > this.metrics.longestCoherentStreakSeconds) {
                  this.metrics.longestCoherentStreakSeconds = streakDuration;
                }
                console.log(`[AudioEngine] ✗ Coherence ${coherence.toFixed(3)} <= ${CROSSFADE_CONSTANTS.EXIT_THRESHOLD} for ${fadeOutDelay.toFixed(1)}s - Exiting coherent state after ${streakDuration.toFixed(1)}s, crossfading to baseline`);
              }
              this.currentCoherentStreakStart = null;
              this.shimmerFadeOutStartTime = null;
              this.startCrossfadeToBaseline(now);
            } else {
              // Still in delay period - keep shimmer playing but prepare for fade-out
              // Gradually reduce shimmer gain during delay period
              const delayProgress = fadeOutDelay / CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_DELAY_SECONDS;
              const currentShimmerGain = this.shimmerGain?.gain.value || 0;
              const targetGain = currentShimmerGain * (1 - delayProgress * 0.3); // Reduce by 30% during delay
              this.shimmerTargetGain = targetGain;
              this.updateShimmerGainSmooth(now, targetGain, 0.5);
            }
          }
        } else {
          // Coherence recovered above exit threshold - cancel fade-out
          if (this.shimmerFadeOutStartTime !== null) {
            console.log(`[AudioEngine] ✓ Coherence ${coherence.toFixed(3)} recovered above ${CROSSFADE_CONSTANTS.EXIT_THRESHOLD} - Cancelling fade-out`);
            this.shimmerFadeOutStartTime = null;
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
          // Update shimmer gain based on coherence strength
          this.updateShimmerGain(now);
        }
        break;
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
   * Fade in fog effect (active mind)
   */
  private fadeInFog(now: number): void {
    if (!this.fogGain || !this.fogLowpass) return;

    console.log('[AudioEngine] 🌫️ Fading in fog effect');

    // Cancel any existing scheduled changes
    this.fogGain.gain.cancelScheduledValues(now);
    this.fogLowpass.frequency.cancelScheduledValues(now);

    // Get current values
    const currentGain = this.fogGain.gain.value;
    const currentFreq = this.fogLowpass.frequency.value;

    // Fade in fog gain (from current down to FOG_LEVEL)
    // FOG_LEVEL controls fog intensity: lower gain = more muffled/foggy effect
    // When fog is on, gain is reduced to FOG_LEVEL to create the foggy/muffled effect
    // Note: fogGain starts at 1.0 (no fog), ramps down to FOG_LEVEL when fog activates
    const targetGain = CROSSFADE_CONSTANTS.FOG_LEVEL;
    this.fogGain.gain.setValueAtTime(currentGain, now);
    this.fogGain.gain.linearRampToValueAtTime(
      targetGain,
      now + CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS
    );

    // Ramp down lowpass frequency (create foggy/muffled effect)
    this.fogLowpass.frequency.setValueAtTime(currentFreq, now);
    this.fogLowpass.frequency.linearRampToValueAtTime(
      CROSSFADE_CONSTANTS.FOG_LOWPASS_CLOSED,
      now + CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS
    );

    console.log('[AudioEngine] Fog fade-in scheduled', {
      gain: `${currentGain.toFixed(3)} -> ${targetGain.toFixed(3)}`,
      lowpass: `${currentFreq.toFixed(0)}Hz -> ${CROSSFADE_CONSTANTS.FOG_LOWPASS_CLOSED}Hz`,
      duration: CROSSFADE_CONSTANTS.FOG_ATTACK_SECONDS,
    });
  }

  /**
   * Fade out fog effect (coherence returning)
   */
  private fadeOutFog(now: number): void {
    if (!this.fogGain || !this.fogLowpass) return;

    console.log('[AudioEngine] 🌫️ Fading out fog effect');

    // Cancel any existing scheduled changes
    this.fogGain.gain.cancelScheduledValues(now);
    this.fogLowpass.frequency.cancelScheduledValues(now);

    // Get current values
    const currentGain = this.fogGain.gain.value;
    const currentFreq = this.fogLowpass.frequency.value;

    // Fade out fog gain (back to 1.0 for full pass-through)
    this.fogGain.gain.setValueAtTime(currentGain, now);
    this.fogGain.gain.linearRampToValueAtTime(
      1.0, // Full pass-through when fog is off
      now + CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS
    );

    // Ramp up lowpass frequency (restore clarity)
    this.fogLowpass.frequency.setValueAtTime(currentFreq, now);
    this.fogLowpass.frequency.linearRampToValueAtTime(
      CROSSFADE_CONSTANTS.FOG_LOWPASS_OPEN,
      now + CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS
    );

    console.log('[AudioEngine] Fog fade-out scheduled', {
      gain: `${currentGain.toFixed(3)} -> 1.000`,
      lowpass: `${currentFreq.toFixed(0)}Hz -> ${CROSSFADE_CONSTANTS.FOG_LOWPASS_OPEN}Hz`,
      duration: CROSSFADE_CONSTANTS.FOG_RELEASE_SECONDS,
    });
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

    // Start shimmer fade-in (smooth, after sustain)
    const shimmerTarget = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);
    this.shimmerTargetGain = shimmerTarget;
    
    // Cancel any existing fade-out
    this.shimmerFadeOutStartTime = null;
    
    // Smooth fade-in for shimmer
    this.shimmerGain.gain.cancelScheduledValues(now);
    const currentShimmerGain = Math.max(0.001, this.shimmerGain.gain.value);
    this.shimmerGain.gain.setValueAtTime(currentShimmerGain, now);
    this.shimmerGain.gain.linearRampToValueAtTime(
      shimmerTarget,
      now + CROSSFADE_CONSTANTS.SHIMMER_FADE_IN_SECONDS
    );
    
    console.log('[AudioEngine] Shimmer fading in smoothly', {
      from: currentShimmerGain.toFixed(3),
      to: shimmerTarget.toFixed(3),
      targetGain: this.shimmerTargetGain.toFixed(3),
      duration: CROSSFADE_CONSTANTS.SHIMMER_FADE_IN_SECONDS,
    });

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
    this.shimmerTargetGain = 0;
    
    console.log('[AudioEngine] Shimmer fading out smoothly', {
      from: currentShimmerGain.toFixed(3),
      to: 0,
      duration: CROSSFADE_CONSTANTS.SHIMMER_FADE_OUT_SECONDS,
    });

    console.log('[AudioEngine] Crossfading to baseline');
  }

  /**
   * Update shimmer gain based on coherence strength (adaptive)
   */
  private updateShimmerGain(now: number): void {
    if (!this.shimmerGain) return;

    const targetGain = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);
    
    this.shimmerTargetGain = targetGain;
    this.updateShimmerGainSmooth(now, targetGain, CROSSFADE_CONSTANTS.SHIMMER_UPDATE_SMOOTH_SECONDS);
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
    return this.coherenceState;
  }

  /**
   * Get coherence metrics
   */
  getCoherenceMetrics(): CoherenceMetrics {
    // Metrics are updated when coherent state ends
    // Note: longestCoherentStreakSeconds is only updated when coherent state ends
    return { ...this.metrics };
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
