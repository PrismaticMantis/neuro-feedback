// Audio Engine for Entrainment and Coherence Crossfade
// Handles WAV-based baseline/coherence crossfade, shimmer layer, and binaural beats

import type {
  EntrainmentType,
  BinauralPreset,
  BinauralPresetName,
} from '../types';

// Crossfade constants (centralized for easy tweaking)
const CROSSFADE_CONSTANTS = {
  ENTER_THRESHOLD: 0.75,
  EXIT_THRESHOLD: 0.65,
  SUSTAIN_SECONDS: 3.0,
  ATTACK_SECONDS: 3.5,
  RELEASE_SECONDS: 6.0,
  START_FADE_SECONDS: 4.0,
  SHIMMER_BASE_GAIN: 0.10,
  SHIMMER_MAX_GAIN: 0.25,
  SHIMMER_RANGE: 0.15, // max - base
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

  // WAV buffers
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

  private config: AudioEngineConfig;
  private isEntrainmentPlaying = false;
  private isAudioLoaded = false;
  private isSessionActive = false;

  constructor(config: Partial<AudioEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize audio context (must be called after user gesture)
   */
  async init(): Promise<void> {
    if (this.ctx) return;

    this.ctx = new AudioContext();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
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

    this.isAudioLoaded = true;
    console.log('[AudioEngine] Initialized with WAV crossfade system');
  }

  /**
   * Load WAV audio files from /public/audio
   */
  private async loadAudioFiles(): Promise<void> {
    if (!this.ctx) throw new Error('AudioContext not initialized');

    try {
      // Load baseline.wav
      const baselineResponse = await fetch('/audio/baseline.wav');
      const baselineArrayBuffer = await baselineResponse.arrayBuffer();
      this.baselineBuffer = await this.ctx.decodeAudioData(baselineArrayBuffer);

      // Load coherence.wav
      const coherenceResponse = await fetch('/audio/coherence.wav');
      const coherenceArrayBuffer = await coherenceResponse.arrayBuffer();
      this.coherenceBuffer = await this.ctx.decodeAudioData(coherenceArrayBuffer);

      // Load shimmer.wav
      const shimmerResponse = await fetch('/audio/shimmer.wav');
      const shimmerArrayBuffer = await shimmerResponse.arrayBuffer();
      this.shimmerBuffer = await this.ctx.decodeAudioData(shimmerArrayBuffer);

      console.log('[AudioEngine] Loaded audio files');
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

    if (this.isSessionActive) return;

    // Ensure audio context is running
    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume();
    }

    // Reset metrics
    this.metrics = {
      totalCoherentSeconds: 0,
      longestCoherentStreakSeconds: 0,
    };
    this.coherenceState = 'baseline';
    this.coherenceEnteredAt = null;
    this.currentCoherentStreakStart = null;

    const now = this.ctx!.currentTime;

    // Create and start baseline source (looped)
    if (this.baselineBuffer && this.baselineGain) {
      this.baselineSource = this.ctx!.createBufferSource();
      this.baselineSource.buffer = this.baselineBuffer;
      this.baselineSource.loop = true;
      this.baselineSource.connect(this.baselineGain);
      this.baselineSource.start(now);
    }

    // Create and start coherence source (looped, muted)
    if (this.coherenceBuffer && this.coherenceGain) {
      this.coherenceSource = this.ctx!.createBufferSource();
      this.coherenceSource.buffer = this.coherenceBuffer;
      this.coherenceSource.loop = true;
      this.coherenceSource.connect(this.coherenceGain);
      this.coherenceSource.start(now); // Start at same time for sync
    }

    // Create and start shimmer source (looped, muted)
    if (this.shimmerBuffer && this.shimmerGain) {
      this.shimmerSource = this.ctx!.createBufferSource();
      this.shimmerSource.buffer = this.shimmerBuffer;
      this.shimmerSource.loop = true;
      this.shimmerSource.connect(this.shimmerGain);
      this.shimmerSource.start(now); // Start at same time for sync
    }

    // Fade in baseline (session start)
    if (this.baselineGain) {
      this.baselineGain.gain.setValueAtTime(0, now);
      this.baselineGain.gain.linearRampToValueAtTime(
        1.0,
        now + CROSSFADE_CONSTANTS.START_FADE_SECONDS
      );
    }

    this.isSessionActive = true;
    console.log('[AudioEngine] Session started with baseline fade-in');
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
      const currentGain = this.shimmerGain.gain.value;
      this.shimmerGain.gain.cancelScheduledValues(now);
      this.shimmerGain.gain.setValueAtTime(currentGain, now);
      this.shimmerGain.gain.linearRampToValueAtTime(0, now + fadeTime);
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
    }, (fadeTime + 0.1) * 1000);

    this.isSessionActive = false;
    this.coherenceState = 'baseline';
    this.coherenceEnteredAt = null;
    this.currentCoherentStreakStart = null;

    console.log('[AudioEngine] Session stopped');
  }

  /**
   * Update coherence value (called from coherence detection)
   */
  updateCoherence(coherence: number): void {
    if (!this.ctx || !this.isSessionActive) return;

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
        }
        break;

      case 'stabilizing':
        if (coherence < CROSSFADE_CONSTANTS.ENTER_THRESHOLD) {
          // Drop below threshold - return to baseline
          this.coherenceState = 'baseline';
          this.coherenceEnteredAt = null;
        } else {
          // Check if sustain time has passed
          const sustainTime = (currentTime - this.coherenceEnteredAt!) / 1000;
          if (sustainTime >= CROSSFADE_CONSTANTS.SUSTAIN_SECONDS) {
            // Enter coherent state - start crossfade
            this.coherenceState = 'coherent';
            this.currentCoherentStreakStart = currentTime;
            this.startCrossfadeToCoherence(now);
          }
        }
        break;

      case 'coherent':
        if (coherence <= CROSSFADE_CONSTANTS.EXIT_THRESHOLD) {
          // Drop below exit threshold - crossfade back to baseline
          this.coherenceState = 'baseline';
          const streakEnd = currentTime;
          if (this.currentCoherentStreakStart) {
            const streakDuration = (streakEnd - this.currentCoherentStreakStart) / 1000;
            this.metrics.totalCoherentSeconds += streakDuration;
            if (streakDuration > this.metrics.longestCoherentStreakSeconds) {
              this.metrics.longestCoherentStreakSeconds = streakDuration;
            }
          }
          this.currentCoherentStreakStart = null;
          this.startCrossfadeToBaseline(now);
        } else {
          // Update shimmer gain based on coherence strength
          this.updateShimmerGain(now);
        }
        break;
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

    // Start shimmer fade-in (after sustain)
    const shimmerTarget = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);
    this.shimmerGain.gain.setValueAtTime(0, now);
    this.shimmerGain.gain.linearRampToValueAtTime(
      shimmerTarget,
      now + CROSSFADE_CONSTANTS.ATTACK_SECONDS
    );

    console.log('[AudioEngine] Crossfading to coherence');
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

    // Fade out shimmer
    this.shimmerGain.gain.setValueAtTime(currentShimmer, now);
    this.shimmerGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_CONSTANTS.RELEASE_SECONDS);

    console.log('[AudioEngine] Crossfading to baseline');
  }

  /**
   * Update shimmer gain based on coherence strength (adaptive)
   */
  private updateShimmerGain(now: number): void {
    if (!this.shimmerGain) return;

    const targetGain = CROSSFADE_CONSTANTS.SHIMMER_BASE_GAIN + 
      (this.smoothedCoherenceStrength * CROSSFADE_CONSTANTS.SHIMMER_RANGE);

    // Smoothly transition to target
    this.shimmerGain.gain.cancelScheduledValues(now);
    const currentGain = this.shimmerGain.gain.value;
    this.shimmerGain.gain.setValueAtTime(currentGain, now);
    this.shimmerGain.gain.linearRampToValueAtTime(targetGain, now + 0.5);
  }

  /**
   * Start entrainment audio (binaural beats only)
   */
  async startEntrainment(type?: EntrainmentType): Promise<void> {
    if (!this.ctx || !this.entrainmentGain) {
      await this.init();
    }

    // Ensure audio context is running
    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume();
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
    if (!this.ctx || !this.entrainmentGain) return;

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

    // Capture current oscillator references before setTimeout
    const binauralLeftToStop = this.binauralLeft;
    const binauralRightToStop = this.binauralRight;

    // Clear references immediately
    this.binauralLeft = null;
    this.binauralRight = null;
    this.binauralMerger = null;

    // Stop after fade
    setTimeout(() => {
      try {
        binauralLeftToStop?.stop();
        binauralRightToStop?.stop();
      } catch {
        // Ignore if already stopped
      }
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
