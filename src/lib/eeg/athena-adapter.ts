/**
 * Muse S (Athena) — `EEGDevice` scaffold. Does not perform BLE I/O yet; Muse 2 / muse-js path is unchanged.
 *
 * ------------------------------------------------------------------------------------------------
 * Integration map (implement later — do not guess wire protocol here):
 *
 * 1) `connectBluetooth()` → planned private pipeline:
 *    - `requestAthenaDevice()` — Web Bluetooth `requestDevice({ filters: [{ services: [0xfe8d] }] })`
 *    - `connectGatt()` — `device.gatt.connect()`
 *    - `openFe8dService()` — `getPrimaryService(0xfe8d)`
 *    - Resolve characteristics documented for Athena (short UUID suffixes): `0001`, `0013`, `0014`, `0015`
 *      (full 128-bit UUIDs per Web Bluetooth, see `ATHENA_FE8D_CHARACTERISTIC_UUID_SUFFIXES`).
 *    - `runAthenaControlHandshake()` — writes / subscriptions on the control path as required so streams
 *      start (exact bytes TBD).
 *    - `subscribeAthenaDataChannels()` — `startNotifications()` where applicable; pipe payloads to parsers.
 *
 * 2) `parseAthenaEegPayload(raw: DataView)` — decode frames → per-channel samples → feed same band/FFT
 *    pipeline as Muse 2 once rates and layout are known.
 *
 * 3) Disconnect / reconnect / health: mirror `MuseHandler` patterns where sensible.
 * ------------------------------------------------------------------------------------------------
 */

import type { BrainwaveBandsDb } from '../../types';
import type { ConnectionHealthState } from '../../types';
import type { EEGDevice } from './eeg-device';
import {
  ATHENA_DEVICE_CAPABILITIES,
  type EEGDeviceCapabilities,
  type EEGConnectionStateDetail,
  type HeartRateMetrics,
  type PPGDiagnostics,
  type SessionHeartSummary,
} from './eeg-device-types';
import type { EEGDeviceState } from './eeg-device-types';

/** 128-bit UUID short-name suffixes observed on Athena under FE8D (for future GATT code — not wired). */
export const ATHENA_FE8D_CHARACTERISTIC_UUID_SUFFIXES = [
  '273e0001-4c4d-454d-96be-f03bac821358',
  '273e0013-4c4d-454d-96be-f03bac821358',
  '273e0014-4c4d-454d-96be-f03bac821358',
  '273e0015-4c4d-454d-96be-f03bac821358',
] as const;

const ZERO_BANDS = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

const ATHENA_IDLE_STATE: EEGDeviceState = {
  connected: false,
  connectionMode: null,
  deviceName: null,
  touching: false,
  connectionQuality: 0,
  batteryLevel: -1,
  healthState: 'disconnected',
  bands: { ...ZERO_BANDS },
  bandsSmooth: { ...ZERO_BANDS },
  bandsDb: { ...ZERO_BANDS },
  bandsDbSmooth: { ...ZERO_BANDS },
  relaxationIndex: 0,
  meditationIndex: 0,
  focusIndex: 0,
};

const DISCONNECTED_DETAIL: EEGConnectionStateDetail = {
  connected: false,
  healthState: 'disconnected',
  bleTransportConnected: false,
  timeSinceLastUpdate: Number.POSITIVE_INFINITY,
  pauseDuration: null,
  reconnectAttempts: 0,
  lastDisconnectReason: null,
};

const EMPTY_PPG: HeartRateMetrics = { bpm: null, confidence: 0, lastBeatMs: null };
const EMPTY_SESSION_HR: SessionHeartSummary = { avgHR: null, avgHRV: null };
const EMPTY_PPG_DIAG: PPGDiagnostics = {
  streamAvailable: false,
  subscribed: false,
  samplesReceived: 0,
  confidence: 0,
  connectionMode: null,
};

const ZERO_BANDS_DB: BrainwaveBandsDb = { ...ZERO_BANDS };

export class AthenaEEGDevice implements EEGDevice {
  readonly capabilities: EEGDeviceCapabilities = ATHENA_DEVICE_CAPABILITIES;

  isBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async connectBluetooth(): Promise<void> {
    throw new Error(
      'Muse S (Athena): Bluetooth EEG not implemented yet. ' +
        'Next: GATT FE8D + control handshake on 273e0001… + stream parse for 273e0013–15. ' +
        'See athena-adapter.ts integration map.'
    );
  }

  async connectOSC(_url?: string): Promise<void> {
    throw new Error('Muse S (Athena): OSC is not supported by this adapter.');
  }

  disconnect(): void {
    /* no-op until BLE session exists */
  }

  get connected(): boolean {
    return false;
  }

  get bleTransportConnected(): boolean {
    return false;
  }

  getHealthState(): ConnectionHealthState {
    return 'disconnected';
  }

  getState(): EEGDeviceState {
    return ATHENA_IDLE_STATE;
  }

  getElectrodeQuality(): number[] {
    return [4, 4, 4, 4];
  }

  getConnectionStateDetail(): EEGConnectionStateDetail {
    return { ...DISCONNECTED_DETAIL };
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
}

/** Singleton for `createEegDevice('muse_s_athena')` — no BLE state until implemented. */
export const athenaEegDevice = new AthenaEEGDevice();
