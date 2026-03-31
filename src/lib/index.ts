// Library exports
export { museHandler, MuseHandler, DEBUG_ACCEL } from './muse-handler';
export {
  eegDevice,
  muse2EegDevice,
  Muse2EEGDevice,
  MUSE2_DEVICE_CAPABILITIES,
  createEegDevice,
  DEFAULT_EEG_DEVICE_KIND,
  EegDeviceProvider,
  useEegDevice,
  horseshoeToElectrodeModel,
  ENABLE_PPG_MODULATION,
  DEBUG_PPG,
  DEFAULT_FFT_PIPELINE,
  FFT_SIZE,
  SAMPLE_RATE,
} from './eeg';
export type { EEGDevice, EegDeviceKind } from './eeg';
export type { FftPipelineConfig } from './fft-processor';
export type {
  EEGDeviceCapabilities,
  EEGDeviceState,
  EEGConnectionStateDetail,
} from './eeg/eeg-device-types';
export { audioEngine, AudioEngine } from './audio-engine';
export { movementDetector, MovementDetector, DEBUG_MOVEMENT } from './movement-detector';
export { CoherenceDetector, calculateCoherence, getCoherenceZone } from './flow-state';
export { storage, StorageManager, calculateSessionStats, formatTime, formatTimeWithUnit } from './storage';
export { FFTProcessor } from './fft-processor';
