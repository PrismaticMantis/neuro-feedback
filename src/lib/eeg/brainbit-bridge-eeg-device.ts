/**
 * EEGDevice for the native macOS BrainBit Capsule relay (SwiftNIO WebSocket JSON).
 * Does not use muse-js. Muse 2 path is unchanged when this device is not selected.
 *
 * Payload: { type: "eeg", labels, samples: [channel][sampleIndex], sampleCount, channelCount, timestamp }
 */

import type { BrainwaveBands, BrainwaveBandsDb, ConnectionHealthState, MuseState } from '../../types';
import { FFTProcessor } from '../fft-processor';
import type { EEGDevice } from './eeg-device';
import { DEBUG_BRAINBIT_BRIDGE } from './eeg-feature-flags';
import {
  BRAINBIT_BRIDGE_DEVICE_CAPABILITIES,
  type EEGConnectionStateDetail,
  type EEGDeviceCapabilities,
  type HeartRateMetrics,
  type PPGDiagnostics,
  type SessionHeartSummary,
} from './eeg-device-types';
import { deriveBridgeIndices, snapshotBandsFromBridgeBuffers } from './athena-bridge-signal-pipeline';
import { BRAINBIT_COHERENCE_DETECTOR_BAND_SMOOTH } from './brainbit-coherence-stability';
import {
  deriveBrainBitStreamHealth,
  type BrainBitStreamHealthSnapshot,
} from './brainbit-stream-health';
import {
  classifyBrainBitChannelState,
  rebuildBrainBitActivitySnapshot,
} from './brainbit-channel-state';

const STALL_MS = 4000;
const ZERO_BANDS = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

const BRIDGE_WIN = BRAINBIT_BRIDGE_DEVICE_CAPABILITIES.fftSize;
const DEFAULT_LABELS = [...BRAINBIT_BRIDGE_DEVICE_CAPABILITIES.eegChannelLabels];
const BRAINBIT_CORTICAL_BAND_LABELS = new Set(['C3', 'C4']);
/** FFT bin mapping uses this (Capsule nominal). Do not derive from WS chunk spacing — underestimation pushes α above Nyquist → α≈0. */
const BRAINBIT_FFT_SAMPLE_RATE_HZ = BRAINBIT_BRIDGE_DEVICE_CAPABILITIES.sampleRateHz;

/**
 * Capsule relay `samples` are float volts; contact thresholds below (clip/flat/artifact) assume µV.
 * Relative FFT bands are scale-invariant — only `refineContactQuality` uses this multiplier.
 * If your stream is already µV, set `VITE_BRAINBIT_CONTACT_INPUT_TO_UV_SCALE=1`.
 */
const ENV_BRAINBIT_UV_SCALE = Number(import.meta.env.VITE_BRAINBIT_CONTACT_INPUT_TO_UV_SCALE);
const BRAINBIT_CONTACT_INPUT_TO_UV =
  Number.isFinite(ENV_BRAINBIT_UV_SCALE) && ENV_BRAINBIT_UV_SCALE > 0 ? ENV_BRAINBIT_UV_SCALE : 1e6;

const BRIDGE_CONTACT_SMOOTH = 0.82;

/**
 * BrainBit relay only — contact reflects electrode touch, not transport health.
 * Scale is relay volts × 1000 → µV. Quiet resting AC often lands ~0.05–6 µV absAmp;
 * flat must stay below that band so live quiet EEG maps to quiet→usable, not flat.
 */
export const BRAINBIT_CONTACT_THRESHOLDS = {
  warmupSamples: 12,
  clipUv: 3200,
  /** Below both for several samples → open / dead (not quiet resting AC). */
  flatAbsUv: 0.02,
  flatVar: 0.25,
  /** Require this many consecutive flat samples before labeling flat (avoids EMA dips). */
  flatConfirmSamples: 4,
  /** Good requires BOTH absAmp and vari in this band (not merely "not weak"). */
  goodMinAbsUv: 0.4,
  goodMaxAbsUv: 920,
  goodMinVar: 0.35,
  artifactAbsUv: 2800,
  artifactVar: 650_000,
  weakAbsUv: 1400,
  weakVar: 140_000,
  /** Chunk-level: min raw spread (V) across channels for independent electrodes. */
  minChunkSpreadVolts: 5e-9,
  /** Chunks where all channels match within this spread are treated as fake/stale. */
  identicalSpreadVolts: 1e-10,
  /** Fraction of non-sentinel rows required for a chunk to be "valid". */
  minValidRowRatio: 0.55,
  /** Consecutive sentinel-heavy chunks before forced degrade (brief bursts tolerated). */
  sentinelChunkDegradeStreak: 4,
  /** Rolling chunk window: per-channel mean variance below this → stale DC plateau. */
  staleChunkMeanVarVoltsSq: 1e-18,
  staleWindowChunks: 6,
} as const;

const BRAINBIT_CONTACT_CHUNK_HIST_LEN = 8;

/** Fast recovery; slower degradation so brief glitches do not flash red/off. */
const BRAINBIT_CONTACT_DISPLAY_EMA_IMPROVE = 0.32;
const BRAINBIT_CONTACT_DISPLAY_EMA_DEGRADE = 0.05;
const BRAINBIT_CONTACT_CONTAMINATION_EMA_DEGRADE = 0.16;

/** Native SDK resist/fallback frame — all four channels at 0.4 V (not real EEG). */
const BRAINBIT_STREAMING_SENTINEL_VOLTS = 0.4;
const BRAINBIT_STREAMING_SENTINEL_TOL = 1e-4;

function isBrainBitStreamingSentinelRow(values: readonly number[]): boolean {
  return (
    values.length === 4 &&
    values.every((v) => Math.abs(v - BRAINBIT_STREAMING_SENTINEL_VOLTS) <= BRAINBIT_STREAMING_SENTINEL_TOL)
  );
}

/** True when a single channel's raw value is pinned at the 0.4 V sentinel. */
function isBrainBitChannelSentinelValue(v: number): boolean {
  return Math.abs(v - BRAINBIT_STREAMING_SENTINEL_VOLTS) <= BRAINBIT_STREAMING_SENTINEL_TOL;
}

/**
 * Consecutive 0.4 V samples on a single channel before it is flagged `stuck`.
 * ~96 samples ≈ 0.38 s at 250 Hz — real EEG always wiggles at µV scale, so a
 * channel holding exactly 0.4 V this long is saturated/stuck, not flat contact.
 */
export const BRAINBIT_CH_STUCK_04_SAMPLE_STREAK = 96;

/** Per-channel activity classification for the setup diagnostics (NOT pad impedance). */
export type BrainBitChannelState = 'active' | 'usable' | 'stale' | 'low' | 'flat' | 'stuck';

