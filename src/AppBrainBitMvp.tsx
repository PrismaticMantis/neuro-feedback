/**
 * BrainBit iPad MVP — setup → session → done only.
 * Enabled when VITE_BRAINBIT_IPAD_MVP=true. Full App.tsx is unchanged.
 */

import { useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useMuse } from './hooks/useMuse';
import { useAudio } from './hooks/useAudio';
import { useSession } from './hooks/useSession';
import { SessionSetup } from './components/SessionSetup';
import { ActiveSession } from './components/ActiveSession';
import { SessionDone } from './components/SessionDone';
import { SessionSummaryMvp } from './components/SessionSummaryMvp';
import { audioEngine } from './lib/audio-engine';
import { useEegDevice } from './lib/eeg/EegDeviceContext';
import { isBrainBitBridgeEEGDevice } from './lib/eeg/brainbit-bridge-eeg-device';
import { BRAINBIT_UI_FLOW_ZONE_MIN_EASY } from './lib/eeg/brainbit-coherence-stability';
import { movementDetector } from './lib/movement-detector';
import { calculateCalmScore, calculateCreativeFlowScore } from './lib/flow-state';
import { deriveRecoveryPoints } from './lib/summary-pdf';
import {
  averageContactScore01,
  averageContactScore01FromLegacyStatus,
  hasEnoughGoodOrMediumContactBrainBit,
  hasEnoughGoodOrMediumContactLegacy,
} from './lib/eeg/contact-quality';
import type { ThresholdSettings } from './types';
import './App.css';

/** Fixed easy preset for event MVP — no sensitivity UI in this shell. */
const MVP_THRESHOLD_SETTINGS: ThresholdSettings = {
  coherenceSensitivity: 0.2,
};

function sensitivityToCoherenceThreshold(sensitivity: number): number {
  return 0.15 + sensitivity * 0.75;
}

function sensitivityToTimeThreshold(sensitivity: number): number {
  return 700 + sensitivity * 9300;
}

