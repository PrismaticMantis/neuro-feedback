// Audio Engine for Entrainment and Rewards
// Handles binaural beats, isochronic tones, and vibroacoustic rewards

import type {
  EntrainmentType,
  BinauralPreset,
  BinauralPresetName,
  IsochronicTone,
  IsochronicPreset,
  IsochronicPresetName,
} from '../types';

// Binaural beat presets for different brain states
export const BINAURAL_PRESETS: Record<Exclude<BinauralPresetName, 'custom'>, BinauralPreset> = {
  delta: {
    name: 'delta',
    label: 'Delta',
    beatFrequency: 2,
    carrierFrequency: 200,
    description: 'Deep Sleep (0.5-4 Hz)',
  },
  theta: {
    name: 'theta',
    label: 'Theta',
    beatFrequency: 6,
    carrierFrequency: 200,
    description: 'Deep Meditation (4-8 Hz)',
  },
  alpha: {
    name: 'alpha',
    label: 'Alpha',
    beatFrequency: 10,
    carrierFrequency: 200,
    description: 'Relaxed Focus (8-13 Hz)',
  },
  beta: {
    name: 'beta',
    label: 'Beta',
    beatFrequency: 20,
    carrierFrequency: 200,
    description: 'Alert Focus (13-30 Hz)',
  },
};

export const ISOCHRONIC_PRESETS: Record<IsochronicPresetName, IsochronicPreset> = {
  single_focus: {
    name: 'single_focus',
    label: 'Single Focus Pulse',
    description: 'One mid-beta focus pulse',
    tones: [
      { carrierFreq: 220, pulseFreq: 14, volume: 0.6, enabled: true },
    ],
  },
  dual_layer_focus: {
    name: 'dual_layer_focus',
    label: 'Dual Layer Focus',
    description: 'Low and mid pulses for deep focus',
    tones: [
      { carrierFreq: 200, pulseFreq: 8, volume: 0.4, enabled: true },
      { carrierFreq: 260, pulseFreq: 16, volume: 0.4, enabled: true },
    ],
  },
  deep_relax: {
    name: 'deep_relax',
    label: 'Deep Relax',
    description: 'Slow theta pulses for relaxation',
    tones: [
      { carrierFreq: 180, pulseFreq: 5, volume: 0.5, enabled: true },
    ],
  },
};

export interface AudioEngineConfig {
  entrainmentType: EntrainmentType;
  entrainmentVolume: number;
  rewardVolume: number;
  binauralCarrierFreq: number; // Base frequency for binaural (default 200Hz)
  binauralBeatFreq: number; // Beat frequency (default 10Hz for alpha)
  // Isochronic configuration now supports multiple tones
  isochronicTones: IsochronicTone[];
}

