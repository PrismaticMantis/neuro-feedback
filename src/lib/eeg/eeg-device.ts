import type { BrainwaveBandsDb, ConnectionHealthState } from '../../types';
import type {
  EEGConnectionStateDetail,
  EEGDeviceCapabilities,
  EEGDeviceState,
  HeartRateMetrics,
  PPGDiagnostics,
  SessionHeartSummary,
} from './eeg-device-types';

/**
 * Pluggable EEG device driver — one implementation per hardware family.
 * The app should depend on this interface, not on Muse-specific APIs.
 */
export interface EEGDevice {
  readonly capabilities: EEGDeviceCapabilities;

  isBluetoothAvailable(): boolean;

  connectBluetooth(): Promise<void>;

  connectOSC(url?: string): Promise<void>;

  disconnect(): void;

  get connected(): boolean;

  get bleTransportConnected(): boolean;

  getHealthState(): ConnectionHealthState;

  getState(): EEGDeviceState;

  /**
   * Per-channel contact / signal quality (device-specific encoding).
   * Muse 2: horseshoe 1–4 per electrode index (TP9, AF7, AF8, TP10).
   */
  getElectrodeQuality(): number[];

  getConnectionStateDetail(): EEGConnectionStateDetail;

  getPPG(): HeartRateMetrics;

  getSessionPPGSummary(): SessionHeartSummary;

  resetSessionPPG(): void;

  getPPGDiagnostics(): PPGDiagnostics;

  /** Accelerometer (if available) — Muse 2 via muse-js */
  get accX(): number;
  get accY(): number;
  get accZ(): number;
  get accelSubscribed(): boolean;
  get accelSampleCount(): number;

  /** Broadband dB bands — used by movement fallback heuristics */
  get bandsDb(): BrainwaveBandsDb;
}
