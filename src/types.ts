// Core type definitions for the Neuro-Somatic Feedback App

/**
 * Connection Health State for Muse device
 * 
 * IMPORTANT: Used to prevent false "disconnected" states during brief data stalls.
 * 
 * - 'healthy': BLE connected AND receiving data normally
 * - 'stalled': BLE connected but data temporarily paused (<10s) - show connected state
 * - 'reconnecting': BLE connected but data stalled (10-30s), attempting recovery - show "Reconnecting..."
 * - 'disconnected': GATT disconnect fired OR recovery failed after 30s - show "Disconnected"
 */
export type ConnectionHealthState = 'healthy' | 'stalled' | 'reconnecting' | 'disconnected';

export interface User {
  id: string;
  name: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  startTime: string;
  endTime: string;
  duration: number; // ms
  coherenceTime: number; // ms in coherence state
  longestStreak: number; // ms longest continuous
  avgCoherence: number; // 0-1
  coherenceHistory: number[]; // time-series for graph
  // PPG/Heart metrics (null when PPG data unavailable)
  avgHeartRate?: number | null;   // Average BPM over session (from Muse 2 PPG)
  avgHRV?: number | null;         // RMSSD of inter-beat intervals (ms)
  // Recovery points (6–15 scale, derived from coherence + stability)
  recoveryPoints?: number | null;
}

export interface BrainwaveBands {
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
}

// Absolute power in dB (10 * log10(µV²/Hz))
export interface BrainwaveBandsDb {
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
}

export interface MuseState {
  connected: boolean;
  connectionMode: 'bluetooth' | 'osc' | null;
  deviceName: string | null;
  touching: boolean;
  connectionQuality: number;
  batteryLevel: number;             // Battery percentage (0-100), -1 if unknown
  healthState?: ConnectionHealthState; // Connection health for UI display (optional for backward compat)
  bands: BrainwaveBands;
  bandsSmooth: BrainwaveBands;
  bandsDb: BrainwaveBandsDb;        // Absolute power in dB
  bandsDbSmooth: BrainwaveBandsDb;  // Smoothed dB values
  relaxationIndex: number;
  meditationIndex: number;
  focusIndex: number;
}

export interface CoherenceStatus {
  isActive: boolean;
  sustainedMs: number;
  betaAlphaRatio: number;
  signalVariance: number;
  noiseLevel: number;
}

export type EntrainmentType = 'binaural' | 'isochronic' | 'none';

export interface AudioSettings {
  entrainmentType: EntrainmentType;
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  rewardEnabled: boolean;
  rewardVolume: number;
}

// Threshold settings for Coherence detection
export interface ThresholdSettings {
  coherenceSensitivity: number; // 0-1, default 0.5 (medium difficulty)
  // Derived values (calculated from sensitivity):
  // - coherenceThreshold: 0.2 (easy) to 0.9 (hard)
  // - timeThreshold: 1000ms (easy) to 10000ms (hard)
}

// Binaural beat presets
export type BinauralPresetName = 'delta' | 'theta' | 'alpha' | 'beta' | 'custom';

export interface BinauralPreset {
  name: BinauralPresetName;
  label: string;
  beatFrequency: number; // Hz
  carrierFrequency: number; // Hz
  description: string;
}

// Isochronic tones (multiple simultaneous voices)
export interface IsochronicTone {
  id: string;
  carrierFreq: number; // Hz - audio tone frequency
  pulseFreq: number; // Hz - on/off modulation frequency
  volume: number; // 0-1
  enabled: boolean;
}

export type IsochronicPresetName = 'single_focus' | 'dual_layer_focus' | 'deep_relax';

export interface IsochronicPreset {
  name: IsochronicPresetName;
  label: string;
  description: string;
  tones: Omit<IsochronicTone, 'id'>[];
}

// Electrode contact quality (from Muse horseshoe indicator)
export type ElectrodeQuality = 'good' | 'medium' | 'poor' | 'off';

export interface ElectrodeStatus {
  tp9: ElectrodeQuality;  // Left ear
  af7: ElectrodeQuality;  // Left forehead
  af8: ElectrodeQuality;  // Right forehead
  tp10: ElectrodeQuality; // Right ear
}

export type AppScreen = 'setup' | 'session' | 'summary';

export interface SessionStats {
  totalLength: number;
  longestStreak: number;
  avgCoherence: number;
  coherencePercent: number;
  achievementScore: string;
}
