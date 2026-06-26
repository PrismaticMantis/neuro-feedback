import type { EEGDevice } from './eeg-device';

/** WebSocket JSON bridge drivers (Athena iOS relay or BrainBit native relay) — not Muse BLE. */
export function isWebSocketBridgeEegDevice(d: EEGDevice): boolean {
  const k = d.capabilities.deviceKind;
  return k === 'athena_ws_bridge' || k === 'brainbit_bridge';
}
