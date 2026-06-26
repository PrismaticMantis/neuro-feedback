import { useEffect, useState } from 'react';
import { useEegDevice } from '../lib/eeg/EegDeviceContext';
import { isBrainBitBridgeEEGDevice } from '../lib/eeg/brainbit-bridge-eeg-device';
import type { BrainBitStreamHealthSnapshot } from '../lib/eeg/brainbit-stream-health';
import type { ConnectionHealthState } from '../types';

export function useBrainBitStreamHealth(
  enabled: boolean,
  connectionHealthState: ConnectionHealthState,
  pollMs = 400,
): BrainBitStreamHealthSnapshot | null {
  const eegDevice = useEegDevice();
  const [health, setHealth] = useState<BrainBitStreamHealthSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || !isBrainBitBridgeEEGDevice(eegDevice)) {
      setHealth(null);
      return;
    }

    const tick = () => {
      setHealth(eegDevice.getBrainBitStreamHealth(connectionHealthState));
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => clearInterval(id);
  }, [enabled, eegDevice, connectionHealthState, pollMs]);

  return health;
}
