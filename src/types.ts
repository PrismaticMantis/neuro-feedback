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

/** Relative-mode gates vs calibrated baseline (Easy path). */
export interface CoherenceRelativeGateDebug {
  betaAlphaMax: number;
  varianceMax: number;
  alphaMin: number;
  ratio: number;
  variance: number;
  alpha: number;
  betaAlphaOk: boolean;
  varianceOk: boolean;
  alphaOk: boolean;
}

/** Optional; set when `CoherenceConfig.emitDwellDiagnostics` (WebSocket / bridge debug; Muse omits). */
export interface CoherenceDwellDiagnostics {
  /** Effective detector state for dwell; may be true during a short configured grace window. */
  conditionsMet: boolean;
  /** Strict gate state before any dwell grace is applied. */
  conditionsMetRaw?: boolean;
  /** True when a short strict-gate miss is being tolerated to avoid resetting dwell. */
  dwellGraceActive?: boolean;
  conditionBreakGraceMs?: number;
  coherencePath: 'absolute' | 'relative';
  /** Easy mode before baseline cal finishes: still using absolute thresholds. */
  pathDetail: 'absolute' | 'relative' | 'absolute-prebaseline';
  baselineCalComplete: boolean;
  useRelativeMode: boolean;
  dwellBlocker: string | null;
  signalValid: boolean;
  hasAlphaFloor: boolean;
  hasAlphaCeiling?: boolean;
  /** Effective `bands.alpha >= signalValidMinAlpha` threshold (default 0.02). */
  signalValidMinAlpha?: number;
  /** Live `bands.alpha` for signal-valid gate. */
  bandsAlpha?: number;
  /** Set when `baselineCalComplete` and relative mode; shows live vs baseline caps. */
  relativeGate?: CoherenceRelativeGateDebug | null;
  /** Mean detector α over the first 15s session window (`null` until computed). */
  alphaBaselinePower?: number | null;
  /** EMA α used for the α-floor safeguard vs baseline. */
  smoothedAlphaPower?: number | null;
  /** Minimum smoothed α required once baseline exists (`baseline × alphaFloorBaselineRatio`). */
  alphaFloorMin?: number | null;
  /** Effective ratio (default 0.5; BrainBit config may lower). */
  alphaFloorBaselineRatio?: number;
  /** True after the 15s baseline mean has been established. */
  alphaBaselineWindowComplete?: boolean;
  alphaCeilingMax?: number | null;
  alphaCeilingBaselineRatio?: number;
}

/** Optional relay / band hints when debugging BrainBit Capsule WebSocket path. */
export interface BrainBitCoherenceDebugExtras {
  relayChunkSeq: number | null;
  relayAcceptedTotal: number;
  timeSinceLastUpdateMs: number;
  detectorGamma: number;
  detectorTheta: number;
  fftNominalHz: number;
  chunkImpliedHz: number | null;
}

export interface BrainBitAuditDebugSnapshot {
  enabled: boolean;
  allBands: BrainwaveBands | null;
  corticalBands: BrainwaveBands | null;
  allBandsDb: BrainwaveBandsDb | null;
  corticalBandsDb: BrainwaveBandsDb | null;
  selectedLabels: string[];
  allLabels: string[];
  contactPerChannel: {
    label: string;
    horseshoe: number;
    absAmp: number;
    variance: number;
    rule: string;
  }[];
}

export interface CoherenceStatus {
  isActive: boolean;
  sustainedMs: number;
  betaAlphaRatio: number;
  signalVariance: number;
  noiseLevel: number;
  dwellDiagnostics?: CoherenceDwellDiagnostics;
}

/** Audio engine reward path — `audioEngine.getAudioRewardDebugSnapshot()` (Athena debug only). */
export interface AthenaAudioRewardDebug {
  sessionActive: boolean;
  audioSmState: 'baseline' | 'stabilizing' | 'coherent';
  smLeftBaseline: boolean;
  /** Progress toward `coherent` while in `stabilizing` (time / enterSustainSeconds). */
  smEnterSustainProgress01: number;
  smEnterSustainTargetSec: number;
  sustainedLayerActive: boolean;
  sustainedAccumSec: number;
  sustainedHoldTargetSec: number;
  sustainedThreshold: number;
  gainBaseline: number | null;
  gainCoherence: number | null;
  gainSustained: number | null;
  gainShimmer: number | null;
  /** Coherence or sustained track meaningfully open. */
  coherentFamilyAudible: boolean;
  crossfadeAttackSec: number;
  rewardPathHint: string;
}

