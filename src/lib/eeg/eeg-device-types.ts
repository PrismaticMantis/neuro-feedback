/**
 * Device-agnostic EEG types — baseline is Muse 2; future devices (Muse Athena, BrainBit, etc.)
 * implement the same normalized shapes via adapters.
 *
 * TODO(multi-device): Add per-device capability negotiation and optional raw-sample access
 * where FFT is performed outside the browser (native SDKs).
 */

import type { ConnectionHealthState, MuseState } from '../../types';

/** Normalized headset state — currently aliased to MuseState for zero behavior change. */
export type EEGDeviceState = MuseState;

/** How the app is receiving EEG data */
export type EEGDeviceTransport = 'bluetooth' | 'osc' | null;

/** Single accelerometer sample (g or device-native units; Muse 2 uses muse-js g-force). */
export interface IMUSample {
  x: number;
  y: number;
  z: number;
}

/** Heart / PPG metrics exposed to UI and audio (optional per device). */
export interface HeartRateMetrics {
  bpm: number | null;
  confidence: number;
  lastBeatMs: number | null;
}

export interface SessionHeartSummary {
  avgHR: number | null;
  avgHRV: number | null;
}

export interface PPGDiagnostics {
  streamAvailable: boolean;
  subscribed: boolean;
  samplesReceived: number;
  confidence: number;
  connectionMode: EEGDeviceTransport;
}

/**
 * Fine-grained connection detail for UI/debug (stall vs GATT disconnect).
 * Mirrors the shape returned by the current Muse handler — keep fields stable for adapters.
 */
export interface EEGConnectionStateDetail {
  connected: boolean;
  healthState: ConnectionHealthState;
  bleTransportConnected: boolean;
  timeSinceLastUpdate: number;
  pauseDuration: number | null;
  reconnectAttempts: number;
  lastDisconnectReason: string | null;
}

/** Which sensors this device / driver can expose (used for UI and future routing). */
export interface EEGDeviceSensorCapabilities {
  eeg: boolean;
  contactQuality: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
  ppg: boolean;
  battery: boolean;
}

/**
 * Static description of a device implementation.
 * TODO(multi-device): Load from device registry or user selection instead of a single constant.
 */
export interface EEGDeviceCapabilities {
  /** Stable key: e.g. "muse2", "muse_athena", "brainbit_lite" */
  deviceKind: string;
  /** Human-readable product label */
  displayName: string;
  supportedTransports: readonly ('bluetooth' | 'osc')[];
  /** Nominal EEG sample rate used by the signal pipeline (Hz) */
  sampleRateHz: number;
  /** FFT window size used for band power (samples) */
  fftSize: number;
  eegChannelCount: number;
  /** Index-aligned with horseshoe / getElectrodeQuality() */
  eegChannelLabels: readonly string[];
  sensors: EEGDeviceSensorCapabilities;
}

/** Muse 2 reference capabilities — must stay aligned with `DEFAULT_FFT_PIPELINE` in fft-processor.ts. */
export const MUSE2_DEVICE_CAPABILITIES: EEGDeviceCapabilities = {
  deviceKind: 'muse2',
  displayName: 'Muse 2',
  supportedTransports: ['bluetooth', 'osc'],
  sampleRateHz: 256,
  fftSize: 256,
  eegChannelCount: 4,
  eegChannelLabels: ['TP9', 'AF7', 'AF8', 'TP10'],
  sensors: {
    eeg: true,
    contactQuality: true,
    accelerometer: true,
    gyroscope: true,
    ppg: true,
    battery: true,
  },
};