export default function AppBrainBitMvp() {
  const eegDevice = useEegDevice();
  const muse = useMuse();
  const audio = useAudio();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const guestBootstrapped = useRef(false);

  useEffect(() => {
    movementDetector.setEegDevice(eegDevice);
  }, [eegDevice]);

  useEffect(() => {
    if (guestBootstrapped.current) return;
    guestBootstrapped.current = true;
    if (session.currentUser) return;
    if (session.users.length > 0) {
      session.selectUser(session.users[0]!.id);
      return;
    }
    session.createUser('Event Guest');
  }, [session]);

  useEffect(() => {
    const coherenceThreshold = sensitivityToCoherenceThreshold(MVP_THRESHOLD_SETTINGS.coherenceSensitivity);
    const timeThreshold = sensitivityToTimeThreshold(MVP_THRESHOLD_SETTINGS.coherenceSensitivity);

    muse.setThresholdSettings({
      coherenceThreshold,
      timeThreshold,
      useRelativeMode: true,
      isEasyPreset: true,
    });
    audioEngine.setDifficultyPreset(MVP_THRESHOLD_SETTINGS.coherenceSensitivity, {
      athenaBridge: false,
      brainBitBridge: isBrainBitBridgeEEGDevice(eegDevice),
    });
  }, [muse.setThresholdSettings, eegDevice]);

  const hasGoodContact =
    muse.electrodeSites.length > 0
      ? hasEnoughGoodOrMediumContactBrainBit(muse.electrodeSites)
      : hasEnoughGoodOrMediumContactLegacy(muse.electrodeStatus);

  useEffect(() => {
    if (!session.isSessionActive) return;
    if (muse.connectionHealthState === 'disconnected') return;

    const contactQuality =
      muse.electrodeSites.length > 0
        ? averageContactScore01(muse.electrodeSites)
        : averageContactScore01FromLegacyStatus(muse.electrodeStatus);
    const timeSinceLastUpdate = eegDevice.getConnectionStateDetail().timeSinceLastUpdate;
    const signalQuality = {
      isConnected: true,
      contactQuality,
      timeSinceLastUpdate,
    };

    session.updateCoherenceStatus(muse.coherenceStatus.isActive, muse.coherence);

    const calmScore = calculateCalmScore(
      muse.state.bandsSmooth,
      muse.coherenceStatus.signalVariance,
      contactQuality,
    );
    const creativeFlowScore = calculateCreativeFlowScore(
      muse.state.bandsSmooth,
      muse.coherenceStatus.signalVariance,
      contactQuality,
    );

    audioEngine.updateCoherence(
      muse.coherence,
      signalQuality,
      { calmScore, creativeFlowScore },
      muse.ppg,
    );
  }, [
    muse.coherenceStatus.isActive,
    muse.coherence,
    muse.coherenceStatus.signalVariance,
    muse.connectionHealthState,
    muse.state.bandsSmooth,
    muse.electrodeStatus,
    muse.electrodeSites,
    hasGoodContact,
    session.isSessionActive,
    eegDevice,
  ]);

  const handleStartSession = useCallback(async () => {
    try {
      await audio.init();
      await audioEngine.startSession();
      if (audio.entrainmentEnabled) await audio.setEntrainmentEnabled(true);

      eegDevice.resetSessionPPG();

      movementDetector.setOnMovement(() => {
        audioEngine.ensureContextRunning();
        audioEngine.playMovementCue();
      });
      movementDetector.start();

      if (isBrainBitBridgeEEGDevice(eegDevice)) {
        const coherenceThreshold = sensitivityToCoherenceThreshold(
          MVP_THRESHOLD_SETTINGS.coherenceSensitivity,
        );
        const timeThreshold = sensitivityToTimeThreshold(MVP_THRESHOLD_SETTINGS.coherenceSensitivity);
        muse.setThresholdSettings({
          coherenceThreshold,
          timeThreshold,
          useRelativeMode: true,
          isEasyPreset: true,
        });
      }

      session.startSession();
      navigate('/session');
    } catch (e) {
      console.error('[BrainBitMvp] Begin session failed:', e);
    }
  }, [audio, session, navigate, eegDevice, muse.setThresholdSettings]);

  const handleEndSession = useCallback(() => {
    movementDetector.stop();
    movementDetector.setOnMovement(null);

    const audioMetrics = audioEngine.getCoherenceMetrics();
    audioEngine.stopSession();
    audio.setEntrainmentEnabled(false);

    const ppgData = eegDevice.getSessionPPGSummary();
    const coherencePercent =
      session.sessionDuration > 0 ? (session.coherenceTime / session.sessionDuration) * 100 : 0;
    const stability = coherencePercent >= 50 ? 'High' : coherencePercent >= 30 ? 'Medium' : 'Low';
    const recoveryPts = deriveRecoveryPoints(coherencePercent, stability);

    session.endSession(audioMetrics.totalCoherenceAudioTimeMs, ppgData, recoveryPts);
    navigate('/done');
  }, [audio, session, navigate, eegDevice]);

  const handleStartAgain = useCallback(() => {
    // Session already ended; return to setup (relay WS may stay connected).
    navigate('/setup');
  }, [navigate]);

  return (
    <div className="app">
      {location.pathname !== '/session' && <div className="ambient-glow" aria-hidden />}
      <Routes>
        <Route path="/" element={<Navigate to="/setup" replace />} />
        <Route
          path="/setup"
          element={
            <SessionSetup
              museConnected={muse.state.connected}
              museDeviceName={muse.state.deviceName}
              connectionQuality={muse.state.connectionQuality}
              electrodeStatus={muse.electrodeStatus}
              electrodeSites={muse.electrodeSites}
              batteryLevel={muse.state.batteryLevel}
              onConnectBluetooth={muse.connectBluetooth}
              onConnectOSC={muse.connectOSC}
              onDisconnect={muse.disconnect}
              isBluetoothAvailable={muse.isBluetoothAvailable}
              connectionError={muse.error}
              connectionHealthState={muse.connectionHealthState}
              entrainmentEnabled={audio.entrainmentEnabled}
              entrainmentVolume={audio.entrainmentVolume}
              binauralPreset={audio.binauralPreset}
              onEntrainmentEnabledChange={audio.setEntrainmentEnabled}
              onEntrainmentVolumeChange={audio.setEntrainmentVolume}
              onBinauralPresetChange={audio.setBinauralPreset}
              thresholdSettings={MVP_THRESHOLD_SETTINGS}
              onThresholdSettingsChange={() => {}}
              currentUser={session.currentUser}
              users={session.users}
              onCreateUser={session.createUser}
              onSelectUser={session.selectUser}
              onStartSession={handleStartSession}
            />
          }
        />
        <Route
          path="/session"
          element={
            <ActiveSession
              duration={session.sessionDuration}
              coherenceHistory={session.coherenceHistory}
              coherenceZone={muse.coherenceZone}
              flowZoneMin={BRAINBIT_UI_FLOW_ZONE_MIN_EASY}
              museConnected={muse.state.connected}
              touching={muse.state.touching}
              electrodeStatus={muse.electrodeStatus}
              electrodeSites={muse.electrodeSites}
              bands={muse.state.bandsSmooth}
              bandsDb={muse.state.bandsDbSmooth}
              batteryLevel={muse.state.batteryLevel}
              connectionHealthState={muse.connectionHealthState}
              entrainmentEnabled={audio.entrainmentEnabled}
              onEntrainmentToggle={() => audio.setEntrainmentEnabled(!audio.entrainmentEnabled)}
              onEndSession={handleEndSession}
            />
          }
        />
        <Route
          path="/done"
          element={
            session.lastSession && session.lastSessionStats && session.currentUser ? (
              <SessionSummaryMvp
                session={session.lastSession}
                stats={session.lastSessionStats}
                user={session.currentUser}
                onStartAgain={handleStartAgain}
              />
            ) : (
              <SessionDone onStartAgain={handleStartAgain} />
            )
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    </div>
  );
}
