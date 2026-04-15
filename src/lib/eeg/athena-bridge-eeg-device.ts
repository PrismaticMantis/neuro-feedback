/**
 * EEGDevice implementation for the Athena iOS → WebSocket relay (v2 packets).
 * Does not use muse-js or muse-handler. Reversible PoC: remove flag + this file to drop the path.
 *
 * Signal path: each v2 frame appends one sample per channel → ring buffers → same FFT/band math as Muse BLE
 * (`athena-bridge-signal-pipeline`). Effective sample rate is inferred from packet spacing (~50 Hz typical).
 */

import type { BrainwaveBandsDb, ConnectionHealthState, MuseState } from '../../types';
import { FFTProcessor } from '../fft-processor';
import type { EEGDevice } from './eeg-device';
import { DEBUG_ATHENA_BANDS } from './eeg-feature-flags';
import { tryNormalizeAthenaBridgeEegPacket } from './athena-bridge-packet';
import {
  ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES,
  type EEGConnectionStateDetail,
  type EEGDeviceCapabilities,
  type HeartRateMetrics,
  type PPGDiagnostics,
  type SessionHeartSummary,
} from './eeg-device-types';
import { deriveBridgeIndices, snapshotBandsFromBridgeBuffers } from './athena-bridge-signal-pipeline';

const STALL_MS = 4000;
const ZERO_BANDS = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

const BRIDGE_CH = ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES.eegChannelCount;
const BRIDGE_WIN = ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES.fftSize;

const EMPTY_PPG: HeartRateMetrics = { bpm: null, confidence: 0, lastBeatMs: null };
const EMPTY_SESSION_HR: SessionHeartSummary = { avgHR: null, avgHRV: null };
const EMPTY_PPG_DIAG: PPGDiagnostics = {
  streamAvailable: false,
  subscribed: false,
  samplesReceived: 0,
  confidence: 0,
  connectionMode: null,
};

