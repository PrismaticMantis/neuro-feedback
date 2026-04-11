/**
 * Factory for concrete EEGDevice implementations.
 *
 * TODO(brainbit_lite): return BrainBitLiteEEGDevice (likely OSC or native bridge).
 */

import type { EEGDevice } from './eeg-device';
import { athenaEegDevice } from './athena-adapter';
import { muse2EegDevice } from './muse2-adapter';

/** Discriminant for supported drivers — extend as new devices ship. */
export type EegDeviceKind = 'muse2' | 'muse_s_athena';

export const DEFAULT_EEG_DEVICE_KIND: EegDeviceKind = 'muse2';

export function createEegDevice(kind: EegDeviceKind): EEGDevice {
  switch (kind) {
    case 'muse2':
      return muse2EegDevice;
    case 'muse_s_athena':
      return athenaEegDevice;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
