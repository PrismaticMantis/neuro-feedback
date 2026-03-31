// React hook for Muse EEG data (active device comes from EegDeviceProvider / defaults to Muse 2)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEegDevice } from '../lib/eeg/EegDeviceContext';
import { horseshoeToElectrodeModel } from '../lib/eeg/electrode-sites';
import {
  connectionQualityMetricFromLegacyStatus,
  connectionQualityMetricFromSites,
} from '../lib/eeg/contact-quality';
import { CoherenceDetector, calculateCoherence, getCoherenceZone } from '../lib/flow-state';
import { DEBUG_ELECTRODES } from '../lib/feature-flags';
import type {
  MuseState,
  CoherenceStatus,
  ElectrodeStatus,
  ConnectionHealthState,
  ElectrodeSiteContact,
} from '../types';

export interface UseMuseReturn {
  state: MuseState;
  coherenceStatus: CoherenceStatus;
  coherence: number;
  coherenceZone: 'flow' | 'stabilizing' | 'noise';
  coherenceHistory: number[];
  electrodeStatus: ElectrodeStatus;
  /** Device-agnostic per-site contact — parallel to electrodeStatus for Muse 2 */
  electrodeSites: ElectrodeSiteContact[];
  ppg: { bpm: number | null; confidence: number; lastBeatMs: number | null }; // PPG heart rate metrics
  connectionHealthState: ConnectionHealthState; // Connection health for UI display
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

export function useMuse(): UseMuseReturn {
  const eegDevice = useEegDevice();
  const [state, setState] = useState<MuseState>(INITIAL_STATE);
  const [coherenceStatus, setCoherenceStatus] = useState<CoherenceStatus>(INITIAL_COHERENCE_STATUS);
  const [coherence, setCoherence] = useState(0);
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);
  const [electrodeStatus, setElectrodeStatus] = useState<ElectrodeStatus>(INITIAL_ELECTRODE_STATUS);
  const [electrodeSites, setElectrodeSites] = useState<ElectrodeSiteContact[]>([]);
  const [ppg, setPPG] = useState<{ bpm: number | null; confidence: number; lastBeatMs: number | null }>({
    bpm: null,
    confidence: 0,
    lastBeatMs: null,
  });
  const [connectionHealthState, setConnectionHealthState] = useState<ConnectionHealthState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const coherenceDetector = useRef(new CoherenceDetector({}));
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastHistoryUpdate = useRef<number>(0);
  const lastElectrodeUpdate = useRef<number>(0);
  const lastStateUpdate = useRef<number>(0);
  const lastDebugLog = useRef<number>(0);
  const wasConnectedRef = useRef<boolean>(false);

