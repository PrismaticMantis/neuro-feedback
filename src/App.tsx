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
import { audioEngine } from './lib/audio-engine';
import { museHandler } from './lib/muse-handler';
import { movementDetector, DEBUG_MOVEMENT } from './lib/movement-detector';
import { calculateCalmScore, calculateCreativeFlowScore } from './lib/flow-state';
import {
  buildSessionRecord,
  saveSessionRecord,
  getLastJourneyId,
} from './lib/session-storage';
import { ENABLE_SESSION_HISTORY } from './lib/feature-flags';
import type { ThresholdSettings } from './types';
import './App.css';

const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = {
  coherenceSensitivity: 0.5,
};

function sensitivityToCoherenceThreshold(sensitivity: number): number {
  return 0.2 + sensitivity * 0.7;
}

function sensitivityToTimeThreshold(sensitivity: number): number {
  return 1000 + sensitivity * 9000;
}

function App() {
  const muse = useMuse();
  const audio = useAudio();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [thresholdSettings, setThresholdSettings] = useState<ThresholdSettings>(
    DEFAULT_THRESHOLD_SETTINGS
  );

  useEffect(() => {
    const coherenceThreshold = sensitivityToCoherenceThreshold(thresholdSettings.coherenceSensitivity);
    const timeThreshold = sensitivityToTimeThreshold(thresholdSettings.coherenceSensitivity);
    const isEasyMode = thresholdSettings.coherenceSensitivity < 0.33;

    muse.setThresholdSettings({
      coherenceThreshold,
      timeThreshold,
      useRelativeMode: isEasyMode,
    });
    audioEngine.setDifficultyPreset(thresholdSettings.coherenceSensitivity);
  }, [thresholdSettings.coherenceSensitivity, muse.setThresholdSettings]);

  const hasGoodContact = (() => {
    const { tp9, af7, af8, tp10 } = muse.electrodeStatus;
    return [tp9, af7, af8, tp10].filter((q) => q === 'good' || q === 'medium').length >= 3;
  })();

  useEffect(() => {
    if (!session.isSessionActive || !muse.state.connected) return;

    const { tp9, af7, af8, tp10 } = muse.electrodeStatus;
    const contactScores = [tp9, af7, af8, tp10].map((q) =>
      q === 'good' ? 1.0 : q === 'medium' ? 0.5 : 0
    );
    const contactQuality = contactScores.reduce<number>((a, b) => a + b, 0) / 4;
    const timeSinceLastUpdate = museHandler.getConnectionStateDetail().timeSinceLastUpdate;
    const signalQuality = {
      isConnected: muse.state.connected,
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
    muse.state.connected,
    muse.state.touching,
    muse.state.bandsSmooth,
    muse.electrodeStatus,
    hasGoodContact,
    session.isSessionActive,
  ]);

  const handleStartSession = useCallback(async () => {
    try {
      await audio.init();
      await audioEngine.startSession();
      if (audio.entrainmentEnabled) await audio.setEntrainmentEnabled(true);
      
      // Wire movement detection -> audio cue playback (end-to-end pipeline)
      // Flow: Muse accelerometer -> MovementDetector (axis-delta) -> this callback -> playMovementCue()
      movementDetector.setOnMovement((movementDelta, source) => {
        const cueNumber = audioEngine.playMovementCue();
        if (DEBUG_MOVEMENT) {
          console.log('[Move] PLAY movement-cue-' + cueNumber + '.mp3 source=' + source +
            ' delta=' + movementDelta.toFixed(4));
        }
      });
      movementDetector.start();
      
      session.startSession();
      navigate('/session');
    } catch (e) {
      console.error('[App] Begin session failed:', e);
    }
  }, [audio, session, navigate]);

  const handleEndSession = useCallback(() => {
    // Stop movement detection
    movementDetector.stop();
    movementDetector.setOnMovement(null);
    
    const audioMetrics = audioEngine.getCoherenceMetrics();
    audioEngine.stopSession();
    audio.setEntrainmentEnabled(false);
    session.endSession(audioMetrics.totalCoherenceAudioTimeMs);
    navigate('/summary');
  }, [audio, session, navigate]);

  const handleNewSession = useCallback(() => {
    session.setScreen('setup');
    navigate('/home');
  }, [session, navigate]);

  const handleSaveSession = useCallback(() => {
    const s = session.lastSession;
    const st = session.lastSessionStats;
    const user = session.currentUser;
    if (!s || !st || !user || !ENABLE_SESSION_HISTORY) return;

    const journeyId = getLastJourneyId(user.id);
    const coherencePercent = s.duration > 0
      ? (s.coherenceTime / s.duration) * 100
      : 0;

    const record = buildSessionRecord({
      id: s.id,
      userId: user.id,
      journeyId,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMs: s.duration,
      coherenceMs: s.coherenceTime,
      coherencePercent,
      coherenceEntries: 0,
      longestStreakMs: s.longestStreak,
      avgCoherence: s.avgCoherence,
      achievementScore: st.achievementScore,
      coherenceHistory: s.coherenceHistory,
    });
    saveSessionRecord(record);
  }, [session.lastSession, session.lastSessionStats, session.currentUser]);

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
                onNewSession={handleNewSession}
                onExportData={session.exportData}
                onSaveSession={handleSaveSession}
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
    </div>
  );
}

export default App;
