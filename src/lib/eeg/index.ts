/**
 * EEG device abstraction — default implementation is Muse 2 (muse-js).
 *
 * Use `EegDeviceProvider` + `useEegDevice()` for injection; `eegDevice` remains a convenience
 * handle to the Muse 2 singleton for non-React code.
 *
 * TODO(multi-device): UI to pick `EegDeviceKind` and pass `device={createEegDevice(kind)}` to the provider.
 */

import type { EEGDevice } from './eeg-device';
import { muse2EegDevice } from './muse2-adapter';

export type { EEGDevice } from './eeg-device';
export type {
  EEGDeviceCapabilities,
  EEGDeviceSensorCapabilities,
  EEGDeviceState,
  EEGDeviceTransport,
  EEGConnectionStateDetail,
  IMUSample,
  HeartRateMetrics,
  SessionHeartSummary,
  PPGDiagnostics,
} from './eeg-device-types';
export {
  MUSE2_DEVICE_CAPABILITIES,
  ATHENA_DEVICE_CAPABILITIES,
  ATHENA_BRIDGE_WS_DEVICE_CAPABILITIES,
  BRAINBIT_BRIDGE_DEVICE_CAPABILITIES,
} from './eeg-device-types';

export { Muse2EEGDevice, muse2EegDevice } from './muse2-adapter';
export {
  AthenaEEGDevice,
  athenaEegDevice,
  ATHENA_FE8D_CHARACTERISTIC_UUID_SUFFIXES,
} from './athena-adapter';
export {
  createEegDevice,
  DEFAULT_EEG_DEVICE_KIND,
  resolveEegDeviceFromEnv,
} from './eeg-device-factory';
export type { EegDeviceKind } from './eeg-device-factory';
export { EegDeviceProvider, useEegDevice } from './EegDeviceContext';
export { horseshoeToElectrodeModel } from './electrode-sites';
export {
  averageContactScore01,
  averageContactScore01FromLegacyStatus,
  connectionQualityMetricFromSites,
  connectionQualityMetricFromLegacyStatus,
  hasEnoughGoodOrMediumContact,
  hasEnoughGoodOrMediumContactBrainBit,
  hasEnoughGoodOrMediumContactLegacy,
  overallContactSummaryFromSites,
  overallContactSummaryFromLegacyStatus,
} from './contact-quality';
export {
  ENABLE_PPG_MODULATION,
  DEBUG_PPG,
  ENABLE_ATHENA_BRIDGE_EEG_DEVICE,
  ENABLE_BRAINBIT_BRIDGE_EEG_DEVICE,
  DEBUG_ATHENA_BANDS,
  DEBUG_ATHENA_COHERENCE,
  DEBUG_BRAINBIT_BRIDGE,
} from './eeg-feature-flags';
export {
  ATHENA_BETA_ALPHA_RATIO_THRESHOLD_FACTOR,
  ATHENA_COHERENCE_MIN_CONTACT_VALIDITY,
  ATHENA_SUSTAINED_MS_FACTOR,
  ATHENA_VARIANCE_THRESHOLD,
} from './athena-coherence-stability';

export type {
  AthenaBridgeEegPacket,
  AthenaBridgeEegPacketV1,
  AthenaBridgeEegPacketV2,
} from './athena-bridge-packet';
export {
  ATHENA_BRIDGE_SCHEMA_VERSION,
  interpretDeviceTimeDeltaSeconds,
  isAthenaBridgeEegPacketV1,
  isAthenaBridgeEegPacketV2,
  parseAthenaBridgeEegPacketV2,
  tryNormalizeAthenaBridgeEegPacket,
} from './athena-bridge-packet';
export type { AthenaBridgePacketNormalizeResult } from './athena-bridge-packet';
export {
  AthenaBridgeEEGDevice,
  athenaBridgeEegDevice,
  isAthenaBridgeEEGDevice,
} from './athena-bridge-eeg-device';
export type { AthenaBridgeLatestSample } from './athena-bridge-eeg-device';
export {
  BrainBitBridgeEEGDevice,
  brainBitBridgeEegDevice,
  isBrainBitBridgeEEGDevice,
} from './brainbit-bridge-eeg-device';
export type { BrainBitBridgeLatestSample } from './brainbit-bridge-eeg-device';
export {
  BRAINBIT_COHERENCE_ALPHA_FLOOR_BASELINE_RATIO,
  BRAINBIT_COHERENCE_CALC_MIN_ALPHA,
  BRAINBIT_COHERENCE_DETECTOR_BAND_SMOOTH,
  BRAINBIT_COHERENCE_SCORE_SCALE,
  BRAINBIT_COHERENCE_SIGNAL_MIN_VARIANCE,
  BRAINBIT_COHERENCE_SIGNAL_VALID_MIN_ALPHA,
  BRAINBIT_COHERENCE_VARIANCE_SAMPLE_DEDUPE_EPSILON,
} from './brainbit-coherence-stability';
export { isWebSocketBridgeEegDevice } from './eeg-bridge-kind';

export type { FftPipelineConfig } from '../fft-processor';
export { DEFAULT_FFT_PIPELINE, FFT_SIZE, SAMPLE_RATE } from '../fft-processor';

/** Active EEG device — Muse 2 singleton; prefer `useEegDevice()` in React. */
export const eegDevice: EEGDevice = muse2EegDevice;
