/**
 * EEGDevice implementation for the Athena iOS → WebSocket relay (v2 packets).
 * Does not use muse-js or muse-handler. Reversible PoC: remove flag + this file to drop the path.
 */

import type { BrainwaveBandsDb, ConnectionHealthState, MuseState } from '../../types';
import type { EEGDevice } from './eeg-device';
import { parseAthenaBridgeEegPacketV2 } from './athena-bridge-packet';
import {
  ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES,
  type EEGConnectionStateDetail,
  type EEGDeviceCapabilities,
  type HeartRateMetrics,
  type PPGDiagnostics,
  type SessionHeartSummary,
} from './eeg-device-types';

const STALL_MS = 4000;
const ZERO_BANDS = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
const ZERO_BANDS_DB: BrainwaveBandsDb = { ...ZERO_BANDS };

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

  private ws: WebSocket | null = null;
  private _connected = false;
  private latest: AthenaBridgeLatestSample | null = null;
  private lastWsError: string | null = null;
  private _state: MuseState = baseState(false, null, 'disconnected');

  /** Last validated v2 frame (microvolts + metadata). */
  getLatestBridgeSample(): AthenaBridgeLatestSample | null {
    return this.latest;
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
    return ZERO_BANDS_DB;
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
        const pkt = parseAthenaBridgeEegPacketV2(raw);
        if (!pkt) return;

        const now = Date.now();
        this.latest = {
          microvolts: pkt.u,
          labels: pkt.labels,
          seq: pkt.seq,
          deviceTime: pkt.td,
          hostTimeSec: pkt.th,
          receivedAtMs: now,
        };
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
