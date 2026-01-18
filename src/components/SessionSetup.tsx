// Session Setup Screen Component

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ConnectionStatus } from './ConnectionStatus';
import { ElectrodeStatus } from './ElectrodeStatus';
import { BINAURAL_PRESETS } from '../hooks/useAudio';
import type {
  EntrainmentType,
  User,
  BinauralPresetName,
  ElectrodeStatus as ElectrodeStatusType,
  ThresholdSettings,
  IsochronicPresetName,
  IsochronicTone,
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
  entrainmentType: EntrainmentType;
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  binauralPreset: BinauralPresetName;
  binauralBeatFreq: number;
  isochronicPreset: IsochronicPresetName;
  isochronicTones: IsochronicTone[];
  onEntrainmentTypeChange: (type: EntrainmentType) => void;
  onEntrainmentEnabledChange: (enabled: boolean) => void;
  onEntrainmentVolumeChange: (volume: number) => void;
  onBinauralPresetChange: (preset: BinauralPresetName) => void;
  onBinauralBeatFreqChange: (freq: number) => void;
  onIsochronicPresetChange: (preset: IsochronicPresetName) => void;
  onIsochronicToneChange: (id: string, partial: Partial<IsochronicTone>) => void;
  onIsochronicToneAdd: () => void;
  onIsochronicToneRemove: (id: string) => void;

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
  entrainmentType,
  entrainmentEnabled,
  entrainmentVolume,
  binauralPreset,
  binauralBeatFreq,
  isochronicPreset,
  isochronicTones,
  onEntrainmentTypeChange,
  onEntrainmentEnabledChange,
  onEntrainmentVolumeChange,
  onBinauralPresetChange,
  onBinauralBeatFreqChange,
  onIsochronicPresetChange,
  onIsochronicToneChange,
  onIsochronicToneAdd,
  onIsochronicToneRemove,
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

  return (
    <motion.div
      className="screen session-setup"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <header className="screen-header">
        <h1>Session Setup</h1>
      </header>

      <div className="setup-content">
        {/* Connection Status */}
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

        {/* Detection Settings */}
        <section className="setup-section">
          <h2>Detection Settings</h2>
          <div className="settings-group">
            <div className="setting-row">
              <label className="setting-label">
                <span>Coherence Threshold</span>
                <span className="setting-value">{Math.round(thresholdSettings.coherenceThreshold * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.2"
                max="0.9"
                step="0.05"
                value={thresholdSettings.coherenceThreshold}
                onChange={(e) =>
                  onThresholdSettingsChange({
                    ...thresholdSettings,
                    coherenceThreshold: parseFloat(e.target.value),
                  })
                }
                className="setting-slider"
              />
              <p className="setting-hint">Higher threshold = stricter Flow State detection</p>
            </div>

            <div className="setting-row">
              <label className="setting-label">
                <span>Time Threshold</span>
                <span className="setting-value">{thresholdSettings.timeThreshold / 1000}s</span>
              </label>
              <input
                type="range"
                min="1000"
                max="10000"
                step="1000"
                value={thresholdSettings.timeThreshold}
                onChange={(e) => onThresholdSettingsChange({
                  ...thresholdSettings,
                  timeThreshold: parseInt(e.target.value)
                })}
                className="setting-slider"
              />
              <p className="setting-hint">How long to sustain coherence before entering Flow State</p>
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
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="entrainment"
                  value="binaural"
                  checked={entrainmentType === 'binaural'}
                  onChange={() => onEntrainmentTypeChange('binaural')}
                  disabled={!entrainmentEnabled}
                />
                <span className="radio-label">Binaural Beats</span>
              </label>

              <label className="radio-option">
                <input
                  type="radio"
                  name="entrainment"
                  value="isochronic"
                  checked={entrainmentType === 'isochronic'}
                  onChange={() => onEntrainmentTypeChange('isochronic')}
                  disabled={!entrainmentEnabled}
                />
                <span className="radio-label">Isochronic Tones</span>
              </label>

              <label className="radio-option">
                <input
                  type="radio"
                  name="entrainment"
                  value="none"
                  checked={entrainmentType === 'none'}
                  onChange={() => onEntrainmentTypeChange('none')}
                  disabled={!entrainmentEnabled}
                />
                <span className="radio-label">None</span>
              </label>
            </div>

            {/* Binaural Presets (shown when binaural is selected) */}
            {entrainmentType === 'binaural' && (
              <div className="binaural-settings">
                <h3 className="subsection-title">Binaural Preset</h3>
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

                <div className="custom-freq">
                  <label className="setting-label">
                    <span>Custom Frequency</span>
                    <span className="setting-value">{binauralBeatFreq} Hz</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    step="1"
                    value={binauralBeatFreq}
                    onChange={(e) => onBinauralBeatFreqChange(parseInt(e.target.value))}
                    disabled={!entrainmentEnabled}
                    className="setting-slider"
                  />
                </div>
              </div>
            )}

            {/* Isochronic Advanced Panel (shown when isochronic is selected) */}
            {entrainmentType === 'isochronic' && (
              <div className="isochronic-settings">
                <details className="iso-advanced" open>
                  <summary className="iso-advanced-summary">Advanced Isochronic Editor</summary>
                  <div className="iso-advanced-body">
                    <div className="iso-preset-row">
                      <label className="setting-label">
                        <span>Isochronic Preset</span>
                      </label>
                      <select
                        className="iso-preset-select"
                        value={isochronicPreset}
                        onChange={(e) => onIsochronicPresetChange(e.target.value as IsochronicPresetName)}
                        disabled={!entrainmentEnabled}
                      >
                        <option value="single_focus">Single Focus Pulse</option>
                        <option value="dual_layer_focus">Dual Layer Focus</option>
                        <option value="deep_relax">Deep Relax</option>
                      </select>
                    </div>

                    <div className="iso-tone-list">
                      {isochronicTones.map((tone) => (
                        <div key={tone.id} className="iso-tone-row">
                          <div className="iso-tone-header">
                            <span className="iso-tone-title">Tone</span>
                            <label className="toggle small">
                              <input
                                type="checkbox"
                                checked={tone.enabled}
                                onChange={(e) =>
                                  onIsochronicToneChange(tone.id, { enabled: e.target.checked })
                                }
                              />
                              <span className="toggle-slider" />
                            </label>
                            <button
                              type="button"
                              className="iso-tone-remove"
                              onClick={() => onIsochronicToneRemove(tone.id)}
                            >
                              ×
                            </button>
                          </div>

                          <div className="setting-row">
                            <label className="setting-label">
                              <span>Carrier</span>
                              <span className="setting-value">{Math.round(tone.carrierFreq)} Hz</span>
                            </label>
                            <input
                              type="range"
                              min="100"
                              max="800"
                              step="5"
                              value={tone.carrierFreq}
                              onChange={(e) =>
                                onIsochronicToneChange(tone.id, {
                                  carrierFreq: parseFloat(e.target.value),
                                })
                              }
                              className="setting-slider"
                              disabled={!entrainmentEnabled}
                            />
                          </div>

                          <div className="setting-row">
                            <label className="setting-label">
                              <span>Pulse</span>
                              <span className="setting-value">{tone.pulseFreq.toFixed(1)} Hz</span>
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="40"
                              step="0.5"
                              value={tone.pulseFreq}
                              onChange={(e) =>
                                onIsochronicToneChange(tone.id, {
                                  pulseFreq: parseFloat(e.target.value),
                                })
                              }
                              className="setting-slider"
                              disabled={!entrainmentEnabled}
                            />
                          </div>

                          <div className="setting-row">
                            <label className="setting-label">
                              <span>Volume</span>
                              <span className="setting-value">
                                {Math.round(tone.volume * 100)}%
                              </span>
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={tone.volume}
                              onChange={(e) =>
                                onIsochronicToneChange(tone.id, {
                                  volume: parseFloat(e.target.value),
                                })
                              }
                              className="setting-slider"
                              disabled={!entrainmentEnabled}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary iso-add-tone"
                      onClick={onIsochronicToneAdd}
                      disabled={!entrainmentEnabled || isochronicTones.length >= 4}
                    >
                      Add Tone
                    </button>
                  </div>
                </details>
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
