// Neuro-Somatic Feedback App - Main Application

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMuse } from './hooks/useMuse';
import { useAudio } from './hooks/useAudio';
import { useSession } from './hooks/useSession';
import { SessionSetup } from './components/SessionSetup';
import { ActiveSession } from './components/ActiveSession';
import { SessionSummary } from './components/SessionSummary';
import { audioEngine } from './lib/audio-engine';
import { museHandler } from './lib/muse-handler';
import type { ThresholdSettings } from './types';
import './App.css';

// Default threshold settings
const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = {
  coherenceSensitivity: 0.5, // Medium difficulty
};

/**
 * Convert sensitivity (0-1) to coherence threshold (0.2-0.9)
 * Lower sensitivity = easier = lower threshold
 * Higher sensitivity = harder = higher threshold
 */
function sensitivityToCoherenceThreshold(sensitivity: number): number {
  return 0.2 + (sensitivity * 0.7); // 0.2 to 0.9
}

/**
 * Convert sensitivity (0-1) to time threshold in ms (1000-10000)
 * Lower sensitivity = easier = shorter time
 * Higher sensitivity = harder = longer time
 */
function sensitivityToTimeThreshold(sensitivity: number): number {
  return 1000 + (sensitivity * 9000); // 1000ms to 10000ms
}

function App() {
  // Hooks
  const muse = useMuse();
  const audio = useAudio();
  const session = useSession();

  // Threshold settings state
  const [thresholdSettings, setThresholdSettings] = useState<ThresholdSettings>(DEFAULT_THRESHOLD_SETTINGS);

  // Apply threshold settings to muse detector when they change
  useEffect(() => {
    // Convert sensitivity to actual thresholds
    const coherenceThreshold = sensitivityToCoherenceThreshold(thresholdSettings.coherenceSensitivity);
    const timeThreshold = sensitivityToTimeThreshold(thresholdSettings.coherenceSensitivity);
    
    // Pass converted thresholds to muse detector
    muse.setThresholdSettings({
      coherenceThreshold,
      timeThreshold,
    });
  }, [thresholdSettings.coherenceSensitivity, muse.setThresholdSettings]);

  // Check if we have good electrode contact (at least 3 of 4 electrodes good/medium)
  const hasGoodContact = (() => {
    const { tp9, af7, af8, tp10 } = muse.electrodeStatus;
    const goodCount = [tp9, af7, af8, tp10].filter(
      q => q === 'good' || q === 'medium'
    ).length;
    return goodCount >= 3;
  })();

  // Handle coherence updates for crossfade system
  useEffect(() => {
    if (session.isSessionActive && muse.state.connected) {
      // Calculate electrode contact quality (0-1)
      const { tp9, af7, af8, tp10 } = muse.electrodeStatus;
      const contactScores: number[] = [tp9, af7, af8, tp10].map(q => {
        if (q === 'good') return 1.0;
        if (q === 'medium') return 0.5;
        return 0;
      });
      const contactQuality = contactScores.reduce((a, b) => a + b, 0) / 4;
      
      // Get time since last update from muse handler
      const connectionState = museHandler.getConnectionStateDetail();
      const timeSinceLastUpdate = connectionState.timeSinceLastUpdate;
      
      // Build signal quality object
      const signalQuality = {
        isConnected: muse.state.connected,
        contactQuality,
        timeSinceLastUpdate,
      };
      
      // Update session coherence status
      session.updateCoherenceStatus(muse.coherenceStatus.isActive, muse.coherence);
      
      // Update audio engine coherence with signal quality gating
      audioEngine.updateCoherence(muse.coherence, signalQuality);
    }
  }, [
    muse.coherenceStatus.isActive,
    muse.coherence,
    muse.state.connected,
    muse.state.touching,
    muse.electrodeStatus,
    hasGoodContact,
    session.isSessionActive,
  ]);

  // Handle start session
  const handleStartSession = useCallback(async () => {
    await audio.init();
    // Start baseline/coherence audio session
    await audioEngine.startSession();
    
    if (audio.entrainmentEnabled) {
      await audio.setEntrainmentEnabled(true);
    }
    session.startSession();
  }, [audio, session]);

  // Handle end session
  const handleEndSession = useCallback(() => {
    // Stop baseline/coherence audio session
    audioEngine.stopSession();
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
            electrodeStatus={muse.electrodeStatus}
            batteryLevel={muse.state.batteryLevel}
            onConnectBluetooth={muse.connectBluetooth}
            onConnectOSC={muse.connectOSC}
            onDisconnect={muse.disconnect}
            isBluetoothAvailable={muse.isBluetoothAvailable}
            connectionError={muse.error}
            // Audio
            entrainmentEnabled={audio.entrainmentEnabled}
            entrainmentVolume={audio.entrainmentVolume}
            binauralPreset={audio.binauralPreset}
            onEntrainmentEnabledChange={audio.setEntrainmentEnabled}
            onEntrainmentVolumeChange={audio.setEntrainmentVolume}
            onBinauralPresetChange={audio.setBinauralPreset}
            // Threshold settings
            thresholdSettings={thresholdSettings}
            onThresholdSettingsChange={setThresholdSettings}
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
            coherenceState={audio.coherenceState}
            coherenceActive={muse.coherenceStatus.isActive}
            currentStreak={session.currentStreak}
            museConnected={muse.state.connected}
            touching={muse.state.touching}
            electrodeStatus={muse.electrodeStatus}
            bands={muse.state.bandsSmooth}
            bandsDb={muse.state.bandsDbSmooth}
            batteryLevel={muse.state.batteryLevel}
            entrainmentEnabled={audio.entrainmentEnabled}
            onEntrainmentToggle={handleEntrainmentToggle}
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
