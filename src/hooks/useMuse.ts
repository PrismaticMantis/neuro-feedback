// React hook for Muse EEG data

import { useState, useEffect, useCallback, useRef } from 'react';
import { museHandler, MuseHandler } from '../lib/muse-handler';
import { QuietPowerDetector, calculateCoherence, getCoherenceZone } from '../lib/quiet-power';
import type { MuseState, QuietPowerState } from '../types';

export interface UseMuseReturn {
  state: MuseState;
  quietPower: QuietPowerState;
  coherence: number;
  coherenceZone: 'quiet' | 'stabilizing' | 'noise';
  coherenceHistory: number[];
  isBluetoothAvailable: boolean;
  connectBluetooth: () => Promise<void>;
  connectOSC: (url?: string) => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const INITIAL_STATE: MuseState = {
  connected: false,
  connectionMode: null,
  deviceName: null,
  touching: false,
  connectionQuality: 0,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  bandsSmooth: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  relaxationIndex: 0,
  meditationIndex: 0,
  focusIndex: 0,
};

const INITIAL_QUIET_POWER: QuietPowerState = {
  isActive: false,
  sustainedMs: 0,
  betaAlphaRatio: 1,
  signalVariance: 0,
  noiseLevel: 0,
};

export function useMuse(): UseMuseReturn {
  const [state, setState] = useState<MuseState>(INITIAL_STATE);
  const [quietPower, setQuietPower] = useState<QuietPowerState>(INITIAL_QUIET_POWER);
  const [coherence, setCoherence] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const quietPowerDetector = useRef(new QuietPowerDetector({}));
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Update loop
  useEffect(() => {
    const updateLoop = () => {
      if (museHandler.connected) {
        const museState = museHandler.getState();
        setState(museState);

        // Calculate motion level from accelerometer
        const motionLevel = Math.abs(museHandler.accX) + Math.abs(museHandler.accY) + Math.abs(museHandler.accZ);
        const normalizedMotion = Math.min(1, motionLevel / 30);

        // Update quiet power detector
        const qpState = quietPowerDetector.current.update(museState.bandsSmooth, normalizedMotion);
        setQuietPower(qpState);

        // Calculate coherence
        const coh = calculateCoherence(museState.bandsSmooth, qpState.signalVariance);
        setCoherence(coh);

        // Update history (keep last 300 points ~= 5 min at 1Hz sample)
        setCoherenceHistory((prev) => {
          const newHistory = [...prev, coh];
          // Only add once per second approximately
          if (newHistory.length > 300) {
            return newHistory.slice(-300);
          }
          return newHistory;
        });
      }

      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };

    animationFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const connectBluetooth = useCallback(async () => {
    try {
      setError(null);
      await museHandler.connectBluetooth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    }
  }, []);

  const connectOSC = useCallback(async (url?: string) => {
    try {
      setError(null);
      await museHandler.connectOSC(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    museHandler.disconnect();
    setState(INITIAL_STATE);
    setQuietPower(INITIAL_QUIET_POWER);
    setCoherence(0);
    quietPowerDetector.current.reset();
  }, []);

  return {
    state,
    quietPower,
    coherence,
    coherenceZone: getCoherenceZone(coherence),
    coherenceHistory,
    isBluetoothAvailable: MuseHandler.isBluetoothAvailable(),
    connectBluetooth,
    connectOSC,
    disconnect,
    error,
  };
}
