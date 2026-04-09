// Neuro-Somatic Feedback App – Main Application

import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useMuse } from './hooks/useMuse';
import { useAudio } from './hooks/useAudio';
import { useSession } from './hooks/useSession';
import { SessionSetup } from './components/SessionSetup';
import { ActiveSession } from './components/ActiveSession';
import { SessionSummary } from './components/SessionSummary';
import { Home } from './components/Home';
import { JourneySelect } from './components/JourneySelect';
import { SessionHistory } from './components/SessionHistory';
import { SessionDetail } from './components/SessionDetail';
import { Profile } from './components/Profile';
import { BottomNav } from './components/BottomNav';
import { DesignShowcase } from './components/DesignShowcase';
import { MuseBleDebugPanel } from './components/MuseBleDebugPanel';
import { audioEngine } from './lib/audio-engine';
import { useEegDevice } from './lib/eeg/EegDeviceContext';
import { movementDetector, DEBUG_MOVEMENT } from './lib/movement-detector';
import { calculateCalmScore, calculateCreativeFlowScore } from './lib/flow-state';
import { deriveRecoveryPoints } from './lib/summary-pdf';
import {
  averageContactScore01,
  averageContactScore01FromLegacyStatus,
  hasEnoughGoodOrMediumContact,
  hasEnoughGoodOrMediumContactLegacy,
} from './lib/eeg/contact-quality';
import type { ThresholdSettings } from './types';
import './App.css';

const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = {
  coherenceSensitivity: 0.5,
};

function sensitivityToCoherenceThreshold(sensitivity: number): number {
  // Re-scale the full sensitivity curve to the new easier baseline.
  // Range is now 0.15 (easiest) to 0.90 (hardest), so every step is relative
  // to the new minimum instead of only special-casing the lowest value.
  return 0.15 + sensitivity * 0.75;
}

function sensitivityToTimeThreshold(sensitivity: number): number {
  // Re-scale the full hold-time curve to the new easier baseline.
  // Range is now 700ms (easiest) to 10000ms (hardest).
  return 700 + sensitivity * 9300;
}