const DEFAULT_CONFIG: AudioEngineConfig = {
  entrainmentType: 'none',
  entrainmentVolume: 0.3,
  rewardVolume: 0.5,
  binauralCarrierFreq: 200,
  binauralBeatFreq: 10,
  isochronicTones: [],
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Entrainment nodes
  private entrainmentGain: GainNode | null = null;
  private binauralLeft: OscillatorNode | null = null;
  private binauralRight: OscillatorNode | null = null;
  private binauralMerger: ChannelMergerNode | null = null;

  // Isochronic voices (multiple tones)
  private isochronicVoices: {
    osc: OscillatorNode;
    lfo: OscillatorNode;
    lfoGain: GainNode;
    toneGain: GainNode;
  }[] = [];

  // Reward nodes
  private rewardGain: GainNode | null = null;
  private rewardSubOsc: OscillatorNode | null = null;
  private rewardSynthOsc: OscillatorNode | null = null;
  private rewardSynthOsc2: OscillatorNode | null = null;
  private rewardSubGain: GainNode | null = null;
  private rewardSynthGain: GainNode | null = null;
  private rewardFilter: BiquadFilterNode | null = null;
  private rewardStopTimeout: ReturnType<typeof setTimeout> | null = null;

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

    if (this.config.entrainmentType === 'none') {
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
    } else if (this.config.entrainmentType === 'isochronic') {
      this.startIsochronic(now);
    }

    // Smooth fade in with exponential curve
    // Must start from non-zero value for exponential ramp to work
    this.entrainmentGain!.gain.setValueAtTime(0.001, now);
    this.entrainmentGain!.gain.exponentialRampToValueAtTime(
      this.config.entrainmentVolume + 0.001, // Small offset for exponential
      now + 1.5
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
   * Start isochronic tones (multiple voices)
   */
  private startIsochronic(now: number): void {
    if (!this.ctx || !this.entrainmentGain) return;

    // Clean up any existing voices
    this.stopIsochronicVoices();

    // Normalize total volume across tones to avoid clipping
    const activeTones = this.config.isochronicTones.filter((t) => t.enabled && t.volume > 0);
    if (activeTones.length === 0) return;

    const maxVoices = 4;
    const tones = activeTones.slice(0, maxVoices);
    const totalVolume = tones.reduce((sum, t) => sum + t.volume, 0) || 1;
    const volumeScale = 1 / totalVolume;

    this.isochronicVoices = tones.map((tone) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = tone.carrierFreq;

      const toneGain = this.ctx!.createGain();
      toneGain.gain.value = tone.volume * volumeScale;

      const lfo = this.ctx!.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = tone.pulseFreq;

      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = 0.5;

      // LFO modulates tone gain
      lfo.connect(lfoGain);
      lfoGain.connect(toneGain.gain);

      // Connect tone to entrainment output
      osc.connect(toneGain);
      toneGain.connect(this.entrainmentGain!);

      osc.start(now);
      lfo.start(now);

      return { osc, lfo, lfoGain, toneGain };
    });
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
    // This prevents the race condition where new oscillators get stopped
    const binauralLeftToStop = this.binauralLeft;
    const binauralRightToStop = this.binauralRight;
    const isochronicVoicesToStop = [...this.isochronicVoices];

    // Clear references immediately so new ones can be created
    this.binauralLeft = null;
    this.binauralRight = null;
    this.binauralMerger = null;
    this.isochronicVoices = [];

    // Stop after fade using captured references
    setTimeout(() => {
      try {
        binauralLeftToStop?.stop();
        binauralRightToStop?.stop();
      } catch {
        // Ignore if already stopped
      }
      
      // Stop captured isochronic voices
      isochronicVoicesToStop.forEach(({ osc, lfo }) => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          // Ignore if already stopped
        }
      });
    }, 900);

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

    // If already playing, don't restart
    if (this.isRewardPlaying) return;

    // Cancel any pending stop operations
    if (this.rewardStopTimeout) {
      clearTimeout(this.rewardStopTimeout);
      this.rewardStopTimeout = null;
    }

    // Clean up any existing oscillators first
    this.cleanupRewardOscillators();

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
    this.rewardSynthOsc2 = this.ctx!.createOscillator();
    this.rewardSynthOsc2.type = 'sine';
    this.rewardSynthOsc2.frequency.value = 528 * 1.5; // Perfect fifth above
    this.rewardSynthOsc2.connect(this.rewardSynthGain);

    this.rewardSynthOsc.connect(this.rewardSynthGain);
    this.rewardSynthGain.connect(this.rewardGain!);

    // Start oscillators
    this.rewardSubOsc.start(now);
    this.rewardSynthOsc.start(now);
    this.rewardSynthOsc2.start(now);

    // Smooth fade in with exponential curve (more natural)
    const fadeInTime = 2.5; // Slightly longer for smoother entry
    // Must start from non-zero value for exponential ramp to work
    this.rewardSubGain.gain.setValueAtTime(0.001, now);
    this.rewardSubGain.gain.exponentialRampToValueAtTime(
      this.config.rewardVolume * 0.7 + 0.001, // Add small offset for exponential
      now + fadeInTime
    );

    this.rewardSynthGain.gain.setValueAtTime(0.001, now);
    this.rewardSynthGain.gain.exponentialRampToValueAtTime(
      this.config.rewardVolume * 0.15 + 0.001,
      now + fadeInTime
    );

    // Overall reward gain with smooth exponential fade
    this.rewardGain!.gain.setValueAtTime(0.001, now);
    this.rewardGain!.gain.exponentialRampToValueAtTime(1.001, now + fadeInTime);

    this.isRewardPlaying = true;
    console.log('[AudioEngine] Started reward signal');
  }

  /**
   * Clean up reward oscillators (internal helper)
   */
  private cleanupRewardOscillators(): void {
    try {
      this.rewardSubOsc?.stop();
    } catch {
      // Ignore if already stopped
    }
    try {
      this.rewardSynthOsc?.stop();
    } catch {
      // Ignore if already stopped
    }
    try {
      this.rewardSynthOsc2?.stop();
    } catch {
      // Ignore if already stopped
    }

    this.rewardSubOsc = null;
    this.rewardSynthOsc = null;
    this.rewardSynthOsc2 = null;
    this.rewardSubGain = null;
    this.rewardSynthGain = null;
    this.rewardFilter = null;
  }

  /**
   * Stop reward signal
   * Called when Quiet Power state is lost
   */
  stopReward(): void {
    if (!this.ctx || !this.isRewardPlaying) return;

    const now = this.ctx.currentTime;

    // Cancel any pending stop operations
    if (this.rewardStopTimeout) {
      clearTimeout(this.rewardStopTimeout);
      this.rewardStopTimeout = null;
    }

    // Smooth exponential fade out (more natural than linear)
    const fadeOutTime = 2.0; // Longer fade for smoother exit
    
    if (this.rewardGain) {
      const currentGain = Math.max(0.001, this.rewardGain.gain.value); // Ensure non-zero for exponential
      this.rewardGain.gain.setValueAtTime(currentGain, now);
      this.rewardGain.gain.exponentialRampToValueAtTime(0.001, now + fadeOutTime);
    }

    if (this.rewardSubGain) {
      const currentGain = Math.max(0.001, this.rewardSubGain.gain.value);
      this.rewardSubGain.gain.setValueAtTime(currentGain, now);
      this.rewardSubGain.gain.exponentialRampToValueAtTime(0.001, now + fadeOutTime);
    }

    if (this.rewardSynthGain) {
      const currentGain = Math.max(0.001, this.rewardSynthGain.gain.value);
      this.rewardSynthGain.gain.setValueAtTime(currentGain, now);
      this.rewardSynthGain.gain.exponentialRampToValueAtTime(0.001, now + fadeOutTime);
    }

    // Stop oscillators after fade completes
    this.rewardStopTimeout = setTimeout(() => {
      this.cleanupRewardOscillators();
      this.rewardStopTimeout = null;
    }, (fadeOutTime + 0.1) * 1000);

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
   * Set binaural carrier frequency (Hz)
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
   * Set isochronic pulse frequency (Hz)
   */
  setIsochronicFreq(freq: number): void {
    // Backwards-compat shim: apply same pulseFreq to all tones
    this.config.isochronicTones = this.config.isochronicTones.map((tone) => ({
      ...tone,
      pulseFreq: freq,
    }));

    if (this.isochronicVoices.length && this.ctx) {
      this.isochronicVoices.forEach((voice) => {
        voice.lfo.frequency.setTargetAtTime(freq, this.ctx!.currentTime, 0.5);
      });
    }
  }

  /**
   * Replace current isochronic tones
   */
  setIsochronicTones(tones: IsochronicTone[]): void {
    this.config.isochronicTones = tones;

    // If isochronic is currently playing, rebuild voices
    if (this.isEntrainmentPlaying && this.config.entrainmentType === 'isochronic') {
      const now = this.ctx ? this.ctx.currentTime : 0;
      this.startIsochronic(now);
    }
  }

  /**
   * Apply an isochronic preset
   */
  applyIsochronicPreset(name: IsochronicPresetName): void {
    const preset = ISOCHRONIC_PRESETS[name];
    if (!preset) return;

    // Generate ids for tones
    const tones: IsochronicTone[] = preset.tones.map((t, index) => ({
      ...t,
      id: `${name}-${index}`,
    }));

    this.setIsochronicTones(tones);
  }

  /**
   * Update a single isochronic tone
   */
  updateIsochronicTone(id: string, partial: Partial<IsochronicTone>): void {
    this.setIsochronicTones(
      this.config.isochronicTones.map((tone) =>
        tone.id === id ? { ...tone, ...partial } : tone
      )
    );
  }

  /**
   * Stop and clean up all isochronic voices (with fade out)
   */
  private stopIsochronicVoices(): void {
    if (!this.ctx || this.isochronicVoices.length === 0) return;

    const now = this.ctx.currentTime;
    const voicesToStop = [...this.isochronicVoices];
    this.isochronicVoices = [];
    
    voicesToStop.forEach(({ osc, lfo, toneGain }) => {
      toneGain.gain.setTargetAtTime(0, now, 0.2);
      try {
        osc.stop(now + 0.25);
        lfo.stop(now + 0.25);
      } catch {
        // ignore double-stop
      }
    });
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

    // Cancel any pending timeouts
    if (this.rewardStopTimeout) {
      clearTimeout(this.rewardStopTimeout);
      this.rewardStopTimeout = null;
    }

    // Immediate cleanup
    this.cleanupRewardOscillators();

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
