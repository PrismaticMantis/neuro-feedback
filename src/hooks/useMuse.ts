// React hook for Muse EEG data (active device comes from EegDeviceProvider / defaults to Muse 2)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEegDevice } from '../lib/eeg/EegDeviceContext';
import { horseshoeToElectrodeModel } from '../lib/eeg/electrode-sites';
import {
  averageContactScore01,
  averageContactScore01BrainBitAudio,
  averageContactScore01FromLegacyStatus,
  connectionQualityMetricFromLegacyStatus,
} from '../lib/eeg/contact-quality';
import { CoherenceDetector, calculateCoherence, getCoherenceZone } from '../lib/flow-state';
import { audioEngine } from '../lib/audio-engine';
import { DEBUG_ELECTRODES } from '../lib/feature-flags';
import {
  BRAINBIT_AUDIT_MODE,
  DEBUG_ATHENA_BANDS,
  DEBUG_ATHENA_COHERENCE,
  DEBUG_BRAINBIT_BRIDGE,
} from '../lib/eeg/eeg-feature-flags';
import { isAthenaBridgeEEGDevice } from '../lib/eeg/athena-bridge-eeg-device';
import { isBrainBitBridgeEEGDevice } from '../lib/eeg/brainbit-bridge-eeg-device';
import {
  BRAINBIT_CONTACT_ARTIFACT_ABS_FULL_UV,
  BRAINBIT_CONTACT_ARTIFACT_ABS_START_UV,
  BRAINBIT_AUDIO_SM_ENTER_EASY,
  BRAINBIT_AUDIO_SM_ENTER_MED,
  BRAINBIT_UI_FLOW_ZONE_MIN_EASY,
  BRAINBIT_UI_FLOW_ZONE_MIN_MED,
  BRAINBIT_CONTACT_ARTIFACT_VAR_FULL,
  BRAINBIT_CONTACT_ARTIFACT_VAR_START,
  BRAINBIT_COHERENCE_ALPHA_CEILING_BASELINE_RATIO,
  BRAINBIT_COHERENCE_ALPHA_FLOOR_BASELINE_RATIO,
  BRAINBIT_COHERENCE_CALC_MIN_ALPHA,
  BRAINBIT_COHERENCE_DWELL_BREAK_GRACE_MS,
  BRAINBIT_COHERENCE_MIN_CONTACT_VALIDITY,
  BRAINBIT_COHERENCE_SCORE_SCALE,
  BRAINBIT_COHERENCE_SIGNAL_MIN_VARIANCE,
  BRAINBIT_COHERENCE_SIGNAL_VALID_MIN_ALPHA,
  BRAINBIT_COHERENCE_VARIANCE_SAMPLE_DEDUPE_EPSILON,
} from '../lib/eeg/brainbit-coherence-stability';
import {
  brainBitChannelReadiness01,
  brainBitCoherenceElectrodeQuality01,
  deriveBrainBitChannelSessionMode,
  type BrainBitChannelSessionMode,
} from '../lib/eeg/brainbit-channel-state';
import { computeBrainBitSignalConfidence } from '../lib/eeg/brainbit-signal-confidence';
import { deriveBrainBitStreamHealth } from '../lib/eeg/brainbit-stream-health';
import { logBrainBitSessionEvent } from '../lib/eeg/brainbit-session-events';
import { isWebSocketBridgeEegDevice } from '../lib/eeg/eeg-bridge-kind';
import {
  ATHENA_AUDIO_SM_ENTER_EASY,
  ATHENA_AUDIO_SM_ENTER_MED,
  ATHENA_BETA_ALPHA_RATIO_THRESHOLD_FACTOR,
  ATHENA_COHERENCE_MIN_CONTACT_VALIDITY,
  ATHENA_SUSTAINED_MS_FACTOR,
  ATHENA_UI_FLOW_ZONE_MIN,
  ATHENA_VARIANCE_THRESHOLD,
} from '../lib/eeg/athena-coherence-stability';
import type {
  MuseState,
  CoherenceStatus,
  ElectrodeStatus,
  ConnectionHealthState,
  ElectrodeSiteContact,
  AthenaCoherenceDebugSnapshot,
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
  /** BrainBit: 0–1 signal confidence (channel count, stale, stream). */
  brainBitSignalConfidence: number;
  /** BrainBit: normal (3–4 ch) / fallback (2 ch) / insufficient. */
  brainBitChannelSessionMode: BrainBitChannelSessionMode;
  /** Bridge coherence debug: Athena + `VITE_DEBUG_ATHENA_COHERENCE`, or BrainBit + `VITE_DEBUG_BRAINBIT_BRIDGE`. */
  athenaCoherenceDebug: AthenaCoherenceDebugSnapshot | undefined;
  isBluetoothAvailable: boolean;
  connectBluetooth: () => Promise<void>;
  connectOSC: (url?: string) => Promise<void>;
  disconnect: () => void;
  setThresholdSettings: (settings: {
    coherenceThreshold: number;
    timeThreshold: number;
    useRelativeMode?: boolean;
    /** Session difficulty: `coherenceSensitivity < 0.33` — aligns audio SM + debug with `AudioEngine`. */
    isEasyPreset?: boolean;
  }) => void;
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

/** Muse non-Easy audio SM enter (matches `audio-engine.ts`); Easy Muse = 0.68. */
const DEBUG_MUSE_AUDIO_SM_ENTER_EASY = 0.68;
const DEBUG_MUSE_AUDIO_SM_ENTER_MED = 0.75;
const DEBUG_MUSE_UI_FLOW_ZONE_MIN = 0.7;
const DEBUG_AUDIO_MIN_CONTACT = 0.5;
const DEBUG_AUDIO_MAX_DATA_GAP_MS = 5000;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function ramp01(value: number, start: number, full: number): number {
  if (full <= start) return value >= full ? 1 : 0;
  return clamp01((value - start) / (full - start));
}

function brainBitContactArtifactScore01(
  contact: { perCh: { absAmp: number; vari: number }[] } | null,
): number {
  if (!contact || contact.perCh.length === 0) return 0;
  let score = 0;
  for (const ch of contact.perCh) {
    score = Math.max(
      score,
      ramp01(ch.vari, BRAINBIT_CONTACT_ARTIFACT_VAR_START, BRAINBIT_CONTACT_ARTIFACT_VAR_FULL),
      ramp01(ch.absAmp, BRAINBIT_CONTACT_ARTIFACT_ABS_START_UV, BRAINBIT_CONTACT_ARTIFACT_ABS_FULL_UV),
    );
  }
  return score;
}

function rewardDebugThresholds(
  deviceKind: 'athena' | 'brainbit' | 'muse',
  isEasyPreset: boolean,
) {
  const isAthena = deviceKind === 'athena';
  const isBrainBit = deviceKind === 'brainbit';
  const audioSmEnter = isAthena
    ? isEasyPreset
      ? ATHENA_AUDIO_SM_ENTER_EASY
      : ATHENA_AUDIO_SM_ENTER_MED
    : isBrainBit
      ? isEasyPreset
        ? BRAINBIT_AUDIO_SM_ENTER_EASY
        : BRAINBIT_AUDIO_SM_ENTER_MED
    : isEasyPreset
      ? DEBUG_MUSE_AUDIO_SM_ENTER_EASY
      : DEBUG_MUSE_AUDIO_SM_ENTER_MED;
  const uiFlowMin = isAthena
    ? ATHENA_UI_FLOW_ZONE_MIN
    : isBrainBit
      ? isEasyPreset
        ? BRAINBIT_UI_FLOW_ZONE_MIN_EASY
        : BRAINBIT_UI_FLOW_ZONE_MIN_MED
      : DEBUG_MUSE_UI_FLOW_ZONE_MIN;
  return { audioSmEnter, uiFlowMin };
}

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
  const [brainBitSignalConfidence, setBrainBitSignalConfidence] = useState(1);
  const [brainBitChannelSessionMode, setBrainBitChannelSessionMode] =
    useState<BrainBitChannelSessionMode>('insufficient');
  const [error, setError] = useState<string | null>(null);

  const coherenceDetector = useRef(new CoherenceDetector({}));
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastHistoryUpdate = useRef<number>(0);
  const lastElectrodeUpdate = useRef<number>(0);
  const lastStateUpdate = useRef<number>(0);
  const lastDebugLog = useRef<number>(0);
  const lastAthenaBandLog = useRef<number>(0);
  const lastAthenaCoherenceDebugMs = useRef<number>(0);
  const lastBrainBitDetectorInputLogMs = useRef<number>(0);
  const lastBrainBitMetaUpdateMs = useRef<number>(0);
  const prevBrainBitChannelStateRef = useRef<Map<string, string>>(new Map());
  const prevBrainBitArtifactRef = useRef(0);
  const prevFlowActiveRef = useRef<boolean>(false);
  const lastFlowTransitionRef = useRef<{ edge: 'enter' | 'exit'; at: number } | null>(null);
  const athenaPathRelativeMsRef = useRef(0);
  const athenaPathAbsoluteMsRef = useRef(0);
  const athenaDetectorActiveMsRef = useRef(0);
  const athenaDetectorFlowEverRef = useRef(false);
  const athenaPathSampleLastMsRef = useRef(0);
  /** Mirrors App session difficulty (`coherenceSensitivity < 0.33`) for debug + UI zone. */
  const isEasyPresetRef = useRef(false);
  const wasConnectedRef = useRef<boolean>(false);
  const [athenaCoherenceDebug, setAthenaCoherenceDebug] = useState<
    AthenaCoherenceDebugSnapshot | undefined
  >(undefined);

  useEffect(() => {
    const wantCoherenceDebugStrip =
      (DEBUG_ATHENA_COHERENCE && isAthenaBridgeEEGDevice(eegDevice)) ||
      ((DEBUG_BRAINBIT_BRIDGE || BRAINBIT_AUDIT_MODE) && isBrainBitBridgeEEGDevice(eegDevice));
    if (!wantCoherenceDebugStrip) {
      setAthenaCoherenceDebug(undefined);
    }
  }, [eegDevice]);

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
            ? isBrainBitBridgeEEGDevice(eegDevice)
              ? brainBitChannelReadiness01(eegDevice.getBrainBitChannelDiagnostics())
              : averageContactScore01(sites)
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

          if (
            DEBUG_ATHENA_BANDS &&
            isAthenaBridgeEEGDevice(eegDevice) &&
            tNow - lastAthenaBandLog.current >= 2000
          ) {
            lastAthenaBandLog.current = tNow;
            const seq = eegDevice.getLatestBridgeSample()?.seq;
            console.log('[AthenaBands] bridge seq', seq, 'bandsSmooth', museState.bandsSmooth, 'bandsDbSmooth', museState.bandsDbSmooth);
          }
        }

        // Calculate motion level from accelerometer
        const motionLevel = Math.abs(eegDevice.accX) + Math.abs(eegDevice.accY) + Math.abs(eegDevice.accZ);
        const normalizedMotion = Math.min(1, motionLevel / 30);
        const brainBitRxDebug = isBrainBitBridgeEEGDevice(eegDevice)
          ? eegDevice.getBrainBitBridgeRxDebug()
          : null;
        const isBrainBitAudit = BRAINBIT_AUDIT_MODE && isBrainBitBridgeEEGDevice(eegDevice);
        const brainBitContactArtifact01 = brainBitRxDebug
          ? brainBitContactArtifactScore01(brainBitRxDebug.contact)
          : 0;
        const detectorMotionLevel = isBrainBitBridgeEEGDevice(eegDevice)
          ? (isBrainBitAudit ? normalizedMotion : Math.max(normalizedMotion, brainBitContactArtifact01))
          : normalizedMotion;

        // Electrode quality 0-1 for coherence (1=good, 2=medium→0.5, 3=poor, 4=off→0)
        const chN = eegDevice.capabilities.eegChannelCount;
        let sumQ = 0;
        for (let i = 0; i < chN; i++) {
          const v = horseshoe[i] ?? 4;
          if (v === 1) sumQ += 1;
          else if (v === 2) sumQ += 0.5;
        }
        let electrodeQuality = sumQ / chN;

        if (isBrainBitBridgeEEGDevice(eegDevice)) {
          const channelActivity = eegDevice.getBrainBitChannelDiagnostics();
          const sessionMode = deriveBrainBitChannelSessionMode(channelActivity);
          electrodeQuality = brainBitCoherenceElectrodeQuality01(channelActivity);

          const audioContact =
            sites.length > 0 ? averageContactScore01BrainBitAudio(sites) : electrodeQuality;
          const packetGap = eegDevice.getConnectionStateDetail().timeSinceLastUpdate;
          const streamHealth = deriveBrainBitStreamHealth({
            wsConnected: eegDevice.connected,
            connectionHealthState: eegDevice.getHealthState(),
            timeSinceLastPacketMs: packetGap,
            contact: brainBitRxDebug?.contact ?? null,
          });
          const confidence = computeBrainBitSignalConfidence({
            channelActivity,
            streamHealth,
            electrodeQuality01: audioContact,
          });

          for (const ch of channelActivity.channels) {
            const prev = prevBrainBitChannelStateRef.current.get(ch.label);
            const wasBad =
              prev === 'flat' || prev === 'stuck' || prev === 'low';
            const isActive = ch.state === 'active';
            if (wasBad && isActive) {
              logBrainBitSessionEvent('channel_recovered', {
                label: ch.label,
                from: prev,
                to: ch.state,
              });
            }
            prevBrainBitChannelStateRef.current.set(ch.label, ch.state);
          }

          if (brainBitContactArtifact01 >= 0.35 && prevBrainBitArtifactRef.current < 0.35) {
            logBrainBitSessionEvent('headset_adjusted', {
              artifact01: Number(brainBitContactArtifact01.toFixed(2)),
            });
          }
          prevBrainBitArtifactRef.current = brainBitContactArtifact01;

          if (tNow - lastBrainBitMetaUpdateMs.current >= 250) {
            lastBrainBitMetaUpdateMs.current = tNow;
            setBrainBitChannelSessionMode(sessionMode);
            setBrainBitSignalConfidence(confidence);
          }
        }

        const coherenceContactGate = isBrainBitBridgeEEGDevice(eegDevice)
          ? BRAINBIT_COHERENCE_MIN_CONTACT_VALIDITY
          : isWebSocketBridgeEegDevice(eegDevice)
            ? ATHENA_COHERENCE_MIN_CONTACT_VALIDITY
            : 0.5;

        const bandsForCoherence = eegDevice.getCoherenceDetectorBands?.() ?? museState.bandsSmooth;

        // Update coherence detector with electrode quality
        const csState = coherenceDetector.current.update(bandsForCoherence, detectorMotionLevel, electrodeQuality);
        setCoherenceStatus(csState);

        const prevFlow = prevFlowActiveRef.current;
        if (prevFlow !== csState.isActive) {
          lastFlowTransitionRef.current = { edge: csState.isActive ? 'enter' : 'exit', at: tNow };
          if (isBrainBitBridgeEEGDevice(eegDevice)) {
            logBrainBitSessionEvent(csState.isActive ? 'coherence_entered' : 'coherence_exited', {
              sustainedMs: csState.sustainedMs,
            });
          }
        }
        prevFlowActiveRef.current = csState.isActive;

        if (isAthenaBridgeEEGDevice(eegDevice)) {
          const dd = csState.dwellDiagnostics;
          if (dd) {
            const pst = athenaPathSampleLastMsRef.current;
            if (pst > 0) {
              const dt = Math.min(100, tNow - pst);
              if (dd.pathDetail === 'relative') {
                athenaPathRelativeMsRef.current += dt;
              } else {
                athenaPathAbsoluteMsRef.current += dt;
              }
              if (csState.isActive) {
                athenaDetectorActiveMsRef.current += dt;
              }
            }
            athenaPathSampleLastMsRef.current = tNow;
            if (csState.isActive) {
              athenaDetectorFlowEverRef.current = true;
            }
          }
        }

        // Calculate coherence (also considering electrode quality)
        const cohRawForDisplay = calculateCoherence(
          bandsForCoherence,
          csState.signalVariance,
          electrodeQuality,
          coherenceContactGate,
          isBrainBitBridgeEEGDevice(eegDevice)
            ? {
                minAlphaQuiet: BRAINBIT_COHERENCE_CALC_MIN_ALPHA,
                scoreScale: isBrainBitAudit ? 1 : BRAINBIT_COHERENCE_SCORE_SCALE,
              }
            : undefined,
        );
        const alphaCeilingBlocked =
          !isBrainBitAudit &&
          isBrainBitBridgeEEGDevice(eegDevice) &&
          csState.dwellDiagnostics?.hasAlphaCeiling === false;
        const coh = !isBrainBitAudit && isBrainBitBridgeEEGDevice(eegDevice) && (brainBitContactArtifact01 >= 0.3 || alphaCeilingBlocked)
          ? Math.min(cohRawForDisplay, 0.2)
          : cohRawForDisplay;
        setCoherence(coh);

        if (
          DEBUG_BRAINBIT_BRIDGE &&
          isBrainBitBridgeEEGDevice(eegDevice) &&
          tNow - lastBrainBitDetectorInputLogMs.current >= 1000
        ) {
          lastBrainBitDetectorInputLogMs.current = tNow;
          const rx = eegDevice.getBrainBitBridgeRxDebug();
          const dd = csState.dwellDiagnostics;
          console.log('[BrainBit CoherenceDetector input]', {
            detectorAlpha: bandsForCoherence.alpha,
            detectorBeta: bandsForCoherence.beta,
            signalVariance: csState.signalVariance,
            contactArtifact01: brainBitContactArtifact01,
            varianceDedupeEpsilon:
              coherenceDetector.current.getConfig().varianceSampleDedupeEpsilon ?? null,
            dwellBlocker: dd?.dwellBlocker ?? null,
            signalValid: dd?.signalValid ?? null,
            coherenceChunkFeed: rx.coherenceDetectorChunkFeed,
          });
        }

        if (
          ((DEBUG_ATHENA_COHERENCE && isAthenaBridgeEEGDevice(eegDevice)) ||
            ((DEBUG_BRAINBIT_BRIDGE || BRAINBIT_AUDIT_MODE) && isBrainBitBridgeEEGDevice(eegDevice))) &&
          tNow - lastAthenaCoherenceDebugMs.current >= 250
        ) {
          lastAthenaCoherenceDebugMs.current = tNow;
          const cfg = coherenceDetector.current.getConfig();
          const bs = bandsForCoherence;
          const totalPower = bs.alpha + bs.beta + bs.gamma + bs.theta + bs.delta;
          const d = csState.dwellDiagnostics;
          const ft = lastFlowTransitionRef.current;
          const flowEdge =
            ft && tNow - ft.at < 2500 ? ft.edge : ('none' as const);
          const dwellProgress =
            cfg.sustainedMs > 0 ? Math.min(1, csState.sustainedMs / cfg.sustainedMs) : 0;
          const audioContactAvg =
            sites.length > 0
              ? averageContactScore01(sites)
              : averageContactScore01FromLegacyStatus(next);
          const timeSinceLastUpdate = eegDevice.getConnectionStateDetail().timeSinceLastUpdate;
          const audioSignalOkForStateMachine =
            audioContactAvg >= DEBUG_AUDIO_MIN_CONTACT &&
            timeSinceLastUpdate <= DEBUG_AUDIO_MAX_DATA_GAP_MS;
          const pathRel = athenaPathRelativeMsRef.current;
          const pathAbs = athenaPathAbsoluteMsRef.current;
          const pathTot = pathRel + pathAbs;
          const pathRelativeFraction = pathTot > 0 ? pathRel / pathTot : 0;

          const deviceKind = isAthenaBridgeEEGDevice(eegDevice)
            ? 'athena'
            : isBrainBitBridgeEEGDevice(eegDevice)
              ? 'brainbit'
              : 'muse';
          const { audioSmEnter, uiFlowMin } = rewardDebugThresholds(deviceKind, isEasyPresetRef.current);

          const brainBitExtras = isBrainBitBridgeEEGDevice(eegDevice)
            ? (() => {
                const rx = brainBitRxDebug ?? eegDevice.getBrainBitBridgeRxDebug();
                const samp = eegDevice.getLatestBrainBitSample();
                return {
                  relayChunkSeq: samp?.seq ?? null,
                  relayAcceptedTotal: rx.acceptedTotal,
                  timeSinceLastUpdateMs: timeSinceLastUpdate,
                  detectorGamma: bs.gamma,
                  detectorTheta: bs.theta,
                  fftNominalHz: rx.fft.fftUsesHz,
                  chunkImpliedHz: rx.fft.chunkImpliedHz,
                };
              })()
            : undefined;

          const brainBitCoherenceRaw = isBrainBitBridgeEEGDevice(eegDevice)
            ? calculateCoherence(
                bs,
                csState.signalVariance,
                electrodeQuality,
                coherenceContactGate,
                { minAlphaQuiet: BRAINBIT_COHERENCE_CALC_MIN_ALPHA },
              )
            : undefined;

          let bottleneckHint = '';
          if (!isBrainBitAudit && isBrainBitBridgeEEGDevice(eegDevice) && brainBitContactArtifact01 >= 0.3) {
            bottleneckHint = `detector: BrainBit contact-motion artifact ${brainBitContactArtifact01.toFixed(2)}`;
          } else if (!isBrainBitAudit && isBrainBitBridgeEEGDevice(eegDevice) && d?.hasAlphaCeiling === false) {
            bottleneckHint = `detector: BrainBit alpha spike > baseline × ${(d.alphaCeilingBaselineRatio ?? 0).toFixed(1)}`;
          } else if (isBrainBitAudit) {
            bottleneckHint = d?.dwellBlocker
              ? `audit: raw detector blocker (${d.dwellBlocker})`
              : 'audit: raw BrainBit signal, helpers off';
          } else if (!audioSignalOkForStateMachine) {
            bottleneckHint =
              audioContactAvg < DEBUG_AUDIO_MIN_CONTACT
                ? 'reward: audio state machine — mean contact < 0.5'
                : `reward: audio SM — packet gap ${Math.round(timeSinceLastUpdate)}ms`;
          } else if (coh < audioSmEnter) {
            bottleneckHint = `reward: coh ${coh.toFixed(2)} < ${audioSmEnter} (SM stays baseline; UI flow needs ${uiFlowMin})`;
          } else if (!d?.conditionsMet && d?.dwellBlocker) {
            bottleneckHint = `detector: dwell (${d.dwellBlocker})`;
          } else if (d?.conditionsMet && dwellProgress < 1) {
            bottleneckHint = 'detector: condMet, accumulating dwell';
          } else if (csState.isActive) {
            bottleneckHint = 'detector: flowAct on — if flat, trace audio sustained / session';
          } else {
            bottleneckHint = 'inspect pathDetail + relativeGate';
          }

          setAthenaCoherenceDebug({
            brainBitExtras,
            brainBitContactArtifact01: isBrainBitBridgeEEGDevice(eegDevice)
              ? brainBitContactArtifact01
              : undefined,
            brainBitCoherenceRaw,
            brainBitCoherenceScoreScale: isBrainBitBridgeEEGDevice(eegDevice)
              ? (isBrainBitAudit ? 1 : BRAINBIT_COHERENCE_SCORE_SCALE)
              : undefined,
            brainBitElectrodeHorseshoe: isBrainBitBridgeEEGDevice(eegDevice)
              ? Array.from(eegDevice.getElectrodeQuality())
              : undefined,
            brainBitAudit: isBrainBitBridgeEEGDevice(eegDevice)
              ? {
                  enabled: isBrainBitAudit,
                  allBands: brainBitRxDebug?.fft.allChannelRelativeSnapshot ?? null,
                  corticalBands: brainBitRxDebug?.fft.lastRelativeSnapshot ?? null,
                  allBandsDb: brainBitRxDebug?.fft.allChannelDbSnapshot ?? null,
                  corticalBandsDb: brainBitRxDebug?.fft.lastRelativeSnapshotDb ?? null,
                  selectedLabels: brainBitRxDebug?.fft.selectedBandLabels ?? [],
                  allLabels: brainBitRxDebug?.fft.allLabels ?? [],
                  contactPerChannel:
                    brainBitRxDebug?.contact?.perCh.map((ch, i) => ({
                      label: brainBitRxDebug?.fft.allLabels[i] ?? `ch${i}`,
                      horseshoe: ch.horseshoe,
                      absAmp: ch.absAmp,
                      variance: ch.vari,
                      rule: ch.rule,
                    })) ?? [],
                }
              : undefined,
            alphaBaselinePower: d?.alphaBaselinePower ?? null,
            smoothedAlphaPower: d?.smoothedAlphaPower ?? null,
            alphaFloorMin: d?.alphaFloorMin ?? null,
            alphaFloorBaselineRatio: d?.alphaFloorBaselineRatio,
            alphaBaselineWindowComplete: d?.alphaBaselineWindowComplete ?? false,
            alphaCeilingMax: d?.alphaCeilingMax,
            alphaCeilingBaselineRatio: d?.alphaCeilingBaselineRatio,
            coherence: coh,
            coherenceZone: getCoherenceZone(coh, { flowMin: uiFlowMin }),
            flowActive: csState.isActive,
            sustainedMs: csState.sustainedMs,
            sustainedTargetMs: cfg.sustainedMs,
            betaAlphaRatio: csState.betaAlphaRatio,
            betaAlphaRatioThreshold: cfg.betaAlphaRatioThreshold,
            signalVariance: csState.signalVariance,
            varianceThreshold: cfg.varianceThreshold,
            noiseLevel: csState.noiseLevel,
            noiseThreshold: cfg.noiseThreshold,
            normalizedMotion: detectorMotionLevel,
            motionRaw: motionLevel,
            electrodeQuality,
            connectionQualityMetric: connectionQualityFromElectrodes,
            touching: museState.touching,
            bandsSmooth: { ...bs },
            totalBandPower: totalPower,
            useRelativeMode: cfg.useRelativeMode ?? false,
            minSignalPower: cfg.minSignalPower,
            minVariance: cfg.minVariance,
            conditionsMet: d?.conditionsMet ?? false,
            conditionsMetRaw: d?.conditionsMetRaw,
            dwellGraceActive: d?.dwellGraceActive,
            conditionBreakGraceMs: d?.conditionBreakGraceMs,
            coherencePath: d?.coherencePath ?? 'absolute',
            baselineCalComplete: d?.baselineCalComplete ?? false,
            dwellBlocker: d?.dwellBlocker ?? null,
            dwellProgress,
            flowEdge,
            signalValid: d?.signalValid ?? false,
            hasAlphaFloor: d?.hasAlphaFloor ?? false,
            hasAlphaCeiling: d?.hasAlphaCeiling,
            signalValidMinAlpha: d?.signalValidMinAlpha,
            bandsAlphaForValidity: d?.bandsAlpha,
            pathDetail: d?.pathDetail ?? 'absolute',
            relativeGate: d?.relativeGate ?? null,
            pathRelativeFraction,
            pathRelativeSec: pathRel / 1000,
            pathAbsoluteSec: pathAbs / 1000,
            detectorFlowEver: athenaDetectorFlowEverRef.current,
            detectorActiveSec: athenaDetectorActiveMsRef.current / 1000,
            audioContactAvg,
            audioSignalOkForStateMachine,
            audioSmEnterThreshold: audioSmEnter,
            gapToAudioSmEnter: audioSmEnter - coh,
            uiFlowThreshold: uiFlowMin,
            gapToUiFlow: uiFlowMin - coh,
            bottleneckHint,
            audioReward: audioEngine.getAudioRewardDebugSnapshot(),
          });
        }

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
          setBrainBitSignalConfidence(1);
          setBrainBitChannelSessionMode('insufficient');
          prevBrainBitChannelStateRef.current = new Map();
          prevBrainBitArtifactRef.current = 0;
          setAthenaCoherenceDebug(undefined);
          prevFlowActiveRef.current = false;
          lastFlowTransitionRef.current = null;
          athenaPathRelativeMsRef.current = 0;
          athenaPathAbsoluteMsRef.current = 0;
          athenaDetectorActiveMsRef.current = 0;
          athenaDetectorFlowEverRef.current = false;
          athenaPathSampleLastMsRef.current = 0;
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
    setBrainBitSignalConfidence(1);
    setBrainBitChannelSessionMode('insufficient');
    prevBrainBitChannelStateRef.current = new Map();
    prevBrainBitArtifactRef.current = 0;
    setAthenaCoherenceDebug(undefined);
    prevFlowActiveRef.current = false;
    lastFlowTransitionRef.current = null;
    athenaPathRelativeMsRef.current = 0;
    athenaPathAbsoluteMsRef.current = 0;
    athenaDetectorActiveMsRef.current = 0;
    athenaDetectorFlowEverRef.current = false;
    athenaPathSampleLastMsRef.current = 0;
    coherenceDetector.current.reset();
  }, [eegDevice]);

  const setThresholdSettings = useCallback(
    (settings: {
      coherenceThreshold: number;
      timeThreshold: number;
      useRelativeMode?: boolean;
      isEasyPreset?: boolean;
    }) => {
      isEasyPresetRef.current = settings.isEasyPreset ?? false;
      const baseBetaAlphaRatioThreshold = 1.0 - (settings.coherenceThreshold - 0.7) * 2;
      if (isWebSocketBridgeEegDevice(eegDevice)) {
        coherenceDetector.current.setConfig({
          sustainedMs: Math.max(400, Math.round(settings.timeThreshold * ATHENA_SUSTAINED_MS_FACTOR)),
          betaAlphaRatioThreshold: baseBetaAlphaRatioThreshold * ATHENA_BETA_ALPHA_RATIO_THRESHOLD_FACTOR,
          varianceThreshold: ATHENA_VARIANCE_THRESHOLD,
          useRelativeMode: settings.useRelativeMode ?? false,
          minElectrodeQualityForValidity: isBrainBitBridgeEEGDevice(eegDevice)
            ? BRAINBIT_COHERENCE_MIN_CONTACT_VALIDITY
            : ATHENA_COHERENCE_MIN_CONTACT_VALIDITY,
          emitDwellDiagnostics: true,
          signalValidMinAlpha: isBrainBitBridgeEEGDevice(eegDevice)
            ? BRAINBIT_COHERENCE_SIGNAL_VALID_MIN_ALPHA
            : undefined,
          minVariance: isBrainBitBridgeEEGDevice(eegDevice)
            ? BRAINBIT_COHERENCE_SIGNAL_MIN_VARIANCE
            : 0.001,
          varianceSampleDedupeEpsilon: isBrainBitBridgeEEGDevice(eegDevice)
            ? BRAINBIT_COHERENCE_VARIANCE_SAMPLE_DEDUPE_EPSILON
            : undefined,
          alphaFloorBaselineRatio: isBrainBitBridgeEEGDevice(eegDevice)
            ? BRAINBIT_COHERENCE_ALPHA_FLOOR_BASELINE_RATIO
            : undefined,
          alphaCeilingBaselineRatio: isBrainBitBridgeEEGDevice(eegDevice)
            ? (BRAINBIT_AUDIT_MODE ? undefined : BRAINBIT_COHERENCE_ALPHA_CEILING_BASELINE_RATIO)
            : undefined,
          conditionBreakGraceMs: isBrainBitBridgeEEGDevice(eegDevice)
            ? (BRAINBIT_AUDIT_MODE ? undefined : BRAINBIT_COHERENCE_DWELL_BREAK_GRACE_MS)
            : undefined,
        });
      } else {
        coherenceDetector.current.setConfig({
          sustainedMs: settings.timeThreshold,
          betaAlphaRatioThreshold: baseBetaAlphaRatioThreshold,
          varianceThreshold: 0.15,
          useRelativeMode: settings.useRelativeMode ?? false,
          minElectrodeQualityForValidity: undefined,
          emitDwellDiagnostics: false,
          signalValidMinAlpha: undefined,
          minVariance: 0.001,
          alphaFloorBaselineRatio: undefined,
          alphaCeilingBaselineRatio: undefined,
          conditionBreakGraceMs: undefined,
        });
      }
    },
    [eegDevice],
  );

  const isWsBridge = isWebSocketBridgeEegDevice(eegDevice);
  const deviceKind = isAthenaBridgeEEGDevice(eegDevice)
    ? 'athena'
    : isBrainBitBridgeEEGDevice(eegDevice)
      ? 'brainbit'
      : 'muse';
  const { uiFlowMin: zoneFlowMin } = rewardDebugThresholds(deviceKind, isEasyPresetRef.current);

  return {
    state,
    coherenceStatus,
    coherence,
    coherenceZone: getCoherenceZone(coherence, isWsBridge ? { flowMin: zoneFlowMin } : {}),
    coherenceHistory,
    athenaCoherenceDebug,
    electrodeStatus,
    electrodeSites,
    ppg,
    connectionHealthState,
    brainBitSignalConfidence,
    brainBitChannelSessionMode,
    isBluetoothAvailable: eegDevice.isBluetoothAvailable(),
    connectBluetooth,
    connectOSC,
    disconnect,
    setThresholdSettings,
    error,
  };
}