export interface BrainBitChannelActivity {
  label: string;
  state: BrainBitChannelState;
  /** Consecutive 0.4 V samples on this channel (debug / stuck detection). */
  stuck04Streak: number;
  /** Underlying contact horseshoe 1–4 (1 good … 4 off) for reference. */
  horseshoe: number;
  /** Last classifier rule string (e.g. stale-dc, good, flat). */
  rule: string;
}

export interface BrainBitChannelActivitySnapshot {
  channels: BrainBitChannelActivity[];
  /** Channels in `active` or `usable` state. */
  activeCount: number;
  totalCount: number;
  /** `full` = all active/usable, `partial` = some, `none` = zero, `idle` = no data yet. */
  overallState: 'full' | 'partial' | 'none' | 'idle';
}

function defaultBrainBitBridgeWsUrl(): string {
  return (
    (import.meta.env.VITE_BRAINBIT_BRIDGE_WS_URL as string | undefined)?.trim() ||
    'ws://127.0.0.1:8765/ws'
  );
}

const EMPTY_PPG: HeartRateMetrics = { bpm: null, confidence: 0, lastBeatMs: null };
const EMPTY_SESSION_HR: SessionHeartSummary = { avgHR: null, avgHRV: null };
const EMPTY_PPG_DIAG: PPGDiagnostics = {
  streamAvailable: false,
  subscribed: false,
  samplesReceived: 0,
  confidence: 0,
  connectionMode: null,
};

export type BrainBitBridgeLatestSample = {
  readonly microvolts: readonly number[];
  readonly labels: readonly string[];
  readonly seq: number;
  readonly timestampUs: number;
  readonly receivedAtMs: number;
};

function baseState(connected: boolean, deviceName: string | null, health: ConnectionHealthState): MuseState {
  return {
    connected,
    connectionMode: 'osc',
    deviceName,
    touching: false,
    connectionQuality: connected ? 1 : 0,
    batteryLevel: -1,
    healthState: health,
    bands: { ...ZERO_BANDS },
    bandsSmooth: { ...ZERO_BANDS },
    bandsDb: { ...ZERO_BANDS },
    bandsDbSmooth: { ...ZERO_BANDS },
    relaxationIndex: 0,
    meditationIndex: 0,
    focusIndex: 0,
  };
}

function tryParseBrainBitEegJson(raw: unknown): { ok: true; p: BrainBitEegJson } | { ok: false; reason: string } {
  if (raw == null || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const o = raw as Record<string, unknown>;
  if (o.type !== 'eeg') return { ok: false, reason: 'type !== eeg' };
  const labels = o.labels;
  const samples = o.samples;
  if (!Array.isArray(labels) || !Array.isArray(samples)) return { ok: false, reason: 'labels/samples not arrays' };
  const sampleCount = Number(o.sampleCount);
  const channelCount = Number(o.channelCount);
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return { ok: false, reason: 'bad sampleCount' };
  if (!Number.isFinite(channelCount) || channelCount <= 0) return { ok: false, reason: 'bad channelCount' };
  if (labels.length !== channelCount) return { ok: false, reason: 'labels length mismatch' };
  if (samples.length !== channelCount) return { ok: false, reason: 'samples row count mismatch' };
  const rows: number[][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const row = samples[ch];
    if (!Array.isArray(row)) return { ok: false, reason: `samples[${ch}] not array` };
    if (row.length !== sampleCount) return { ok: false, reason: `samples[${ch}] length` };
    const nums: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const v = row[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, reason: 'non-numeric sample' };
      nums.push(v);
    }
    rows.push(nums);
  }
  const ts = o.timestamp;
  const timestampUs = typeof ts === 'number' && Number.isFinite(ts) ? ts : 0;
  const labStr = labels.map((x) => (typeof x === 'string' ? x : String(x)));
  return {
    ok: true,
    p: {
      type: 'eeg',
      labels: labStr,
      samples: rows,
      sampleCount,
      channelCount,
      timestampUs,
    },
  };
}

type BrainBitEegJson = {
  type: 'eeg';
  labels: string[];
  samples: number[][];
  sampleCount: number;
  channelCount: number;
  timestampUs: number;
};

export class BrainBitBridgeEEGDevice implements EEGDevice {
  private _runtimeChannelCount = BRAINBIT_BRIDGE_DEVICE_CAPABILITIES.eegChannelCount;
  private _runtimeLabels: readonly string[] = DEFAULT_LABELS;

  /**
   * EMA weight for `bandsSmooth` / `bandsDbSmooth` — applied **once per WS chunk**, not per EEG sample.
   * Per-sample EMA (~32×/chunk with Muse’s 0.7) collapsed α/β variance → `minVariance` in CoherenceDetector.
   * Numeric value matches Muse; BrainBit differs only in **application rate**.
   */
  private readonly smoothingFactor = 0.7;

  private ws: WebSocket | null = null;
  private _connected = false;
  private latest: BrainBitBridgeLatestSample | null = null;
  private lastWsError: string | null = null;
  private _state: MuseState = baseState(false, null, 'disconnected');

  private fft: FFTProcessor = new FFTProcessor({
    fftSize: BRIDGE_WIN,
    sampleRateHz: BRAINBIT_FFT_SAMPLE_RATE_HZ,
  });
  private eegBuffers: number[][] = this.allocBuffers(this._runtimeChannelCount);
  private contactMean: number[] = [];
  private contactAbsAmp: number[] = [];
  private contactVar: number[] = [];
  private contactHorseshoe: number[] = [];
  private contactDisplayEma: number[] = [];
  private contactSampleCount: number[] = [];
  /** Per-channel consecutive 0.4 V sample count — detects a single channel stuck/saturated. */
  private contactStuck04Streak: number[] = [];
  /** Per-channel consecutive below-flat-threshold samples — hysteresis before labeling flat. */
  private contactFlatStreak: number[] = [];
  /** Last row of chunk: relay raw, µV into heuristic, rule label for debug. */
  private contactLastRaw: number[] = [];
  private contactLastUv: number[] = [];
  private contactLastRule: string[] = [];
  private contactLastRawQ: number[] = [];
  /** Effective relay→µV scale for contact heuristic (bootstrapped once from first live packet). */
  private contactUvScaleEffective = BRAINBIT_CONTACT_INPUT_TO_UV;
  private contactUvScaleLocked = false;
  private contactSentinelChunkStreak = 0;
  private contactChunkHist: {
    spreadVolts: number;
    validRatio: number;
    chMeansVolts: number[];
  }[] = [];
  private contactLastValidRowRatio = 1;
  private contactLastChunkSpreadVolts = 0;

