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
export { MUSE2_DEVICE_CAPABILITIES } from './eeg-device-types';

export { Muse2EEGDevice, muse2EegDevice } from './muse2-adapter';
export { createEegDevice, DEFAULT_EEG_DEVICE_KIND } from './eeg-device-factory';
export type { EegDeviceKind } from './eeg-device-factory';
export { EegDeviceProvider, useEegDevice } from './EegDeviceContext';
export { horseshoeToElectrodeModel } from './electrode-sites';
export {
  averageContactScore01,
  averageContactScore01FromLegacyStatus,
  connectionQualityMetricFromSites,
  connectionQualityMetricFromLegacyStatus,
  hasEnoughGoodOrMediumContact,
  hasEnoughGoodOrMediumContactLegacy,
  overallContactSummaryFromSites,
  overallContactSummaryFromLegacyStatus,
} from './contact-quality';
export { ENABLE_PPG_MODULATION, DEBUG_PPG } from './eeg-feature-flags';

export type { FftPipelineConfig } from '../fft-processor';
export { DEFAULT_FFT_PIPELINE, FFT_SIZE, SAMPLE_RATE } from '../fft-processor';

/** Active EEG device — Muse 2 singleton; prefer `useEegDevice()` in React. */
export const eegDevice: EEGDevice = muse2EegDevice;
