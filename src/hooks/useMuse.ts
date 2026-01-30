// React hook for Muse EEG data

import { useState, useEffect, useCallback, useRef } from 'react';
import { museHandler, MuseHandler } from '../lib/muse-handler';
import { CoherenceDetector, calculateCoherence, getCoherenceZone } from '../lib/flow-state';
import { DEBUG_ELECTRODES } from '../lib/feature-flags';
import type { MuseState, CoherenceStatus, ElectrodeStatus, ElectrodeQuality } from '../types';

export interface UseMuseReturn {
  state: MuseState;
  coherenceStatus: CoherenceStatus;
  coherence: number;
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  coherenceHistory: number[];
  electrodeStatus: ElectrodeStatus;
  ppg: { bpm: number | null; confidence: number; lastBeatMs: number | null }; // PPG heart rate metrics
  isBluetoothAvailable: boolean;
  connectBluetooth: () => Promise<void>;
  connectOSC: (url?: string) => Promise<void>;
  disconnect: () => void;
  setThresholdSettings: (settings: { coherenceThreshold: number; timeThreshold: number; useRelativeMode?: boolean }) => void;
  error: string | null;
}

const INITIAL_STATE: MuseState = {
  connected: false,
  connectionMode: null,
  deviceName: null,
  touching: false,
  connectionQuality: 0,
  batteryLevel: -1,
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  bandsSmooth: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  bandsDb: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  bandsDbSmooth: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  relaxationIndex: 0,
  meditationIndex: 0,
  focusIndex: 0,
};

const INITIAL_COHERENCE_STATUS: CoherenceStatus = {
  isActive: false,
  sustainedMs: 0,
  betaAlphaRatio: 1,
  signalVariance: 0,
  noiseLevel: 0,
};

const INITIAL_ELECTRODE_STATUS: ElectrodeStatus = {
  tp9: 'off',
  af7: 'off',
  af8: 'off',
  tp10: 'off',
};

// Convert horseshoe value (1-4) to electrode quality
function horseshoeToQuality(value: number): ElectrodeQuality {
  if (value === 1) return 'good';
  if (value === 2) return 'medium';
  if (value === 3) return 'poor';
  return 'off';
}