  // Electrode contact: horseshoe integers + channel labels from device capabilities
  // values 1=good, 2=medium, 3=poor, 4=off. Overall quality = good-count: 3–4→1, 1–2→0.5, 0→0.
  useEffect(() => {
    const ELECTRODE_UPDATE_MS = 100; // ~10 Hz for responsive updates (<300ms perceived)
    const STATE_UPDATE_MS = 50; // ~20 Hz for bandsDb and other state (smooth animation)
    const DEBUG_LOG_MS = 500; // ~2x/sec for debug

    const updateLoop = () => {
      if (eegDevice.connected) {
        const horseshoe = eegDevice.getElectrodeQuality();
        const museState = eegDevice.getState();
        const tNow = Date.now();

        const { legacyStatus: next, sites } = horseshoeToElectrodeModel(
          horseshoe,
          eegDevice.capabilities.eegChannelLabels,
        );
        const connectionQualityFromElectrodes =
          sites.length > 0
            ? connectionQualityMetricFromSites(sites)
            : connectionQualityMetricFromLegacyStatus(next);

        wasConnectedRef.current = true;
        
        // Update electrode status (throttled to avoid spam but always push updates)
        if (tNow - lastElectrodeUpdate.current >= ELECTRODE_UPDATE_MS) {
          lastElectrodeUpdate.current = tNow;
          // Always create fresh object to force React re-render
          setElectrodeStatus({ ...next });
          setElectrodeSites(sites);

          // Debug logging (always enabled when DEBUG_ELECTRODES flag is true)
          if (DEBUG_ELECTRODES && tNow - lastDebugLog.current >= DEBUG_LOG_MS) {
            lastDebugLog.current = tNow;
            const overallLabel = connectionQualityFromElectrodes >= 1 ? 'Strong' : connectionQualityFromElectrodes >= 0.5 ? 'Partial' : 'Poor';
            console.log(`[DEBUG_ELECTRODES] ${new Date().toISOString()} raw=[${horseshoe.join(',')}] mapped=`, next, `overall=${overallLabel} connectionQuality=${connectionQualityFromElectrodes.toFixed(2)}`);
          }
        }

        // Update all state (bandsDb, bandsSmooth, etc.) more frequently for smooth animation
        // CRITICAL: Always update state when connected to ensure live telemetry
        if (tNow - lastStateUpdate.current >= STATE_UPDATE_MS) {
          lastStateUpdate.current = tNow;
          // Get current health state from handler
          const healthState = eegDevice.getHealthState();
          setConnectionHealthState(healthState);
          
          // Always create fresh objects to force React re-render (no memoization blocking)
          setState({ 
            ...museState, 
            connectionQuality: connectionQualityFromElectrodes,
            healthState,
            bands: { ...museState.bands },
            bandsSmooth: { ...museState.bandsSmooth },
            bandsDb: { ...museState.bandsDb },
            bandsDbSmooth: { ...museState.bandsDbSmooth },
          });
        }

        // Calculate motion level from accelerometer
        const motionLevel = Math.abs(eegDevice.accX) + Math.abs(eegDevice.accY) + Math.abs(eegDevice.accZ);
        const normalizedMotion = Math.min(1, motionLevel / 30);

        // Electrode quality 0-1 for coherence (1=good, 2=medium→0.5, 3=poor, 4=off→0)
        const chN = eegDevice.capabilities.eegChannelCount;
        let sumQ = 0;
        for (let i = 0; i < chN; i++) {
          const v = horseshoe[i] ?? 4;
          if (v === 1) sumQ += 1;
          else if (v === 2) sumQ += 0.5;
        }
        const electrodeQuality = sumQ / chN;

        // Update coherence detector with electrode quality
        const csState = coherenceDetector.current.update(museState.bandsSmooth, normalizedMotion, electrodeQuality);
        setCoherenceStatus(csState);

        // Calculate coherence (also considering electrode quality)
        const coh = calculateCoherence(museState.bandsSmooth, csState.signalVariance, electrodeQuality);
        setCoherence(coh);

        // Update history at ~1Hz (every 1000ms) - always append, no change detection
        if (tNow - lastHistoryUpdate.current >= 1000) {
          lastHistoryUpdate.current = tNow;
          // Always append to history for continuous graph updates
          setCoherenceHistory((prev) => {
            const newHistory = [...prev, coh];
            // Keep last 300 points = 5 minutes at 1Hz
            return newHistory.length > 300 ? newHistory.slice(-300) : newHistory;
          });
        }

        // Update PPG metrics (heart rate)
        const ppgMetrics = eegDevice.getPPG();
        setPPG(ppgMetrics);
      } else {
        if (wasConnectedRef.current) {
          wasConnectedRef.current = false;
          setElectrodeStatus(INITIAL_ELECTRODE_STATUS);
          setElectrodeSites([]);
          setConnectionHealthState('disconnected');
          if (DEBUG_ELECTRODES) {
            console.log(`[DEBUG_ELECTRODES] ${new Date().toISOString()} disconnected`, INITIAL_ELECTRODE_STATUS);
          }
        }
      }

      // Always continue the loop - never stop while component is mounted
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };

    // Start the update loop immediately
    animationFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [eegDevice]);

  const connectBluetooth = useCallback(async () => {
    try {
      setError(null);
      await eegDevice.connectBluetooth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    }
  }, [eegDevice]);

  const connectOSC = useCallback(async (url?: string) => {
    try {
      setError(null);
      await eegDevice.connectOSC(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    }
  }, [eegDevice]);

  // Force immediate electrode status update when Muse connects (and periodically refresh)
  useEffect(() => {
    if (state.connected) {
      const updateElectrodes = () => {
        const horseshoe = eegDevice.getElectrodeQuality();
        const { legacyStatus: next, sites } = horseshoeToElectrodeModel(
          horseshoe,
          eegDevice.capabilities.eegChannelLabels,
        );
        setElectrodeStatus({ ...next });
        setElectrodeSites(sites);
      };
      
      updateElectrodes();
      // Also refresh every 200ms to catch any missed updates
      const interval = setInterval(updateElectrodes, 200);
      return () => clearInterval(interval);
    }
  }, [state.connected, eegDevice]);

  const disconnect = useCallback(() => {
    eegDevice.disconnect();
    setState(INITIAL_STATE);
    setCoherenceStatus(INITIAL_COHERENCE_STATUS);
    setElectrodeStatus(INITIAL_ELECTRODE_STATUS);
    setElectrodeSites([]);
    setCoherence(0);
    coherenceDetector.current.reset();
  }, [eegDevice]);

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
    electrodeSites,
    ppg,
    connectionHealthState,
    isBluetoothAvailable: eegDevice.isBluetoothAvailable(),
    connectBluetooth,
    connectOSC,
    disconnect,
    setThresholdSettings,
    error,
  };
}