function App() {
  const eegDevice = useEegDevice();
  const muse = useMuse();
  const audio = useAudio();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    movementDetector.setEegDevice(eegDevice);
  }, [eegDevice]);

  const [thresholdSettings, setThresholdSettings] = useState<ThresholdSettings>(
    DEFAULT_THRESHOLD_SETTINGS
  );

  useEffect(() => {
    const coherenceThreshold = sensitivityToCoherenceThreshold(thresholdSettings.coherenceSensitivity);
    const timeThreshold = sensitivityToTimeThreshold(thresholdSettings.coherenceSensitivity);
    const isEasyMode = thresholdSettings.coherenceSensitivity < 0.33;
    const isAbsoluteMinimum = thresholdSettings.coherenceSensitivity <= 0.05;

    muse.setThresholdSettings({
      coherenceThreshold,
      timeThreshold,
      // Relative mode can feel inconsistent at absolute minimum due to baseline calibration.
      // Keep easy mode relative behavior for normal-low settings, but use absolute mode at minimum.
      useRelativeMode: isEasyMode && !isAbsoluteMinimum,
    });
    audioEngine.setDifficultyPreset(thresholdSettings.coherenceSensitivity);
  }, [thresholdSettings.coherenceSensitivity, muse.setThresholdSettings]);

  const hasGoodContact =
    muse.electrodeSites.length > 0
      ? hasEnoughGoodOrMediumContact(muse.electrodeSites)
      : hasEnoughGoodOrMediumContactLegacy(muse.electrodeStatus);

  useEffect(() => {
    // CRITICAL: Only skip if session is not active OR we have a REAL disconnect.
    // During 'stalled' and 'reconnecting' states, KEEP tracking — the session
    // must never stop while BLE transport is alive.
    if (!session.isSessionActive) return;
    if (muse.connectionHealthState === 'disconnected') return;

    const contactQuality =
      muse.electrodeSites.length > 0
        ? averageContactScore01(muse.electrodeSites)
        : averageContactScore01FromLegacyStatus(muse.electrodeStatus);
    const timeSinceLastUpdate = eegDevice.getConnectionStateDetail().timeSinceLastUpdate;
    const signalQuality = {
      isConnected: true, // guaranteed by the 'disconnected' early-return above
      contactQuality,
      timeSinceLastUpdate,
    };

    session.updateCoherenceStatus(muse.coherenceStatus.isActive, muse.coherence);

    const calmScore = calculateCalmScore(
      muse.state.bandsSmooth,
      muse.coherenceStatus.signalVariance,
      contactQuality
    );
    const creativeFlowScore = calculateCreativeFlowScore(
      muse.state.bandsSmooth,
      muse.coherenceStatus.signalVariance,
      contactQuality
    );

    audioEngine.updateCoherence(muse.coherence, signalQuality, {
      calmScore,
      creativeFlowScore,
    }, muse.ppg);
  }, [
    muse.coherenceStatus.isActive,
    muse.coherence,
    muse.coherenceStatus.signalVariance,
    muse.connectionHealthState,
    muse.state.touching,
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
      
      // Reset PPG session tracking so averages are fresh for this session
      eegDevice.resetSessionPPG();
      
      // Wire movement detection -> audio cue playback (end-to-end pipeline)
      // Flow: Muse 2 accelerometer -> MovementDetector (EMA baseline) -> this callback -> playMovementCue()
      // NOTE: Uses ACCELEROMETER for head movement detection, NOT PPG.
      // Muse 2 does not provide PPG like a smartwatch — PPG data (if any) is used only for HR/HRV.
      movementDetector.setOnMovement((movementDelta, source) => {
        if (DEBUG_MOVEMENT) {
          console.log('[Move] ▶ Callback fired, calling audioEngine.playMovementCue()' +
            ' source=' + source + ' delta=' + movementDelta.toFixed(4));
        }
        // Belt-and-suspenders: try to resume AudioContext if it got suspended mid-session (iOS)
        audioEngine.ensureContextRunning();
        const cueNumber = audioEngine.playMovementCue();
        if (DEBUG_MOVEMENT) {
          console.log('[Move] ▶ playMovementCue returned cue=' + cueNumber +
            (cueNumber === 0 ? ' (BLOCKED — check [MoveCue] logs above)' : ' ✅ PLAYING'));
        }
      });
      movementDetector.start();
      
      if (DEBUG_MOVEMENT) {
        console.log('[Move] ✅ Pipeline wired: detector -> callback -> audioEngine.playMovementCue()');
      }
      
      session.startSession();
      navigate('/session');
    } catch (e) {
      console.error('[App] Begin session failed:', e);
    }
  }, [audio, session, navigate, eegDevice]);

  const handleEndSession = useCallback(() => {
    // Stop movement detection
    movementDetector.stop();
    movementDetector.setOnMovement(null);
    
    const audioMetrics = audioEngine.getCoherenceMetrics();
    audioEngine.stopSession();
    audio.setEntrainmentEnabled(false);

    // Collect PPG data before ending session (must read before session state resets)
    const ppgData = eegDevice.getSessionPPGSummary();

    // Compute recovery points from coherence + stability
    // deriveRecoveryPoints(coherencePercent, stability) returns 6–15
    const coherencePercent = session.sessionDuration > 0
      ? (session.coherenceTime / session.sessionDuration) * 100
      : 0;
    const stability = coherencePercent >= 50 ? 'High' : coherencePercent >= 30 ? 'Medium' : 'Low';
    const recoveryPts = deriveRecoveryPoints(coherencePercent, stability);

    session.endSession(audioMetrics.totalCoherenceAudioTimeMs, ppgData, recoveryPts);
    navigate('/summary');
  }, [audio, session, navigate, eegDevice]);

  const handleEntrainmentToggle = useCallback(() => {
    audio.setEntrainmentEnabled(!audio.entrainmentEnabled);
  }, [audio]);

  return (
    <div className="app">
      {/* Animated ambient glow overlay - hidden on session page to keep graph area clean */}
      {location.pathname !== '/session' && (
        <div className="ambient-glow" aria-hidden />
      )}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <Home
              currentUser={session.currentUser}
              users={session.users}
              onCreateUser={session.createUser}
              onSelectUser={session.selectUser}
            />
          }
        />
        <Route
          path="/journeys"
          element={<JourneySelect currentUser={session.currentUser} />}
        />
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
              entrainmentEnabled={audio.entrainmentEnabled}
              entrainmentVolume={audio.entrainmentVolume}
              binauralPreset={audio.binauralPreset}
              onEntrainmentEnabledChange={audio.setEntrainmentEnabled}
              onEntrainmentVolumeChange={audio.setEntrainmentVolume}
              onBinauralPresetChange={audio.setBinauralPreset}
              thresholdSettings={thresholdSettings}
              onThresholdSettingsChange={setThresholdSettings}
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
              museConnected={muse.state.connected}
              touching={muse.state.touching}
              electrodeStatus={muse.electrodeStatus}
              electrodeSites={muse.electrodeSites}
              bands={muse.state.bandsSmooth}
              bandsDb={muse.state.bandsDbSmooth}
              batteryLevel={muse.state.batteryLevel}
              connectionHealthState={muse.connectionHealthState}
              entrainmentEnabled={audio.entrainmentEnabled}
              onEntrainmentToggle={handleEntrainmentToggle}
              onEndSession={handleEndSession}
            />
          }
        />
        <Route
          path="/summary"
          element={
            session.lastSession && session.lastSessionStats && session.currentUser ? (
              <SessionSummary
                session={session.lastSession}
                stats={session.lastSessionStats}
                user={session.currentUser}
                onExportData={session.exportData}
              />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/profile"
          element={
            <Profile
              currentUser={session.currentUser}
              users={session.users}
              onCreateUser={session.createUser}
              onSelectUser={session.selectUser}
            />
          }
        />
        <Route
          path="/history"
          element={
            <SessionHistory currentUser={session.currentUser} />
          }
        />
        <Route
          path="/history/:sessionId"
          element={<SessionDetail users={session.users} />}
        />
        <Route
          path="/design-showcase"
          element={<DesignShowcase />}
        />
      </Routes>
      {/* Bottom Navigation - hide on session/setup/summary pages */}
      {!['/session', '/setup', '/summary'].includes(location.pathname) && 
       !location.pathname.startsWith('/history/') && <BottomNav />}
      <MuseBleDebugPanel />
    </div>
  );
}

export default App;
