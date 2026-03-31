/**
 * Factory for concrete EEGDevice implementations.
 *
 * TODO(muse_athena): return MuseAthenaEEGDevice when hardware/SDK is integrated.
 * TODO(brainbit_lite): return BrainBitLiteEEGDevice (likely OSC or native bridge).
 */

import type { EEGDevice } from './eeg-device';
import { muse2EegDevice } from './muse2-adapter';

/** Discriminant for supported drivers — extend as new devices ship. */
export type EegDeviceKind = 'muse2';

export const DEFAULT_EEG_DEVICE_KIND: EegDeviceKind = 'muse2';

export function createEegDevice(kind: EegDeviceKind): EEGDevice {
  switch (kind) {
    case 'muse2':
      return muse2EegDevice;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
