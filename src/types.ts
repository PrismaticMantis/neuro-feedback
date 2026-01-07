// Core type definitions for the Neuro-Somatic Feedback App

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
  quietPowerTime: number; // ms in target state
  longestStreak: number; // ms longest continuous
  avgCoherence: number; // 0-1
  coherenceHistory: number[]; // time-series for graph
}

export interface BrainwaveBands {
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
  bands: BrainwaveBands;
  bandsSmooth: BrainwaveBands;
  relaxationIndex: number;
  meditationIndex: number;
  focusIndex: number;
}

export interface QuietPowerState {
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

export type AppScreen = 'setup' | 'session' | 'summary';

export interface SessionStats {
  totalLength: number;
  longestStreak: number;
  avgCoherence: number;
  quietPowerPercent: number;
  achievementScore: string;
}