  /**
   * Feeds `CoherenceDetector` only — lighter EMA than `_state.bandsSmooth` so α/β variance clears `minVariance`.
   */
  private coherenceDetectorBands: BrainwaveBands = { ...ZERO_BANDS };
  /** Last N chunk-rate α/β after detector EMA (`getCoherenceDetectorBands` source); for debug only. */
  private coherenceDetectorChunkFeed: { seq: number; alpha: number; beta: number }[] = [];

  private lastRecvWallMs = 0;
  private emaStreamDtSec = 1 / BRAINBIT_FFT_SAMPLE_RATE_HZ;
  private lastFftRateHz = BRAINBIT_FFT_SAMPLE_RATE_HZ;
  /** Last chunk spacing implied rate (debug); FFT does not use this. */
  private chunkImpliedRateHzDebug: number | null = null;
  /** Last pre-smooth relative bands from FFT snapshot (debug). */
  private lastSnapBandsRel: BrainwaveBands | null = null;
  private lastSnapBandsDb: BrainwaveBandsDb | null = null;
  private lastAllChannelBandsRel: BrainwaveBands | null = null;
  private lastAllChannelBandsDb: BrainwaveBandsDb | null = null;
  private lastBandChannelLabels: string[] = [];

  private chunkSeq = 0;
  private lastRxRejectReason: string | null = null;
  private lastRxAcceptSeq: number | null = null;
  private bridgeAcceptedTotal = 0;
  private lastRejectLogMs = 0;
  private lastContactDebugLogMs = 0;
  /** Latest per-channel contact stats for debug (after ingest). */
  private contactDebugSnapshot: {
    maxAbsRaw: number;
    connectionQuality01: number;
    frameQuality: 'valid' | 'mixed' | 'sentinel' | 'stale';
    validRowRatio: number;
    chunkSpreadVolts: number;
    sentinelChunkStreak: number;
    perCh: {
      raw: number;
      uv: number;
      meanUv: number;
      absAmp: number;
      vari: number;
      rawQ: number;
      displayEma: number;
      rule: string;
      horseshoe: number;
    }[];
  } | null = null;

  get capabilities(): EEGDeviceCapabilities {
    return {
      ...BRAINBIT_BRIDGE_DEVICE_CAPABILITIES,
      eegChannelCount: this._runtimeChannelCount,
      eegChannelLabels: this._runtimeLabels,
      sampleRateHz: this.lastFftRateHz,
    };
  }

  getLatestBrainBitSample(): BrainBitBridgeLatestSample | null {
    return this.latest;
  }

  getCoherenceDetectorBands(): BrainwaveBands {
    return { ...this.coherenceDetectorBands };
  }

  /** Stream / frame health for BrainBit UI (signal-only — not electrode impedance). */
  getBrainBitStreamHealth(connectionHealthState: ConnectionHealthState): BrainBitStreamHealthSnapshot {
    const detail = this.getConnectionStateDetail();
    const c = this.contactDebugSnapshot;
    return deriveBrainBitStreamHealth({
      wsConnected: this._connected,
      connectionHealthState,
      timeSinceLastPacketMs: detail.timeSinceLastUpdate,
      contact: c
        ? {
            frameQuality: c.frameQuality,
            validRowRatio: c.validRowRatio,
            chunkSpreadVolts: c.chunkSpreadVolts,
            sentinelChunkStreak: c.sentinelChunkStreak,
            connectionQuality01: c.connectionQuality01,
          }
        : null,
    });
  }

  getBrainBitBridgeRxDebug(): {
    lastReject: string | null;
    lastAcceptSeq: number | null;
    acceptedTotal: number;
    contactInputToUv: number;
    contactThresholds: typeof BRAINBIT_CONTACT_THRESHOLDS;
    fft: {
      fftUsesHz: number;
      chunkImpliedHz: number | null;
      emaChunkImpliedHz: number;
      lastRelativeSnapshot: BrainwaveBands | null;
      lastRelativeSnapshotDb: BrainwaveBandsDb | null;
      allChannelRelativeSnapshot: BrainwaveBands | null;
      allChannelDbSnapshot: BrainwaveBandsDb | null;
      selectedBandLabels: string[];
      allLabels: string[];
    };
    contact: {
      maxAbsRaw: number;
      connectionQuality01: number;
      frameQuality: 'valid' | 'mixed' | 'sentinel' | 'stale';
      validRowRatio: number;
      chunkSpreadVolts: number;
      sentinelChunkStreak: number;
      perCh: {
        raw: number;
        uv: number;
        meanUv: number;
        absAmp: number;
        vari: number;
        rawQ: number;
        displayEma: number;
        rule: string;
        horseshoe: number;
      }[];
    } | null;
    /** Chunk-rate α/β fed into CoherenceDetector (after per-chunk EMA on instant bands). */
    coherenceDetectorChunkFeed: { seq: number; alpha: number; beta: number }[];
  } {
    const c = this.contactDebugSnapshot;
    const hzEma = 1 / Math.max(this.emaStreamDtSec, 1e-6);
    return {
      lastReject: this.lastRxRejectReason,
      lastAcceptSeq: this.lastRxAcceptSeq,
      acceptedTotal: this.bridgeAcceptedTotal,
      contactInputToUv: this.contactUvScaleEffective,
      contactThresholds: { ...BRAINBIT_CONTACT_THRESHOLDS },
      fft: {
        fftUsesHz: BRAINBIT_FFT_SAMPLE_RATE_HZ,
        chunkImpliedHz: this.chunkImpliedRateHzDebug,
        emaChunkImpliedHz: hzEma,
        lastRelativeSnapshot: this.lastSnapBandsRel
          ? { ...this.lastSnapBandsRel }
          : null,
        lastRelativeSnapshotDb: this.lastSnapBandsDb
          ? { ...this.lastSnapBandsDb }
          : null,
        allChannelRelativeSnapshot: this.lastAllChannelBandsRel
          ? { ...this.lastAllChannelBandsRel }
          : null,
        allChannelDbSnapshot: this.lastAllChannelBandsDb
          ? { ...this.lastAllChannelBandsDb }
          : null,
        selectedBandLabels: [...this.lastBandChannelLabels],
        allLabels: [...this._runtimeLabels],
      },
      contact: c
        ? {
            maxAbsRaw: c.maxAbsRaw,
            connectionQuality01: c.connectionQuality01,
            frameQuality: c.frameQuality,
            validRowRatio: c.validRowRatio,
            chunkSpreadVolts: c.chunkSpreadVolts,
            sentinelChunkStreak: c.sentinelChunkStreak,
            perCh: c.perCh.map((p) => ({ ...p })),
          }
        : null,
      coherenceDetectorChunkFeed: this.coherenceDetectorChunkFeed.map((e) => ({ ...e })),
    };
  }

