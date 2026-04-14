/**
 * React context for the active EEG device — enables injection in tests and future device picker UI.
 * Defaults to Muse 2 when no provider is present (safe for isolated components / legacy entrypoints).
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { EEGDevice } from './eeg-device';
import {
  createEegDevice,
  DEFAULT_EEG_DEVICE_KIND,
  resolveEegDeviceFromEnv,
} from './eeg-device-factory';

const EegDeviceReactContext = createContext<EEGDevice | null>(null);

export interface EegDeviceProviderProps {
  children: ReactNode;
  /** Override for tests or when multiple devices are selectable — defaults to Muse 2 or `VITE_EEG_DEVICE_KIND`. */
  device?: EEGDevice;
}

export function EegDeviceProvider({ children, device }: EegDeviceProviderProps) {
  const value =
    device ?? resolveEegDeviceFromEnv() ?? createEegDevice(DEFAULT_EEG_DEVICE_KIND);
  return (
    <EegDeviceReactContext.Provider value={value}>{children}</EegDeviceReactContext.Provider>
  );
}

/**
 * Active EEG device from context, falling back to the default Muse 2 singleton if unwrapped.
 * Prefer wrapping the app with EegDeviceProvider so the fallback is unused in production.
 */
export function useEegDevice(): EEGDevice {
  const ctx = useContext(EegDeviceReactContext);
  if (ctx) return ctx;
  return createEegDevice(DEFAULT_EEG_DEVICE_KIND);
}