/** Populated only when `VITE_DEBUG_ATHENA_COHERENCE` and Athena bridge device (see `useMuse`). */
export interface AthenaCoherenceDebugSnapshot {
  coherence: number;
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  flowActive: boolean;
  sustainedMs: number;
  sustainedTargetMs: number;
  betaAlphaRatio: number;
  betaAlphaRatioThreshold: number;
  signalVariance: number;
  varianceThreshold: number;
  noiseLevel: number;
  noiseThreshold: number;
  /** `min(1, |acc|/30)` — Muse has real accel; Athena bridge is always 0. */
  normalizedMotion: number;
  motionRaw: number;
  /** Per-channel horseshoe average (1→1, 2→0.5) used in coherenceDetector + calculateCoherence */
  electrodeQuality: number;
  /** Site-weighted metric shown in UI state */
  connectionQualityMetric: number;
  touching: boolean;
  bandsSmooth: BrainwaveBands;
  totalBandPower: number;
  useRelativeMode: boolean;
  minSignalPower: number;
  minVariance: number;
  /** Dwell / detector path (Athena coherence debug). */
  conditionsMet: boolean;
  conditionsMetRaw?: boolean;
  dwellGraceActive?: boolean;
  conditionBreakGraceMs?: number;
  coherencePath: 'absolute' | 'relative';
  baselineCalComplete: boolean;
  dwellBlocker: string | null;
  dwellProgress: number;
  flowEdge: 'enter' | 'exit' | 'none';
  signalValid: boolean;
  hasAlphaFloor: boolean;
  hasAlphaCeiling?: boolean;
  /** Detector `signalValid` α floor (0.02 Muse; BrainBit may be lower). */
  signalValidMinAlpha?: number;
  /** Same-frame `bandsSmooth.alpha` vs `signalValidMinAlpha`. */
  bandsAlphaForValidity?: number;
  pathDetail: 'absolute' | 'relative' | 'absolute-prebaseline';
  relativeGate: CoherenceRelativeGateDebug | null;
  /** Session-time fraction on relative path (0–1). */
  pathRelativeFraction: number;
  pathRelativeSec: number;
  pathAbsoluteSec: number;
  /** Detector `isActive` was true at least once this connection. */
  detectorFlowEver: boolean;
  /** Approx. seconds cumulatively in detector flow (`isActive`) this connection. */
  detectorActiveSec: number;
  /** Mean contact 0–1 fed to audio `SignalQuality` (not the 75% “strong” metric). */
  audioContactAvg: number;
  audioSignalOkForStateMachine: boolean;
  /** Audio SM enter threshold for current device + Easy/Med preset (Athena vs Muse). */
  audioSmEnterThreshold: number;
  gapToAudioSmEnter: number;
  /** UI `getCoherenceZone` flow cutoff for current device + preset (Athena uses a lower floor). */
  uiFlowThreshold: number;
  gapToUiFlow: number;
  /** Heuristic: where the subjective “stuck” feeling most likely comes from. */
  bottleneckHint: string;
  /** Live audio SM + gains + sustained/shimmer (null if AudioContext not created). */
  audioReward: AthenaAudioRewardDebug | null;
  /** BrainBit relay + detector-band artifact proxies (movement: γ, stream gaps). */
  brainBitExtras?: BrainBitCoherenceDebugExtras;
  /** BrainBit-only synthetic movement score from contact-pressure instability (0–1). */
  brainBitContactArtifact01?: number;
  /** Copy of α-floor fields from dwell diagnostics for compact UI. */
  alphaBaselinePower?: number | null;
  smoothedAlphaPower?: number | null;
  alphaFloorMin?: number | null;
  alphaFloorBaselineRatio?: number;
  alphaBaselineWindowComplete?: boolean;
  alphaCeilingMax?: number | null;
  alphaCeilingBaselineRatio?: number;
  /** Pre-`scoreScale` coherence (BrainBit `calculateCoherence` only). */
  brainBitCoherenceRaw?: number;
  /** `scoreScale` applied to raw coherence for UI/audio (BrainBit only). */
  brainBitCoherenceScoreScale?: number;
  /** Capsule horseshoe integers per channel (1…4); BrainBit debug only. */
  brainBitElectrodeHorseshoe?: number[];
  brainBitAudit?: BrainBitAuditDebugSnapshot;
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

/** Legacy Muse 2 four-site map — kept for APIs and fallback when `electrodeSites` is empty. */
export interface ElectrodeStatus {
  tp9: ElectrodeQuality;  // Left ear
  af7: ElectrodeQuality;  // Left forehead
  af8: ElectrodeQuality;  // Right forehead
  tp10: ElectrodeQuality; // Right ear
}

/** Per-site contact (device-agnostic) — see `horseshoeToElectrodeModel` in eeg/electrode-sites.ts */
export interface ElectrodeSiteContact {
  siteId: string;
  label: string;
  quality: ElectrodeQuality;
}

export type AppScreen = 'setup' | 'session' | 'summary';

export interface SessionStats {
  totalLength: number;
  longestStreak: number;
  avgCoherence: number;
  coherencePercent: number;
  achievementScore: string;
}