  isBluetoothAvailable(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connectBluetooth(): Promise<void> {
    return this.connectWs(defaultBrainBitBridgeWsUrl());
  }

  async connectOSC(url?: string): Promise<void> {
    const u = (url?.trim() || defaultBrainBitBridgeWsUrl()).trim();
    if (/^wss?:\/\//i.test(u)) {
      return this.connectWs(u);
    }
    throw new Error(
      `BrainBit bridge: invalid WebSocket URL "${u}". Expected ws:// or wss:// (default: ${defaultBrainBitBridgeWsUrl()}).`
    );
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this.latest = null;
    this.lastWsError = null;
    this.lastRxRejectReason = null;
    this.lastRxAcceptSeq = null;
    this.bridgeAcceptedTotal = 0;
    this.chunkSeq = 0;
    this.lastContactDebugLogMs = 0;
    this.contactDebugSnapshot = null;
    this.chunkImpliedRateHzDebug = null;
    this.lastSnapBandsRel = null;
    this.lastSnapBandsDb = null;
    this.lastAllChannelBandsRel = null;
    this.lastAllChannelBandsDb = null;
    this.lastBandChannelLabels = [];
    this.coherenceDetectorBands = { ...ZERO_BANDS };
    this.coherenceDetectorChunkFeed = [];
    this.resetSignalPipeline();
    this._state = baseState(false, null, 'disconnected');
  }

  get connected(): boolean {
    return this._connected;
  }

  get bleTransportConnected(): boolean {
    return false;
  }

  getHealthState(): ConnectionHealthState {
    if (!this._connected) return 'disconnected';
    if (!this.latest) return 'stalled';
    if (Date.now() - this.latest.receivedAtMs > STALL_MS) return 'stalled';
    return 'healthy';
  }

  getState(): MuseState {
    const h = this.getHealthState();
    return {
      ...this._state,
      connected: this._connected,
      healthState: h,
      connectionQuality: this._connected ? this._state.connectionQuality : 0,
    };
  }

  getElectrodeQuality(): number[] {
    const n = this._runtimeChannelCount;
    if (this.contactHorseshoe.length === n) return [...this.contactHorseshoe];
    return Array.from({ length: n }, () => 4);
  }

  /**
   * Per-channel EEG activity for the setup diagnostics panel.
   * This is channel *activity* (does usable data move on this channel?), not pad
   * contact / impedance — BrainBit signal-only mode reports no real impedance.
   * A channel pinned at the 0.4 V relay sentinel is reported as `stuck`.
   */
  getBrainBitChannelDiagnostics(): BrainBitChannelActivitySnapshot {
    const n = this._runtimeChannelCount;
    const labels = this._runtimeLabels;
    const hasData = this._connected && this.latest !== null;

    const channels: BrainBitChannelActivity[] = Array.from({ length: n }, (_, ch) => {
      const horseshoe = this.contactHorseshoe[ch] ?? 4;
      const stuck04Streak = this.contactStuck04Streak[ch] ?? 0;
      const rule = this.contactLastRule[ch] ?? '';
      const label = labels[ch] ?? `Ch${ch}`;
      const state = classifyBrainBitChannelState({
        hasData,
        horseshoe,
        rule,
        stuck04Streak,
        stuckThreshold: BRAINBIT_CH_STUCK_04_SAMPLE_STREAK,
      });
      return { label, state, stuck04Streak, horseshoe, rule };
    });

    return hasData
      ? rebuildBrainBitActivitySnapshot(channels)
      : { ...rebuildBrainBitActivitySnapshot(channels), overallState: 'idle' as const, activeCount: 0 };
  }

  getConnectionStateDetail(): EEGConnectionStateDetail {
    const timeSinceLastUpdate = this.latest ? Date.now() - this.latest.receivedAtMs : Number.POSITIVE_INFINITY;
    return {
      connected: this._connected,
      healthState: this.getHealthState(),
      bleTransportConnected: false,
      timeSinceLastUpdate,
      pauseDuration: null,
      reconnectAttempts: 0,
      lastDisconnectReason: this.lastWsError,
    };
  }

  getPPG(): HeartRateMetrics {
    return { ...EMPTY_PPG };
  }

  getSessionPPGSummary(): SessionHeartSummary {
    return { ...EMPTY_SESSION_HR };
  }

  resetSessionPPG(): void {}

  getPPGDiagnostics(): PPGDiagnostics {
    return { ...EMPTY_PPG_DIAG };
  }

  get accX(): number {
    return 0;
  }
  get accY(): number {
    return 0;
  }
  get accZ(): number {
    return 0;
  }
  get accelSubscribed(): boolean {
    return false;
  }
  get accelSampleCount(): number {
    return 0;
  }

  get bandsDb(): BrainwaveBandsDb {
    return { ...this._state.bandsDbSmooth };
  }

  private allocBuffers(n: number): number[][] {
    return Array.from({ length: Math.max(1, n) }, () => []);
  }

  private resetSignalPipeline(): void {
    this._runtimeChannelCount = BRAINBIT_BRIDGE_DEVICE_CAPABILITIES.eegChannelCount;
    this._runtimeLabels = DEFAULT_LABELS;
    this.eegBuffers = this.allocBuffers(this._runtimeChannelCount);
    this.resetContactArrays(this._runtimeChannelCount);
    this.lastRecvWallMs = 0;
    this.emaStreamDtSec = 1 / BRAINBIT_FFT_SAMPLE_RATE_HZ;
    this.lastFftRateHz = BRAINBIT_FFT_SAMPLE_RATE_HZ;
    this.chunkImpliedRateHzDebug = null;
    this.lastSnapBandsRel = null;
    this.lastSnapBandsDb = null;
    this.lastAllChannelBandsRel = null;
    this.lastAllChannelBandsDb = null;
    this.lastBandChannelLabels = [];
    this.coherenceDetectorBands = { ...ZERO_BANDS };
    this.coherenceDetectorChunkFeed = [];
    this.fft = new FFTProcessor({ fftSize: BRIDGE_WIN, sampleRateHz: BRAINBIT_FFT_SAMPLE_RATE_HZ });
    this.contactUvScaleEffective = BRAINBIT_CONTACT_INPUT_TO_UV;
    this.contactUvScaleLocked = false;
  }

  /**
   * Capsule relay unit scale varies by SDK/build. FFT bands are scale-invariant, but contact
   * thresholds are absolute µV — bootstrap once from the first live packet so streaming EEG
   * does not read as permanently flat/off when env scale is misconfigured.
   */
  private bootstrapContactUvScaleFromPacket(pkt: BrainBitEegJson): void {
    if (this.contactUvScaleLocked) return;

    let maxAbsRaw = 0;
    for (let ch = 0; ch < pkt.channelCount; ch++) {
      const row = pkt.samples[ch]!;
      for (let s = 0; s < pkt.sampleCount; s++) {
        const v = row[s]!;
        if (Math.abs(v - BRAINBIT_STREAMING_SENTINEL_VOLTS) <= BRAINBIT_STREAMING_SENTINEL_TOL) {
          continue;
        }
        maxAbsRaw = Math.max(maxAbsRaw, Math.abs(v));
      }
    }
    if (maxAbsRaw <= 0) return;

    const trialUv = maxAbsRaw * this.contactUvScaleEffective;
    if (trialUv >= 1 && trialUv <= 5000) {
      this.contactUvScaleLocked = true;
      return;
    }

    this.contactUvScaleEffective = 80 / maxAbsRaw;
    this.contactUvScaleLocked = true;
    this.resetContactArrays(pkt.channelCount);
  }

  private resetContactArrays(n: number): void {
    const c = Math.max(1, n);
    this.contactMean = Array(c).fill(0);
    this.contactAbsAmp = Array(c).fill(0);
    this.contactVar = Array(c).fill(0);
    this.contactHorseshoe = Array(c).fill(4);
    this.contactDisplayEma = Array(c).fill(0.28);
    this.contactSampleCount = Array(c).fill(0);
    this.contactStuck04Streak = Array(c).fill(0);
    this.contactFlatStreak = Array(c).fill(0);
    this.contactLastRaw = Array(c).fill(0);
    this.contactLastUv = Array(c).fill(0);
    this.contactLastRule = Array(c).fill('');
    this.contactLastRawQ = Array(c).fill(4);
    this.contactSentinelChunkStreak = 0;
    this.contactChunkHist = [];
    this.contactLastValidRowRatio = 1;
    this.contactLastChunkSpreadVolts = 0;
  }

  private ensureChannelLayout(channels: number, labels: readonly string[]): void {
    if (channels !== this._runtimeChannelCount) {
      this._runtimeChannelCount = channels;
      this.eegBuffers = this.allocBuffers(channels);
      this.resetContactArrays(channels);
    } else if (this.contactHorseshoe.length !== channels) {
      this.resetContactArrays(channels);
    }
    this._runtimeLabels = [...labels];
  }

  private static rawContactQToScore(q: number): number {
    if (q === 1) return 1;
    if (q === 2) return 0.62;
    if (q === 3) return 0.28;
    return 0;
  }

  private hysteresisHorseshoe(prev: number, s: number): number {
    if (prev === 1) return s < 0.55 ? 2 : 1;
    if (prev === 2) {
      if (s > 0.72) return 1;
      if (s < 0.32) return 3;
      return 2;
    }
    if (prev === 3) {
      if (s > 0.48) return 2;
      if (s < 0.1) return 4;
      return 3;
    }
    return s > 0.28 ? 3 : 4;
  }

  private applyContactDisplaySmoothing(ch: number, rawQ: number, fastDegrade = false): void {
    const target = BrainBitBridgeEEGDevice.rawContactQToScore(rawQ);
    let ema = this.contactDisplayEma[ch] ?? target;
    const degrade = fastDegrade
      ? BRAINBIT_CONTACT_CONTAMINATION_EMA_DEGRADE
      : BRAINBIT_CONTACT_DISPLAY_EMA_DEGRADE;
    const a = target < ema - 1e-6 ? degrade : BRAINBIT_CONTACT_DISPLAY_EMA_IMPROVE;
    ema = ema * (1 - a) + target * a;
    this.contactDisplayEma[ch] = ema;
    const prev = this.contactHorseshoe[ch] ?? 4;
    this.contactHorseshoe[ch] = this.hysteresisHorseshoe(prev, ema);
  }

  private refineContactQuality(ch: number, sampleUv: number): void {
    const th = BRAINBIT_CONTACT_THRESHOLDS;
    const s = BRIDGE_CONTACT_SMOOTH;
    const prevMean = this.contactMean[ch] ?? 0;
    const mean = prevMean * s + sampleUv * (1 - s);
    const absAmp = this.contactAbsAmp[ch] * s + Math.abs(sampleUv - mean) * (1 - s);
    const vari = this.contactVar[ch] * s + (sampleUv - mean) ** 2 * (1 - s);
    this.contactMean[ch] = mean;
    this.contactAbsAmp[ch] = absAmp;
    this.contactVar[ch] = vari;
    this.contactSampleCount[ch] = (this.contactSampleCount[ch] ?? 0) + 1;

    let q: number;
    let rule: string;
    const n = this.contactSampleCount[ch];
    const belowFlatFloor = absAmp < th.flatAbsUv && vari < th.flatVar;
    if (belowFlatFloor) {
      this.contactFlatStreak[ch] = (this.contactFlatStreak[ch] ?? 0) + 1;
    } else {
      this.contactFlatStreak[ch] = 0;
    }
    const flatConfirmed = (this.contactFlatStreak[ch] ?? 0) >= th.flatConfirmSamples;

    if (n < th.warmupSamples) {
      q = 2;
      rule = `warmup n=${n}<${th.warmupSamples}→medium`;
    } else if (Math.abs(sampleUv) >= th.clipUv) {
      q = 3;
      rule = `clip |uv|≥${th.clipUv} (${Math.abs(sampleUv).toFixed(0)}µV)`;
    } else if (flatConfirmed) {
      q = 4;
      rule = `flat absAmp<${th.flatAbsUv} && var<${th.flatVar} (abs=${absAmp.toFixed(2)} var=${vari.toFixed(1)})`;
    } else if (absAmp > th.artifactAbsUv || vari > th.artifactVar) {
      q = 3;
      rule = `artifact abs>${th.artifactAbsUv}||var>${th.artifactVar}`;
    } else if (absAmp > th.weakAbsUv || vari > th.weakVar) {
      q = 2;
      rule = `weak abs>${th.weakAbsUv}||var>${th.weakVar}`;
    } else if (
      absAmp >= th.goodMinAbsUv &&
      absAmp <= th.goodMaxAbsUv &&
      vari >= th.goodMinVar
    ) {
      q = 1;
      rule = `good ${th.goodMinAbsUv}≤abs≤${th.goodMaxAbsUv} && var≥${th.goodMinVar}`;
    } else {
      // Live stream with quiet AC — not flat, not artifact. UI maps to usable (not stale).
      // Includes brief dips below the flat floor before flatConfirmSamples.
      q = 2;
      rule = `quiet abs=${absAmp.toFixed(2)} var=${vari.toFixed(1)}`;
    }

    this.contactLastUv[ch] = sampleUv;
    this.contactLastRawQ[ch] = q;
    this.contactLastRule[ch] = rule;
    this.applyContactDisplaySmoothing(ch, q);
  }

  private pushContactChunkHist(spreadVolts: number, validRatio: number, chMeansVolts: number[]): void {
    this.contactChunkHist.push({ spreadVolts, validRatio, chMeansVolts: [...chMeansVolts] });
    while (this.contactChunkHist.length > BRAINBIT_CONTACT_CHUNK_HIST_LEN) {
      this.contactChunkHist.shift();
    }
  }

  private isStaleContactWindow(th: typeof BRAINBIT_CONTACT_THRESHOLDS): boolean {
    if (this.contactChunkHist.length < th.staleWindowChunks) return false;
    const hist = this.contactChunkHist.slice(-th.staleWindowChunks);
    const nCh = hist[0]?.chMeansVolts.length ?? 0;
    if (nCh === 0) return false;

    let allChannelsFlat = true;
    for (let ch = 0; ch < nCh; ch++) {
      const vals = hist.map((h) => h.chMeansVolts[ch] ?? 0);
      const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
      const vari = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
      if (vari > th.staleChunkMeanVarVoltsSq) allChannelsFlat = false;
    }
    const avgSpread = hist.reduce((a, h) => a + h.spreadVolts, 0) / hist.length;
    return allChannelsFlat && avgSpread < th.minChunkSpreadVolts * 8;
  }

  /**
   * Chunk-level contamination — tightens aggregate horseshoe/EMA for audio gates.
   * Does NOT overwrite per-channel `contactLastRule`; channel dots stay independent.
   */
  private forceContactDegradeAll(minHorseshoe: number, reason: string): void {
    void reason; // retained for future debug logging
    const n = this.contactHorseshoe.length;
    const targetScore = BrainBitBridgeEEGDevice.rawContactQToScore(minHorseshoe);
    for (let ch = 0; ch < n; ch++) {
      const ema = this.contactDisplayEma[ch] ?? targetScore;
      this.contactDisplayEma[ch] =
        ema * (1 - BRAINBIT_CONTACT_CONTAMINATION_EMA_DEGRADE) +
        targetScore * BRAINBIT_CONTACT_CONTAMINATION_EMA_DEGRADE;
      const prev = this.contactHorseshoe[ch] ?? 4;
      const fromHyst = this.hysteresisHorseshoe(prev, this.contactDisplayEma[ch]!);
      this.contactHorseshoe[ch] = Math.max(fromHyst, minHorseshoe);
      this.contactLastRawQ[ch] = Math.max(this.contactLastRawQ[ch] ?? 4, minHorseshoe);
    }
    this.syncContactDerivedState();
  }

  private finalizeChunkContact(args: {
    channelCount: number;
    validRows: number;
    sampleCount: number;
    skippedSentinelRows: number;
    lastRowVolts: number[] | null;
    chMeanVolts: number[];
  }): 'valid' | 'mixed' | 'sentinel' | 'stale' {
    const th = BRAINBIT_CONTACT_THRESHOLDS;
    const { validRows, sampleCount, skippedSentinelRows, lastRowVolts, chMeanVolts } = args;
    const validRatio = sampleCount > 0 ? validRows / sampleCount : 0;
    this.contactLastValidRowRatio = validRatio;

    if (validRows === 0) {
      this.contactSentinelChunkStreak += 1;
      this.contactLastChunkSpreadVolts = 0;
      const minHs =
        this.contactSentinelChunkStreak >= th.sentinelChunkDegradeStreak ? 4 : 2;
      this.forceContactDegradeAll(minHs, 'all-sentinel-chunk');
      return 'sentinel';
    }

    const spreadFromMeans =
      chMeanVolts.length > 0
        ? Math.max(...chMeanVolts) - Math.min(...chMeanVolts)
        : 0;
    const spreadFromLast =
      lastRowVolts && lastRowVolts.length > 0
        ? Math.max(...lastRowVolts) - Math.min(...lastRowVolts)
        : 0;
    const spreadVolts = Math.max(spreadFromMeans, spreadFromLast);
    this.contactLastChunkSpreadVolts = spreadVolts;
    this.pushContactChunkHist(spreadVolts, validRatio, chMeanVolts);

    const sentinelHeavy =
      validRatio < th.minValidRowRatio || skippedSentinelRows > 0;
    if (sentinelHeavy) {
      this.contactSentinelChunkStreak += 1;
    } else {
      this.contactSentinelChunkStreak = 0;
    }

    let frameQuality: 'valid' | 'mixed' | 'sentinel' | 'stale' =
      validRatio >= th.minValidRowRatio ? 'valid' : 'mixed';
    if (skippedSentinelRows === sampleCount) frameQuality = 'sentinel';

    const nearIdentical =
      lastRowVolts &&
      lastRowVolts.length > 1 &&
      spreadVolts <= th.identicalSpreadVolts;
    const lowIndependence = spreadVolts < th.minChunkSpreadVolts;
    const staleWindow = this.isStaleContactWindow(th);

    if (nearIdentical || lowIndependence) {
      frameQuality = 'mixed';
      this.forceContactDegradeAll(4, nearIdentical ? 'identical-channels' : 'low-cross-channel-spread');
    } else if (this.contactSentinelChunkStreak >= th.sentinelChunkDegradeStreak) {
      frameQuality = 'mixed';
      this.forceContactDegradeAll(
        3,
        `sentinel-streak=${this.contactSentinelChunkStreak}`,
      );
    } else if (staleWindow) {
      frameQuality = 'stale';
      const sentinelDominant =
        this.contactSentinelChunkStreak >= 2 || validRatio < th.minValidRowRatio;
      const channelsIdentical = Boolean(nearIdentical) || lowIndependence;
      const keepUsableWhileStreaming =
        validRatio >= th.minValidRowRatio && !channelsIdentical && !sentinelDominant;
      if (!keepUsableWhileStreaming) {
        this.forceContactDegradeAll(2, 'stale-dc-window');
      }
    } else if (validRatio < th.minValidRowRatio) {
      this.forceContactDegradeAll(2, `low-valid-ratio=${validRatio.toFixed(2)}`);
    }

    return frameQuality;
  }

  private syncContactDerivedState(): void {
    const n = this.contactHorseshoe.length;
    if (n === 0) return;
    let score = 0;
    for (let i = 0; i < n; i++) {
      const rule = this.contactLastRule[i] ?? '';
      if (rule.includes('stale-dc')) {
        score += 0.35;
      } else if (rule.startsWith('quiet')) {
        score += 0.55;
      } else if (rule.startsWith('flat') || rule.startsWith('clip')) {
        score += 0;
      } else {
        const h = this.contactHorseshoe[i];
        if (h === 1) score += 1;
        else if (h === 2) score += 0.5;
      }
    }
    const cq = score / n;
    this._state.touching = cq > 0.05;
    this._state.connectionQuality = cq;
  }

  private retuneChunkRate(nowMs: number, sampleCount: number): void {
    if (this.lastRecvWallMs > 0 && sampleCount > 0) {
      const dtSec = (nowMs - this.lastRecvWallMs) / 1000;
      if (dtSec > 1e-4 && dtSec < 2) {
        const dtPerSample = dtSec / sampleCount;
        if (dtPerSample > 1e-6 && dtPerSample < 0.05) {
          this.emaStreamDtSec = 0.85 * this.emaStreamDtSec + 0.15 * dtPerSample;
          this.chunkImpliedRateHzDebug = 1 / dtPerSample;
        }
      }
    }
    this.lastRecvWallMs = nowMs;

    // Always use nominal Capsule rate for FFT. Chunk-spacing-derived rates often underestimate
    // (batching, timer coarseness), collapsing Nyquist below α and yielding bandsSmooth.alpha≈0
    // while β/γ still pick up edge energy — breaks coherence `bandAlpha` gate.
    this.lastFftRateHz = BRAINBIT_FFT_SAMPLE_RATE_HZ;
  }

  private getBrainBitBandChannelIndices(labels: readonly string[], channelCount: number): number[] {
    const selected: number[] = [];
    for (let i = 0; i < Math.min(labels.length, channelCount); i++) {
      if (BRAINBIT_CORTICAL_BAND_LABELS.has(labels[i]!.toUpperCase())) {
        selected.push(i);
      }
    }
    return selected.length > 0 ? selected : Array.from({ length: channelCount }, (_, i) => i);
  }

  /** One EMA step on instant bands → `bandsSmooth` (and dB), after all samples in a chunk are ingested. */
  private applyBrainBitBandSmoothingStep(): void {
    const sf = this.smoothingFactor;
    const sfDet = BRAINBIT_COHERENCE_DETECTOR_BAND_SMOOTH;
    const keys = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;
    for (const b of keys) {
      const v = Math.max(0, Math.min(1, this._state.bands[b]));
      this._state.bandsSmooth[b] = this._state.bandsSmooth[b] * sf + v * (1 - sf);
      this.coherenceDetectorBands[b] = this.coherenceDetectorBands[b] * sfDet + v * (1 - sfDet);
      const db = this._state.bandsDb[b];
      this._state.bandsDbSmooth[b] = this._state.bandsDbSmooth[b] * sf + db * (1 - sf);
    }
    const idx = deriveBridgeIndices(this._state.bandsSmooth);
    this._state.relaxationIndex = idx.relaxationIndex;
    this._state.meditationIndex = idx.meditationIndex;
    this._state.focusIndex = idx.focusIndex;

    this.coherenceDetectorChunkFeed.push({
      seq: this.chunkSeq,
      alpha: this.coherenceDetectorBands.alpha,
      beta: this.coherenceDetectorBands.beta,
    });
    while (this.coherenceDetectorChunkFeed.length > 24) {
      this.coherenceDetectorChunkFeed.shift();
    }
  }

  /** One multichannel sample (µV) — mirrors Athena bridge ingest row. */
  private ingestOneRow(u: readonly number[], labels: readonly string[], _nowMs: number): void {
    const n = u.length;
    this.ensureChannelLayout(n, labels);

    for (let ch = 0; ch < n; ch++) {
      const raw = u[ch]!;
      this.contactLastRaw[ch] = raw;
      this.contactStuck04Streak[ch] = isBrainBitChannelSentinelValue(raw)
        ? (this.contactStuck04Streak[ch] ?? 0) + 1
        : 0;
      this.refineContactQuality(ch, raw * this.contactUvScaleEffective);
      this.eegBuffers[ch].push(raw);
      while (this.eegBuffers[ch].length > BRIDGE_WIN) {
        this.eegBuffers[ch].shift();
      }
    }
    this.syncContactDerivedState();

    const corticalChannelIndices = this.getBrainBitBandChannelIndices(labels, n);
    const allSnap = snapshotBandsFromBridgeBuffers(this.eegBuffers, this.fft, n, BRIDGE_WIN);
    if (allSnap) {
      this.lastAllChannelBandsRel = { ...allSnap.bands };
      this.lastAllChannelBandsDb = { ...allSnap.bandsDb };
    }

    const snap = snapshotBandsFromBridgeBuffers(
      this.eegBuffers,
      this.fft,
      n,
      BRIDGE_WIN,
      corticalChannelIndices,
    );
    if (!snap) return;

    this.lastSnapBandsRel = { ...snap.bands };
    this.lastSnapBandsDb = { ...snap.bandsDb };
    this.lastBandChannelLabels = corticalChannelIndices.map((i) => labels[i] ?? `ch${i}`);

    const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;
    for (const b of bands) {
      const v = Math.max(0, Math.min(1, snap.bands[b]));
      this._state.bands[b] = v;
      const db = snap.bandsDb[b];
      this._state.bandsDb[b] = db;
    }
    // bandsSmooth / indices: see `applyBrainBitBandSmoothingStep()` once per chunk
  }

  private ingestBrainBitChunk(pkt: BrainBitEegJson, nowMs: number): void {
    this.bootstrapContactUvScaleFromPacket(pkt);
    this.retuneChunkRate(nowMs, pkt.sampleCount);

    let lastU: number[] | null = null;
    let skippedSentinelRows = 0;
    let validRows = 0;
    const chSumVolts = Array(pkt.channelCount).fill(0);
    const chCountVolts = Array(pkt.channelCount).fill(0);

    for (let s = 0; s < pkt.sampleCount; s++) {
      const u: number[] = [];
      for (let ch = 0; ch < pkt.channelCount; ch++) {
        u.push(pkt.samples[ch]![s]!);
      }
      if (isBrainBitStreamingSentinelRow(u)) {
        skippedSentinelRows += 1;
        continue;
      }
      validRows += 1;
      for (let ch = 0; ch < pkt.channelCount; ch++) {
        chSumVolts[ch]! += u[ch]!;
        chCountVolts[ch]! += 1;
      }
      this.ingestOneRow(u, pkt.labels, nowMs);
      lastU = u;
    }

    const chMeanVolts = chSumVolts.map((sum, ch) =>
      chCountVolts[ch]! > 0 ? sum / chCountVolts[ch]! : 0,
    );
    const frameQuality = this.finalizeChunkContact({
      channelCount: pkt.channelCount,
      validRows,
      sampleCount: pkt.sampleCount,
      skippedSentinelRows,
      lastRowVolts: lastU,
      chMeanVolts,
    });

    if (skippedSentinelRows > 0 && DEBUG_BRAINBIT_BRIDGE) {
      console.warn(
        `[BrainBitBridge] skipped ${skippedSentinelRows}/${pkt.sampleCount} sentinel rows (all channels ≈${BRAINBIT_STREAMING_SENTINEL_VOLTS} V); validRatio=${(validRows / pkt.sampleCount).toFixed(2)} frame=${frameQuality}`
      );
    }

    if (validRows === 0) {
      return;
    }

    this.applyBrainBitBandSmoothingStep();

    if (lastU) {
      this.latest = {
        microvolts: lastU,
        labels: pkt.labels,
        seq: this.chunkSeq,
        timestampUs: pkt.timestampUs,
        receivedAtMs: nowMs,
      };
      const labels = pkt.labels;
      const th = BRAINBIT_CONTACT_THRESHOLDS;
      const perCh = this.contactHorseshoe.map((h, i) => ({
        raw: this.contactLastRaw[i] ?? 0,
        uv: this.contactLastUv[i] ?? 0,
        meanUv: (this.contactMean[i] ?? 0),
        absAmp: this.contactAbsAmp[i] ?? 0,
        vari: this.contactVar[i] ?? 0,
        rawQ: this.contactLastRawQ[i] ?? 4,
        displayEma: this.contactDisplayEma[i] ?? 0,
        rule: this.contactLastRule[i] ?? '',
        horseshoe: h,
      }));
      const cq = this._state.connectionQuality;
      this.contactDebugSnapshot = {
        maxAbsRaw: Math.max(...lastU.map((x) => Math.abs(x)), 0),
        connectionQuality01: cq,
        frameQuality,
        validRowRatio: this.contactLastValidRowRatio,
        chunkSpreadVolts: this.contactLastChunkSpreadVolts,
        sentinelChunkStreak: this.contactSentinelChunkStreak,
        perCh,
      };
      if (DEBUG_BRAINBIT_BRIDGE) {
        const t = Date.now();
        if (t - this.lastContactDebugLogMs >= 2500) {
          this.lastContactDebugLogMs = t;
          const rawMin = Math.min(...lastU);
          const rawMax = Math.max(...lastU);
          const rawSpread = rawMax - rawMin;
          const channelsNearIdentical =
            lastU.length > 1 &&
            rawSpread <= th.identicalSpreadVolts;
          console.log('[BrainBitBridge] contact classification', {
            relayToUv: this.contactUvScaleEffective,
            thresholds: th,
            window: {
              frameQuality,
              validRowRatio: Number(this.contactLastValidRowRatio.toFixed(3)),
              chunkSpreadVolts: Number(this.contactLastChunkSpreadVolts.toExponential(3)),
              sentinelChunkStreak: this.contactSentinelChunkStreak,
              staleWindow: this.isStaleContactWindow(th),
            },
            maxAbsRaw: this.contactDebugSnapshot.maxAbsRaw,
            rawSpreadVolts: Number(rawSpread.toExponential(3)),
            channelsNearIdentical,
            connectionQuality01: Number(cq.toFixed(3)),
            channels: perCh.map((p, i) => {
              const hsLabel =
                p.horseshoe === 1 ? 'green' : p.horseshoe === 2 ? 'amber' : p.horseshoe === 3 ? 'red' : 'off';
              return {
                label: labels[i] ?? `ch${i}`,
                rawV: p.raw,
                uv: Number(p.uv.toFixed(2)),
                meanUv: Number(p.meanUv.toFixed(2)),
                absAmpEma: Number(p.absAmp.toFixed(2)),
                varEma: Number(p.vari.toFixed(1)),
                rawQ: p.rawQ,
                displayEma: Number(p.displayEma.toFixed(3)),
                horseshoe: p.horseshoe,
                ui: hsLabel,
                rule: p.rule,
                goodBandTest: `${p.absAmp.toFixed(2)} in [${th.goodMinAbsUv},${th.goodMaxAbsUv}] && ${p.vari.toFixed(1)}≥${th.goodMinVar}`,
              };
            }),
          });
          const chDiag = this.getBrainBitChannelDiagnostics();
          console.log('[BrainBitBridge] channel activity', {
            overallState: chDiag.overallState,
            activeCount: `${chDiag.activeCount}/${chDiag.totalCount}`,
            channels: chDiag.channels.map((c) => ({
              label: c.label,
              state: c.state,
              stuck04Streak: c.stuck04Streak,
              horseshoe: c.horseshoe,
            })),
          });
          if (channelsNearIdentical) {
            console.warn(
              '[BrainBitBridge] channels nearly identical — contact forced poor/off (not independent electrodes)'
            );
          }
        }
      }
    }
  }

  private connectWs(url: string): Promise<void> {
    this.disconnect();
    this.lastWsError = null;

    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      const finishErr = (msg: string) => {
        if (settled) return;
        settled = true;
        this.lastWsError = msg;
        this._connected = false;
        this._state = baseState(false, null, 'disconnected');
        reject(new Error(msg));
      };

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        this._connected = true;
        this.resetSignalPipeline();
        this._state = baseState(true, 'BrainBit native relay', 'healthy');
        resolve();
      };

      ws.onerror = () => {
        finishErr('WebSocket error (BrainBit relay unreachable?)');
      };

      ws.onclose = () => {
        this._connected = false;
        this.ws = null;
        if (!settled) finishErr('WebSocket closed before open');
        this.resetSignalPipeline();
        this._state = baseState(false, null, 'disconnected');
      };

      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data !== 'string') return;
        let raw: unknown;
        try {
          raw = JSON.parse(ev.data) as unknown;
        } catch {
          return;
        }
        const parsed = tryParseBrainBitEegJson(raw);
        if (!parsed.ok) {
          this.lastRxRejectReason = parsed.reason;
          const t = Date.now();
          if (DEBUG_BRAINBIT_BRIDGE && t - this.lastRejectLogMs >= 1500) {
            this.lastRejectLogMs = t;
            console.warn('[BrainBitBridge] packet rejected:', parsed.reason, raw);
          }
          return;
        }
        this.chunkSeq += 1;
        this.lastRxRejectReason = null;
        this.lastRxAcceptSeq = this.chunkSeq;
        this.bridgeAcceptedTotal += 1;

        const now = Date.now();
        this.ingestBrainBitChunk(parsed.p, now);
        this._state = {
          ...this._state,
          connected: true,
          healthState: 'healthy',
          deviceName: `BrainBit relay · chunk ${this.chunkSeq}`,
        };
      };
    });
  }
}

export const brainBitBridgeEegDevice = new BrainBitBridgeEEGDevice();

export function isBrainBitBridgeEEGDevice(d: EEGDevice): d is BrainBitBridgeEEGDevice {
  return d.capabilities.deviceKind === 'brainbit_bridge';
}
