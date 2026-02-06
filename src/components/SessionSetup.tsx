// UI reference: design/targets/3 - Session Setup.png, design/targets/4 - Session Setup (Muse Connected).png

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getLastJourneyId, getJourneys } from '../lib/session-storage';
import { ConnectionStatus } from './ConnectionStatus';
import { ElectrodeStatus } from './ElectrodeStatus';
import { BINAURAL_PRESETS } from '../hooks/useAudio';
import { DEBUG_ELECTRODES_OVERLAY } from '../lib/feature-flags';
import { museHandler } from '../lib/muse-handler';
import type {
  User,
  BinauralPresetName,
  ElectrodeStatus as ElectrodeStatusType,
  ThresholdSettings,
} from '../types';

interface SessionSetupProps {
  // Connection
  museConnected: boolean;
  museDeviceName: string | null;
  connectionQuality: number;
  electrodeStatus: ElectrodeStatusType;
  batteryLevel: number;
  onConnectBluetooth: () => void;
  onConnectOSC: (url?: string) => void;
  onDisconnect: () => void;
  isBluetoothAvailable: boolean;
  connectionError: string | null;

  // Audio
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  binauralPreset: BinauralPresetName;
  onEntrainmentEnabledChange: (enabled: boolean) => void;
  onEntrainmentVolumeChange: (volume: number) => void;
  onBinauralPresetChange: (preset: BinauralPresetName) => void;

  // Threshold settings
  thresholdSettings: ThresholdSettings;
  onThresholdSettingsChange: (settings: ThresholdSettings) => void;

  // User
  currentUser: User | null;
  users: User[];
  onCreateUser: (name: string) => void;
  onSelectUser: (userId: string) => void;

  // Session
  onStartSession: () => void;
}

