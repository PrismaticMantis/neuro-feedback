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

/**
 * Map muse-js horseshoe value to UI electrode state.
 * Muse semantics: 1 = good, 2 = medium, 3 = poor, 4 = off (no inverted thresholds).
 */
function horseshoeToQuality(value: number): ElectrodeQuality {
  if (value === 1) return 'good';
  if (value === 2) return 'medium';
  if (value === 3) return 'poor';
  return 'off';
}

/**
 * Overall signal quality from electrode states (same green-count logic as connection meter).
 * 3-4 good → strong, 1-2 good → partial, 0 good → poor.
 */
function electrodeStatusToConnectionQuality(status: ElectrodeStatus): number {
  const goodCount = [status.tp9, status.af7, status.af8, status.tp10].filter((q) => q === 'good').length;
  return goodCount >= 3 ? 1 : goodCount >= 1 ? 0.5 : 0;
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
  const lastDebugLog = useRef<number>(0);
  const wasConnectedRef = useRef<boolean>(false);

  // Electrode contact: source = museHandler.getElectrodeQuality() [TP9, AF7, AF8, TP10];
  // values 1=good, 2=medium, 3=poor, 4=off. Overall quality = good-count: 3–4→1, 1–2→0.5, 0→0.
  useEffect(() => {
    const ELECTRODE_UPDATE_MS = 150; // ~6–7 Hz so nodes and meter update within ~0.2s
    const DEBUG_LOG_MS = 500; // ~2x/sec for debug

    const updateLoop = () => {
      if (museHandler.connected) {
        const horseshoe = museHandler.getElectrodeQuality();
        const museState = museHandler.getState();
        const tNow = Date.now();

        const next: ElectrodeStatus = {
          tp9: horseshoeToQuality(horseshoe[0] ?? 4),
          af7: horseshoeToQuality(horseshoe[1] ?? 4),
          af8: horseshoeToQuality(horseshoe[2] ?? 4),
          tp10: horseshoeToQuality(horseshoe[3] ?? 4),
        };
        const connectionQualityFromElectrodes = electrodeStatusToConnectionQuality(next);

        wasConnectedRef.current = true;
        // Always update electrode status when connected (throttled to avoid spam)
        if (tNow - lastElectrodeUpdate.current >= ELECTRODE_UPDATE_MS) {
          lastElectrodeUpdate.current = tNow;
          // Force React to see this as a new object by creating a fresh copy
          setElectrodeStatus({ ...next });
          setState({ ...museState, connectionQuality: connectionQualityFromElectrodes });

          if (DEBUG_ELECTRODES && tNow - lastDebugLog.current >= DEBUG_LOG_MS) {
            lastDebugLog.current = tNow;
            const overallLabel = connectionQualityFromElectrodes >= 1 ? 'Strong' : connectionQualityFromElectrodes >= 0.5 ? 'Partial' : 'Poor';
            console.log(`[DEBUG_ELECTRODES] ${new Date().toISOString()} raw=[${horseshoe.join(',')}] mapped=`, next, `overall=${overallLabel}`);
          }
        }

        // Calculate motion level from accelerometer
        const motionLevel = Math.abs(museHandler.accX) + Math.abs(museHandler.accY) + Math.abs(museHandler.accZ);
        const normalizedMotion = Math.min(1, motionLevel / 30);

        // Electrode quality 0-1 for coherence (1=good, 2=medium→0.5, 3=poor, 4=off→0)
        const electrodeQuality = horseshoe.reduce((sum: number, v: number) => {
          if (v === 1) return sum + 1;
          if (v === 2) return sum + 0.5;
          return sum;
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
        if (wasConnectedRef.current) {
          wasConnectedRef.current = false;
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

  // Force immediate electrode status update when Muse connects
  useEffect(() => {
    if (state.connected) {
      const horseshoe = museHandler.getElectrodeQuality();
      const next: ElectrodeStatus = {
        tp9: horseshoeToQuality(horseshoe[0] ?? 4),
        af7: horseshoeToQuality(horseshoe[1] ?? 4),
        af8: horseshoeToQuality(horseshoe[2] ?? 4),
        tp10: horseshoeToQuality(horseshoe[3] ?? 4),
      };
      setElectrodeStatus({ ...next });
    }
  }, [state.connected]);

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