export type AthenaBridgeLatestSample = {
  readonly microvolts: readonly number[];
  readonly labels: readonly string[];
  readonly seq: number;
  readonly deviceTime: number | null;
  readonly hostTimeSec: number;
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

export class AthenaBridgeEEGDevice implements EEGDevice {
  readonly capabilities: EEGDeviceCapabilities = ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES;

  /** Same EMA as MuseHandler for comparable UI smoothing. */
  private readonly smoothingFactor = 0.7;

  private ws: WebSocket | null = null;
  private _connected = false;
  private latest: AthenaBridgeLatestSample | null = null;
  private lastWsError: string | null = null;
  private _state: MuseState = baseState(false, null, 'disconnected');

  private fft: FFTProcessor = new FFTProcessor({
    fftSize: BRIDGE_WIN,
    sampleRateHz: 50,
  });
  private eegBuffers: number[][] = Array.from({ length: BRIDGE_CH }, () => []);
  private lastRxForRateMs = 0;
  private emaDtMs = 20;
  private lastFftRateHz = 50;

  /** Last parse failure reason from `tryNormalizeAthenaBridgeEegPacket` (debug). */
  private lastRxRejectReason: string | null = null;
  private lastRxAcceptSeq: number | null = null;
  private bridgeAcceptedTotal = 0;
  private lastRejectLogMs = 0;

  /** Last validated v2 frame (microvolts + metadata). */
  getLatestBridgeSample(): AthenaBridgeLatestSample | null {
    return this.latest;
  }

  /** RX debug for Session Setup strip (`VITE_DEBUG_ATHENA_BANDS`). */
  getAthenaBridgeRxDebug(): {
    lastReject: string | null;
    lastAcceptSeq: number | null;
    acceptedTotal: number;
  } {
    return {
      lastReject: this.lastRxRejectReason,
      lastAcceptSeq: this.lastRxAcceptSeq,
      acceptedTotal: this.bridgeAcceptedTotal,
    };
  }

  isBluetoothAvailable(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connectBluetooth(): Promise<void> {
    const url =
      (import.meta.env.VITE_ATHENA_BRIDGE_WS_URL as string | undefined)?.trim() ||
      'ws://127.0.0.1:8765';
    return this.connectWs(url);
  }

  async connectOSC(url?: string): Promise<void> {
    const u = url?.trim();
    if (u && /^wss?:\/\//i.test(u)) {
      return this.connectWs(u);
    }
    throw new Error(
      'Athena bridge: provide a ws:// or wss:// relay URL (e.g. ws://127.0.0.1:8765). Bluetooth connect uses VITE_ATHENA_BRIDGE_WS_URL or localhost:8765.'
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
      connectionQuality: this._connected && h === 'healthy' ? 1 : 0,
    };
  }

  getElectrodeQuality(): number[] {
    return Array.from({ length: this.capabilities.eegChannelCount }, () => 4);
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

  private resetSignalPipeline(): void {
    this.eegBuffers = Array.from({ length: BRIDGE_CH }, () => []);
    this.lastRxForRateMs = 0;
    this.emaDtMs = 20;
    this.lastFftRateHz = 50;
    this.fft = new FFTProcessor({ fftSize: BRIDGE_WIN, sampleRateHz: 50 });
  }

  private retuneFftIfNeeded(nowMs: number): void {
    if (this.lastRxForRateMs > 0) {
      const dt = Math.max(5, Math.min(250, nowMs - this.lastRxForRateMs));
      this.emaDtMs = 0.92 * this.emaDtMs + 0.08 * dt;
    }
    this.lastRxForRateMs = nowMs;
    const effHz = 1000 / Math.max(this.emaDtMs, 1);
    const clamped = Math.min(100, Math.max(20, effHz));
    if (Math.abs(clamped - this.lastFftRateHz) > 3) {
      this.lastFftRateHz = clamped;
      this.fft = new FFTProcessor({ fftSize: BRIDGE_WIN, sampleRateHz: clamped });
    }
  }

  private ingestBridgeSample(microvolts: readonly number[], nowMs: number): void {
    this.retuneFftIfNeeded(nowMs);
    for (let ch = 0; ch < BRIDGE_CH; ch++) {
      const v = ch < microvolts.length ? microvolts[ch] : 0;
      this.eegBuffers[ch].push(v);
      while (this.eegBuffers[ch].length > BRIDGE_WIN) {
        this.eegBuffers[ch].shift();
      }
    }
    const snap = snapshotBandsFromBridgeBuffers(this.eegBuffers, this.fft, BRIDGE_CH, BRIDGE_WIN);
    if (!snap) return;

    const sf = this.smoothingFactor;
    const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;
    for (const b of bands) {
      const v = Math.max(0, Math.min(1, snap.bands[b]));
      this._state.bands[b] = v;
      this._state.bandsSmooth[b] = this._state.bandsSmooth[b] * sf + v * (1 - sf);
      const db = snap.bandsDb[b];
      this._state.bandsDb[b] = db;
      this._state.bandsDbSmooth[b] = this._state.bandsDbSmooth[b] * sf + db * (1 - sf);
    }
    const idx = deriveBridgeIndices(this._state.bandsSmooth);
    this._state.relaxationIndex = idx.relaxationIndex;
    this._state.meditationIndex = idx.meditationIndex;
    this._state.focusIndex = idx.focusIndex;
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
        this._state = baseState(true, 'Athena WebSocket bridge', 'healthy');
        resolve();
      };

      ws.onerror = () => {
        finishErr('WebSocket error (relay unreachable?)');
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
        const normalized = tryNormalizeAthenaBridgeEegPacket(raw);
        if (!normalized.ok) {
          this.lastRxRejectReason = normalized.reason;
          const t = Date.now();
          if (DEBUG_ATHENA_BANDS && t - this.lastRejectLogMs >= 1500) {
            this.lastRejectLogMs = t;
            console.warn('[AthenaBridge] packet rejected:', normalized.reason, raw);
          }
          return;
        }
        const pkt = normalized.packet;
        this.lastRxRejectReason = null;
        this.lastRxAcceptSeq = pkt.seq;
        this.bridgeAcceptedTotal += 1;

        const now = Date.now();
        this.latest = {
          microvolts: pkt.u,
          labels: pkt.labels,
          seq: pkt.seq,
          deviceTime: pkt.td,
          hostTimeSec: pkt.th,
          receivedAtMs: now,
        };
        this.ingestBridgeSample(pkt.u, now);
        this._state = {
          ...this._state,
          connected: true,
          healthState: 'healthy',
          deviceName: `Athena bridge · seq ${pkt.seq}`,
        };
      };
    });
  }
}

export const athenaBridgeEegDevice = new AthenaBridgeEEGDevice();

export function isAthenaBridgeEEGDevice(d: EEGDevice): d is AthenaBridgeEEGDevice {
  return d.capabilities.deviceKind === 'athena_ws_bridge';
}