export function SessionSetup({
  museConnected,
  museDeviceName,
  connectionQuality,
  electrodeStatus,
  batteryLevel,
  onConnectBluetooth,
  onConnectOSC,
  onDisconnect,
  isBluetoothAvailable,
  connectionError,
  entrainmentEnabled,
  entrainmentVolume,
  binauralPreset,
  onEntrainmentEnabledChange,
  onEntrainmentVolumeChange,
  onBinauralPresetChange,
  thresholdSettings,
  onThresholdSettingsChange,
  currentUser,
  users,
  onCreateUser,
  onSelectUser,
  onStartSession,
}: SessionSetupProps) {
  const [newUserName, setNewUserName] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);

  const handleCreateUser = () => {
    if (newUserName.trim()) {
      onCreateUser(newUserName.trim());
      setNewUserName('');
      setShowUserForm(false);
    }
  };

  const canStartSession = museConnected && currentUser;
  const journeyId = currentUser ? getLastJourneyId(currentUser.id) : null;
  const journey = journeyId ? getJourneys().find((j) => j.id === journeyId) : null;
  const subtitle = journey ? `${journey.name} Journey` : '';

  return (
    <motion.div
      className="screen session-setup"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <header className="setup-header-row">
        <Link to="/home" className="setup-header-back" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </Link>
        <div className="setup-header-title-block">
          <h1 className="setup-header-title">Session Setup</h1>
          {subtitle && <p className="setup-header-subtitle">{subtitle}</p>}
        </div>
      </header>

      <div className="setup-content">
        {/* Left Column: Device Connection */}
        <div className="setup-column-left">
          <ConnectionStatus
            museConnected={museConnected}
            museDeviceName={museDeviceName}
            connectionQuality={connectionQuality}
            onConnectBluetooth={onConnectBluetooth}
            onConnectOSC={onConnectOSC}
            onDisconnect={onDisconnect}
            isBluetoothAvailable={isBluetoothAvailable}
            error={connectionError}
          />

          {/* Debug Overlay (when enabled) */}
          {DEBUG_ELECTRODES_OVERLAY && museConnected && (
            <section className="setup-section debug-overlay">
              <h3 style={{ color: 'var(--accent-primary)', marginBottom: 12 }}>🔍 Electrode Debug</h3>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6 }}>
                <div>connected: {String(museConnected)}</div>
                <div>raw horseshoe: [{museHandler.getElectrodeQuality().join(', ')}]</div>
                <div>electrodeStatus: {JSON.stringify(electrodeStatus)}</div>
                <div>connectionQuality: {connectionQuality.toFixed(2)}</div>
                <div>signalLabel: {(() => {
                  const goodCount = [electrodeStatus.tp9, electrodeStatus.af7, electrodeStatus.af8, electrodeStatus.tp10].filter(q => q === 'good').length;
                  return goodCount >= 3 ? 'Strong' : goodCount >= 1 ? 'Partial' : 'Poor';
                })()}</div>
              </div>
            </section>
          )}

          {/* Electrode Status (show when connected) */}
          {museConnected && (
            <section className="setup-section">
              <ElectrodeStatus status={electrodeStatus} />
              {batteryLevel >= 0 && (
                <div className={`battery-display ${batteryLevel <= 20 ? 'low' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    {batteryLevel > 75 ? (
                      <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
                    ) : batteryLevel > 50 ? (
                      <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM13 18H11V9h2v9z" />
                    ) : batteryLevel > 25 ? (
                      <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM13 18H11V13h2v5z" />
                    ) : (
                      <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM13 18H11V16h2v2z" />
                    )}
                  </svg>
                  <span className="battery-text">
                    {batteryLevel}%
                  </span>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Column: Detection Settings, Guidance Audio, User Profile */}
        <div className="setup-column-right">
          {/* Detection Settings */}
          <section className="setup-section">
            <h2>Detection Settings</h2>
            <div className="settings-group">
              <div className="setting-row">
                <label className="setting-label">
                  <span>Coherence Sensitivity</span>
                  <span className="setting-value">
                    {thresholdSettings.coherenceSensitivity < 0.33 
                      ? 'Easy' 
                      : thresholdSettings.coherenceSensitivity < 0.67 
                      ? 'Medium' 
                      : 'Hard'}
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={thresholdSettings.coherenceSensitivity}
                  onChange={(e) =>
                    onThresholdSettingsChange({
                      ...thresholdSettings,
                      coherenceSensitivity: parseFloat(e.target.value),
                    })
                  }
                  className="setting-slider"
                />
                <div className="setting-hint-group">
                  <p className="setting-hint">
                    Controls how easy it is to enter coherence state
                  </p>
                  <div className="setting-hint-details">
                    <p className="setting-hint-detail">
                      Current: Threshold {Math.round((0.2 + thresholdSettings.coherenceSensitivity * 0.7) * 100)}%, Time {Math.round((1 + thresholdSettings.coherenceSensitivity * 9) * 10) / 10}s
                    </p>
                    <p className="setting-hint-detail">
                      <span className="hint-label">Easy (0.0):</span> Threshold 20%, Time 1.0s
                    </p>
                    <p className="setting-hint-detail">
                      <span className="hint-label">Hard (1.0):</span> Threshold 90%, Time 10.0s
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Guidance Audio */}
          <section className="setup-section">
            <div className="section-header">
              <h2>Guidance Audio</h2>
              <span className="section-subtitle">(Optional Entrainment)</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={entrainmentEnabled}
                  onChange={(e) => onEntrainmentEnabledChange(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className={`audio-options ${!entrainmentEnabled ? 'disabled' : ''}`}>
              {/* Binaural Presets (shown when guidance audio is enabled) */}
              {entrainmentEnabled && (
                <div className="binaural-settings">
                  <h3 className="subsection-title">Preset</h3>
                  <div className="preset-grid">
                    {(['delta', 'theta', 'alpha', 'beta'] as const).map((preset) => (
                      <button
                        key={preset}
                        className={`preset-btn ${binauralPreset === preset ? 'active' : ''}`}
                        onClick={() => onBinauralPresetChange(preset)}
                        disabled={!entrainmentEnabled}
                      >
                        <span className="preset-name">{BINAURAL_PRESETS[preset].label}</span>
                        <span className="preset-freq">{BINAURAL_PRESETS[preset].beatFrequency} Hz</span>
                        <span className="preset-desc">{BINAURAL_PRESETS[preset].description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="volume-control">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={entrainmentVolume}
                  onChange={(e) => onEntrainmentVolumeChange(parseFloat(e.target.value))}
                  disabled={!entrainmentEnabled}
                />
              </div>

              <p className="audio-hint">
                These sounds gently guide your nervous system. They do not indicate success.
              </p>
            </div>
          </section>

          {/* User Selection */}
          <section className="setup-section">
            <h2>User Profile</h2>
            {currentUser ? (
              <div className="current-user">
                <span className="user-name">{currentUser.name}</span>
                <button
                  className="btn btn-text"
                  onClick={() => setShowUserForm(!showUserForm)}
                >
                  Switch User
                </button>
              </div>
            ) : (
              <p className="hint">Select or create a user to track your sessions</p>
            )}

            {(showUserForm || !currentUser) && (
              <div className="user-selection">
                {users.length > 0 && (
                  <div className="user-list">
                    {users.map((user) => (
                      <button
                        key={user.id}
                        className={`user-btn ${currentUser?.id === user.id ? 'active' : ''}`}
                        onClick={() => {
                          onSelectUser(user.id);
                          setShowUserForm(false);
                        }}
                      >
                        {user.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="new-user-form">
                  <input
                    type="text"
                    placeholder="Enter name..."
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleCreateUser}
                    disabled={!newUserName.trim()}
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Start Button */}
      <footer className="screen-footer">
        <motion.button
          className="btn btn-primary btn-large"
          onClick={onStartSession}
          disabled={!canStartSession}
          whileHover={{ scale: canStartSession ? 1.02 : 1 }}
          whileTap={{ scale: canStartSession ? 0.98 : 1 }}
        >
          Begin Practice
        </motion.button>
        {!canStartSession && (
          <p className="footer-hint">
            {!museConnected
              ? 'Connect your Muse device to begin'
              : 'Select a user profile to begin'}
          </p>
        )}
      </footer>
    </motion.div>
  );
}
