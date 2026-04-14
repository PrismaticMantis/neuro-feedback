/**
 * Factory for concrete EEGDevice implementations.
 *
 * TODO(brainbit_lite): return BrainBitLiteEEGDevice (likely OSC or native bridge).
 */

import type { EEGDevice } from './eeg-device';
import { athenaBridgeEegDevice } from './athena-bridge-eeg-device';
import { athenaEegDevice } from './athena-adapter';
import { ENABLE_ATHENA_BRIDGE_EEG_DEVICE } from './eeg-feature-flags';
import { muse2EegDevice } from './muse2-adapter';

/** Discriminant for supported drivers — extend as new devices ship. */
export type EegDeviceKind = 'muse2' | 'muse_s_athena' | 'athena_bridge';

export const DEFAULT_EEG_DEVICE_KIND: EegDeviceKind = 'muse2';

export function createEegDevice(kind: EegDeviceKind): EEGDevice {
  switch (kind) {
    case 'muse2':
      return muse2EegDevice;
    case 'muse_s_athena':
      return athenaEegDevice;
    case 'athena_bridge':
      if (!ENABLE_ATHENA_BRIDGE_EEG_DEVICE) {
        throw new Error(
          'EEG device "athena_bridge" is disabled. Set VITE_ENABLE_ATHENA_BRIDGE_EEG_DEVICE=true in .env and rebuild.'
        );
      }
      return athenaBridgeEegDevice;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Optional env override for the root `EegDeviceProvider` (default remains Muse 2).
 * `.env.local`: `VITE_ENABLE_ATHENA_BRIDGE_EEG_DEVICE=true` and `VITE_EEG_DEVICE_KIND=athena_bridge`
 */
export function resolveEegDeviceFromEnv(): EEGDevice | undefined {
  const raw = import.meta.env.VITE_EEG_DEVICE_KIND as string | undefined;
  if (raw == null || raw === '' || raw === 'muse2') return undefined;
  if (raw === 'athena_bridge') {
    if (!ENABLE_ATHENA_BRIDGE_EEG_DEVICE) {
      console.warn(
        '[EEG] VITE_EEG_DEVICE_KIND=athena_bridge ignored: set VITE_ENABLE_ATHENA_BRIDGE_EEG_DEVICE=true'
      );
      return undefined;
    }
    return createEegDevice('athena_bridge');
  }
  if (raw === 'muse_s_athena') return createEegDevice('muse_s_athena');
  console.warn('[EEG] Unknown VITE_EEG_DEVICE_KIND:', raw);
  return undefined;
}
