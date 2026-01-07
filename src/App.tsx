// Neuro-Somatic Feedback App - Main Application

import { useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMuse } from './hooks/useMuse';
import { useAudio } from './hooks/useAudio';
import { useSession } from './hooks/useSession';
import { SessionSetup } from './components/SessionSetup';
import { ActiveSession } from './components/ActiveSession';
import { SessionSummary } from './components/SessionSummary';
import './App.css';

function App() {
  // Hooks
  const muse = useMuse();
  const audio = useAudio();
  const session = useSession();

  // Handle quiet power state changes for rewards
  useEffect(() => {
    if (session.isSessionActive) {
      session.updateQuietPowerState(muse.quietPower.isActive, muse.coherence);

      // Trigger reward on quiet power
      if (muse.quietPower.isActive && !audio.isRewardPlaying) {
        audio.startReward();
      } else if (!muse.quietPower.isActive && audio.isRewardPlaying) {
        audio.stopReward();
      }
    }
  }, [
    muse.quietPower.isActive,
    muse.coherence,
    session.isSessionActive,
    audio.isRewardPlaying,
  ]);

  // Handle start session
  const handleStartSession = useCallback(async () => {
    await audio.init();
    if (audio.entrainmentEnabled) {
      await audio.setEntrainmentEnabled(true);
    }
    session.startSession();
  }, [audio, session]);

  // Handle end session
  const handleEndSession = useCallback(() => {
    audio.stopReward();
    audio.setEntrainmentEnabled(false);
    session.endSession();
  }, [audio, session]);

  // Handle new session
  const handleNewSession = useCallback(() => {
    session.setScreen('setup');
  }, [session]);

  // Toggle entrainment during session
  const handleEntrainmentToggle = useCallback(() => {
    audio.setEntrainmentEnabled(!audio.entrainmentEnabled);
  }, [audio]);

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {session.screen === 'setup' && (
          <SessionSetup
            key="setup"
            // Connection
            museConnected={muse.state.connected}
            museDeviceName={muse.state.deviceName}
            connectionQuality={muse.state.connectionQuality}
            onConnectBluetooth={muse.connectBluetooth}
            onConnectOSC={muse.connectOSC}
            onDisconnect={muse.disconnect}
            isBluetoothAvailable={muse.isBluetoothAvailable}
            connectionError={muse.error}
            // Audio
            entrainmentType={audio.entrainmentType}
            entrainmentEnabled={audio.entrainmentEnabled}
            entrainmentVolume={audio.entrainmentVolume}
            onEntrainmentTypeChange={audio.setEntrainmentType}
            onEntrainmentEnabledChange={audio.setEntrainmentEnabled}
            onEntrainmentVolumeChange={audio.setEntrainmentVolume}
            // User
            currentUser={session.currentUser}
            users={session.users}
            onCreateUser={session.createUser}
            onSelectUser={session.selectUser}
            // Session
            onStartSession={handleStartSession}
          />
        )}

        {session.screen === 'session' && (
          <ActiveSession
            key="session"
            duration={session.sessionDuration}
            coherenceHistory={session.coherenceHistory}
            currentCoherence={muse.coherence}
            coherenceZone={muse.coherenceZone}
            quietPowerActive={muse.quietPower.isActive}
            currentStreak={session.currentStreak}
            museConnected={muse.state.connected}
            touching={muse.state.touching}
            entrainmentEnabled={audio.entrainmentEnabled}
            onEntrainmentToggle={handleEntrainmentToggle}
            isRewardPlaying={audio.isRewardPlaying}
            onEndSession={handleEndSession}
          />
        )}

        {session.screen === 'summary' && session.lastSession && session.lastSessionStats && (
          <SessionSummary
            key="summary"
            session={session.lastSession}
            stats={session.lastSessionStats}
            user={session.currentUser!}
            onNewSession={handleNewSession}
            onExportData={session.exportData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
