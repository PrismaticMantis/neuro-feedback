// Audio Engine for Entrainment and Rewards
// Handles binaural beats, isochronic tones, and vibroacoustic rewards

import type { EntrainmentType } from '../types';

export interface AudioEngineConfig {
  entrainmentType: EntrainmentType;
  entrainmentVolume: number;
  rewardVolume: number;
  binauralCarrierFreq: number; // Base frequency for binaural (default 200Hz)
  binauralBeatFreq: number; // Beat frequency (default 10Hz for alpha)
  isochronicFreq: number; // Isochronic pulse frequency (default 10Hz)
  isochronicToneFreq: number; // Tone frequency (default 200Hz)
}

const DEFAULT_CONFIG: AudioEngineConfig = {
  entrainmentType: 'none',
  entrainmentVolume: 0.3,
  rewardVolume: 0.5,
  binauralCarrierFreq: 200,
  binauralBeatFreq: 10,
  isochronicFreq: 10,
  isochronicToneFreq: 200,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Entrainment nodes
  private entrainmentGain: GainNode | null = null;
  private binauralLeft: OscillatorNode | null = null;
  private binauralRight: OscillatorNode | null = null;
  private binauralMerger: ChannelMergerNode | null = null;
  private isochronicOsc: OscillatorNode | null = null;
  private isochronicLfo: OscillatorNode | null = null;
  private isochronicLfoGain: GainNode | null = null;
  private isochronicToneGain: GainNode | null = null;

  // Reward nodes
  private rewardGain: GainNode | null = null;
  private rewardSubOsc: OscillatorNode | null = null;
  private rewardSynthOsc: OscillatorNode | null = null;
  private rewardSubGain: GainNode | null = null;
  private rewardSynthGain: GainNode | null = null;
  private rewardFilter: BiquadFilterNode | null = null;

  private config: AudioEngineConfig;
  private isEntrainmentPlaying = false;
  private isRewardPlaying = false;

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

    // Create reward gain
    this.rewardGain = this.ctx.createGain();
    this.rewardGain.gain.value = 0;
    this.rewardGain.connect(this.masterGain);

    console.log('[AudioEngine] Initialized');
  }

  /**
   * Start entrainment audio
   */
  async startEntrainment(type?: EntrainmentType): Promise<void> {
    if (!this.ctx || !this.entrainmentGain) {
      await this.init();
    }

    if (type) {
      this.config.entrainmentType = type;
    }

    if (this.config.entrainmentType === 'none') {
      this.stopEntrainment();
      return;
    }

    this.stopEntrainment(); // Clean up any existing

    const now = this.ctx!.currentTime;

    if (this.config.entrainmentType === 'binaural') {
      this.startBinaural(now);
    } else if (this.config.entrainmentType === 'isochronic') {
      this.startIsochronic(now);
    }

    // Fade in
    this.entrainmentGain!.gain.setValueAtTime(0, now);
    this.entrainmentGain!.gain.linearRampToValueAtTime(
      this.config.entrainmentVolume,
      now + 2
    );

    this.isEntrainmentPlaying = true;
    console.log(`[AudioEngine] Started ${this.config.entrainmentType} entrainment`);
  }

  /**
   * Start binaural beats
   */
  private startBinaural(now: number): void {
    if (!this.ctx || !this.entrainmentGain) return;

    const { binauralCarrierFreq, binauralBeatFreq } = this.config;

    // Create stereo merger
    this.binauralMerger = this.ctx.createChannelMerger(2);
    this.binauralMerger.connect(this.entrainmentGain);

    // Left ear - carrier frequency
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
   * Start isochronic tones
   */
  private startIsochronic(now: number): void {
    if (!this.ctx || !this.entrainmentGain) return;

    const { isochronicFreq, isochronicToneFreq } = this.config;

    // Create tone oscillator
    this.isochronicOsc = this.ctx.createOscillator();
    this.isochronicOsc.type = 'sine';
    this.isochronicOsc.frequency.value = isochronicToneFreq;

    // Create tone gain (for amplitude modulation)
    this.isochronicToneGain = this.ctx.createGain();
    this.isochronicToneGain.gain.value = 0;

    // Create LFO for pulsing
    this.isochronicLfo = this.ctx.createOscillator();
    this.isochronicLfo.type = 'square';
    this.isochronicLfo.frequency.value = isochronicFreq;

    // LFO gain controls depth of modulation
    this.isochronicLfoGain = this.ctx.createGain();
    this.isochronicLfoGain.gain.value = 0.5;

    // Connect LFO to tone gain
    this.isochronicLfo.connect(this.isochronicLfoGain);
    this.isochronicLfoGain.connect(this.isochronicToneGain.gain);

    // Connect tone to output
    this.isochronicOsc.connect(this.isochronicToneGain);
    this.isochronicToneGain.connect(this.entrainmentGain);

    // Set base gain (LFO oscillates around this)
    this.isochronicToneGain.gain.value = 0.5;

    this.isochronicOsc.start(now);
    this.isochronicLfo.start(now);
  }

  /**
   * Stop entrainment audio
   */
  stopEntrainment(): void {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Fade out
    if (this.entrainmentGain) {
      this.entrainmentGain.gain.setValueAtTime(this.entrainmentGain.gain.value, now);
      this.entrainmentGain.gain.linearRampToValueAtTime(0, now + 0.5);
    }

    // Stop after fade
    setTimeout(() => {
      this.binauralLeft?.stop();
      this.binauralRight?.stop();
      this.isochronicOsc?.stop();
      this.isochronicLfo?.stop();

      this.binauralLeft = null;
      this.binauralRight = null;
      this.binauralMerger = null;
      this.isochronicOsc = null;
      this.isochronicLfo = null;
      this.isochronicLfoGain = null;
      this.isochronicToneGain = null;
    }, 600);

    this.isEntrainmentPlaying = false;
    console.log('[AudioEngine] Stopped entrainment');
  }

  /**
   * Start reward signal (vibroacoustic + subtle synth)
   * Called when Quiet Power state is achieved
   */
  async startReward(): Promise<void> {
    if (!this.ctx || !this.rewardGain) {
      await this.init();
    }

    if (this.isRewardPlaying) return;

    const now = this.ctx!.currentTime;

    // === Sub-bass layer (vibroacoustic) ===
    this.rewardSubOsc = this.ctx!.createOscillator();
    this.rewardSubOsc.type = 'sine';
    this.rewardSubOsc.frequency.value = 40; // 40Hz sub-bass

    this.rewardSubGain = this.ctx!.createGain();
    this.rewardSubGain.gain.value = 0;

    // Low-pass filter for cleaner sub
    this.rewardFilter = this.ctx!.createBiquadFilter();
    this.rewardFilter.type = 'lowpass';
    this.rewardFilter.frequency.value = 80;
    this.rewardFilter.Q.value = 0.7;

    this.rewardSubOsc.connect(this.rewardFilter);
    this.rewardFilter.connect(this.rewardSubGain);
    this.rewardSubGain.connect(this.rewardGain!);

    // === Subtle synth layer (mystical "aha" tone) ===
    this.rewardSynthOsc = this.ctx!.createOscillator();
    this.rewardSynthOsc.type = 'triangle';
    this.rewardSynthOsc.frequency.value = 528; // 528Hz - "love frequency"

    this.rewardSynthGain = this.ctx!.createGain();
    this.rewardSynthGain.gain.value = 0;

    // Add subtle detuned second osc for shimmer
    const synthOsc2 = this.ctx!.createOscillator();
    synthOsc2.type = 'sine';
    synthOsc2.frequency.value = 528 * 1.5; // Perfect fifth above
    synthOsc2.connect(this.rewardSynthGain);
    synthOsc2.start(now);

    this.rewardSynthOsc.connect(this.rewardSynthGain);
    this.rewardSynthGain.connect(this.rewardGain!);

    // Start oscillators
    this.rewardSubOsc.start(now);
    this.rewardSynthOsc.start(now);

    // Fade in smoothly over 2 seconds
    this.rewardSubGain.gain.setValueAtTime(0, now);
    this.rewardSubGain.gain.linearRampToValueAtTime(
      this.config.rewardVolume * 0.7,
      now + 2
    );

    this.rewardSynthGain.gain.setValueAtTime(0, now);
    this.rewardSynthGain.gain.linearRampToValueAtTime(
      this.config.rewardVolume * 0.15,
      now + 2
    );

    // Overall reward gain
    this.rewardGain!.gain.setValueAtTime(0, now);
    this.rewardGain!.gain.linearRampToValueAtTime(1, now + 2);

    this.isRewardPlaying = true;
    console.log('[AudioEngine] Started reward signal');
  }

  /**
   * Stop reward signal
   * Called when Quiet Power state is lost
   */
  stopReward(): void {
    if (!this.ctx || !this.isRewardPlaying) return;

    const now = this.ctx.currentTime;

    // Fade out over 1.5 seconds
    if (this.rewardGain) {
      this.rewardGain.gain.setValueAtTime(this.rewardGain.gain.value, now);
      this.rewardGain.gain.linearRampToValueAtTime(0, now + 1.5);
    }

    // Stop oscillators after fade
    setTimeout(() => {
      this.rewardSubOsc?.stop();
      this.rewardSynthOsc?.stop();

      this.rewardSubOsc = null;
      this.rewardSynthOsc = null;
      this.rewardSubGain = null;
      this.rewardSynthGain = null;
      this.rewardFilter = null;
    }, 1600);

    this.isRewardPlaying = false;
    console.log('[AudioEngine] Stopped reward signal');
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
   * Set reward volume (0-1)
   */
  setRewardVolume(volume: number): void {
    this.config.rewardVolume = Math.max(0, Math.min(1, volume));
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
   * Set isochronic pulse frequency (Hz)
   */
  setIsochronicFreq(freq: number): void {
    this.config.isochronicFreq = freq;
    if (this.isochronicLfo && this.ctx) {
      this.isochronicLfo.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
    }
  }

  /**
   * Get current config
   */
  getConfig(): AudioEngineConfig {
    return { ...this.config };
  }

  /**
   * Check if entrainment is playing
   */
  get entrainmentPlaying(): boolean {
    return this.isEntrainmentPlaying;
  }

  /**
   * Check if reward is playing
   */
  get rewardPlaying(): boolean {
    return this.isRewardPlaying;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.stopEntrainment();
    this.stopReward();

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
