import { useEffect, useState } from 'react';
import { useEegDevice } from '../lib/eeg/EegDeviceContext';
import {
  isBrainBitBridgeEEGDevice,
  type BrainBitChannelActivitySnapshot,
} from '../lib/eeg/brainbit-bridge-eeg-device';

/**
 * Polls per-channel BrainBit EEG activity (A1/C3/C4/A2) for the setup diagnostics.
 * Reports channel *activity* and 0.4 V stuck detection — not pad contact / impedance.
 */
export function useBrainBitChannelActivity(
  enabled: boolean,
  pollMs = 400,
): BrainBitChannelActivitySnapshot | null {
  const eegDevice = useEegDevice();
  const [activity, setActivity] = useState<BrainBitChannelActivitySnapshot | null>(null);

  useEffect(() => {
    if (!enabled || !isBrainBitBridgeEEGDevice(eegDevice)) {
      setActivity(null);
      return;
    }

    const tick = () => {
      setActivity(eegDevice.getBrainBitChannelDiagnostics());
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => clearInterval(id);
  }, [enabled, eegDevice, pollMs]);

  return activity;
}