export function useMuse(): UseMuseReturn {
  const [state, setState] = useState<MuseState>(INITIAL_STATE);
  const [coherenceStatus, setCoherenceStatus] = useState<CoherenceStatus>(INITIAL_COHERENCE_STATUS);
  const [coherence, setCoherence] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);
  const [electrodeStatus, setElectrodeStatus] = useState<ElectrodeStatus>(INITIAL_ELECTRODE_STATUS);
  const [ppg, setPPG] = useState<{ bpm: number | null; confidence: number; lastBeatMs: number | null }>({
    bpm: null,
    confidence: 0,
    lastBeatMs: null,
  });
  const [error, setError] = useState<string | null>(null);

  const coherenceDetector = useRef(new CoherenceDetector({}));
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastHistoryUpdate = useRef<number>(0);
  const lastElectrodeUpdate = useRef<number>(0);
  const lastElectrodeStatus = useRef<ElectrodeStatus>(INITIAL_ELECTRODE_STATUS);

  // Update loop
  useEffect(() => {
    const ELECTRODE_UPDATE_MS = 300; // ~3 Hz max to avoid re-render spam

    const updateLoop = () => {
      if (museHandler.connected) {
        const museState = museHandler.getState();
        setState(museState);

        const horseshoe = museHandler.getElectrodeQuality();

        // Update electrode status from horseshoe data (throttled)
        const tNow = Date.now();
        if (tNow - lastElectrodeUpdate.current >= ELECTRODE_UPDATE_MS) {
          lastElectrodeUpdate.current = tNow;
          const next: ElectrodeStatus = {
            tp9: horseshoeToQuality(horseshoe[0]),
            af7: horseshoeToQuality(horseshoe[1]),
            af8: horseshoeToQuality(horseshoe[2]),
            tp10: horseshoeToQuality(horseshoe[3]),
          };
          const prev = lastElectrodeStatus.current;
          const changed =
            next.tp9 !== prev.tp9 || next.af7 !== prev.af7 || next.af8 !== prev.af8 || next.tp10 !== prev.tp10;
          if (changed) {
            lastElectrodeStatus.current = next;
            setElectrodeStatus(next);
            if (DEBUG_ELECTRODES) {
              console.log(`[DEBUG_ELECTRODES] ${new Date().toISOString()}`, next);
            }
          }
        }

        // Calculate motion level from accelerometer
        const motionLevel = Math.abs(museHandler.accX) + Math.abs(museHandler.accY) + Math.abs(museHandler.accZ);
        const normalizedMotion = Math.min(1, motionLevel / 30);

        // Get electrode contact quality (0-1 scale)
        // Quality: 1=good, 2=medium, 3=poor, 4=off
        // Convert to 0-1 where 1 is best
        const electrodeQuality = horseshoe.reduce((sum: number, v: number) => {
          if (v === 1) return sum + 1;      // good = 1.0
          if (v === 2) return sum + 0.5;    // medium = 0.5
          return sum;                        // poor/off = 0
        }, 0) / 4;

        // Update coherence detector with electrode quality
        const csState = coherenceDetector.current.update(museState.bandsSmooth, normalizedMotion, electrodeQuality);
        setCoherenceStatus(csState);

        // Calculate coherence (also considering electrode quality)
        const coh = calculateCoherence(museState.bandsSmooth, csState.signalVariance, electrodeQuality);
        setCoherence(coh);

        // Update history at ~1Hz (every 1000ms)
        if (tNow - lastHistoryUpdate.current >= 1000) {
          lastHistoryUpdate.current = tNow;
          setCoherenceHistory((prev) => {
            const newHistory = [...prev, coh];
            // Keep last 300 points = 5 minutes at 1Hz
            if (newHistory.length > 300) {
              return newHistory.slice(-300);
            }
            return newHistory;
          });
        }

        // Update PPG metrics (heart rate)
        const ppgMetrics = museHandler.getPPG();
        setPPG(ppgMetrics);
      } else {
        // Muse disconnected: reset electrode status to unknown/off
        if (
          lastElectrodeStatus.current.tp9 !== 'off' ||
          lastElectrodeStatus.current.af7 !== 'off' ||
          lastElectrodeStatus.current.af8 !== 'off' ||
          lastElectrodeStatus.current.tp10 !== 'off'
        ) {
          lastElectrodeStatus.current = INITIAL_ELECTRODE_STATUS;
          setElectrodeStatus(INITIAL_ELECTRODE_STATUS);
          if (DEBUG_ELECTRODES) {
            console.log(`[DEBUG_ELECTRODES] ${new Date().toISOString()} disconnected`, INITIAL_ELECTRODE_STATUS);
          }
        }
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
    setCoherenceStatus(INITIAL_COHERENCE_STATUS);
    setElectrodeStatus(INITIAL_ELECTRODE_STATUS);
    setCoherence(0);
    coherenceDetector.current.reset();
  }, []);

  const setThresholdSettings = useCallback((settings: { coherenceThreshold: number; timeThreshold: number; useRelativeMode?: boolean }) => {
    coherenceDetector.current.setConfig({
      sustainedMs: settings.timeThreshold,
      // Convert coherence threshold to beta/alpha ratio threshold
      // Higher coherence threshold = stricter condition = lower ratio threshold
      betaAlphaRatioThreshold: 1.0 - (settings.coherenceThreshold - 0.7) * 2,
      useRelativeMode: settings.useRelativeMode ?? false, // PART 1: Use relative mode if specified (Easy mode)
    });
  }, []);

  return {
    state,
    coherenceStatus,
    coherence,
    coherenceZone: getCoherenceZone(coherence),
    coherenceHistory,
    electrodeStatus,
    ppg,
    isBluetoothAvailable: MuseHandler.isBluetoothAvailable(),
    connectBluetooth,
    connectOSC,
    disconnect,
    setThresholdSettings,
    error,
  };
}
