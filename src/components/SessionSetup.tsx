// Session Setup Screen Component

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ConnectionStatus } from './ConnectionStatus';
import type { EntrainmentType, User } from '../types';

interface SessionSetupProps {
  // Connection
  museConnected: boolean;
  museDeviceName: string | null;
  connectionQuality: number;
  onConnectBluetooth: () => void;
  onConnectOSC: () => void;
  onDisconnect: () => void;
  isBluetoothAvailable: boolean;
  connectionError: string | null;

  // Audio
  entrainmentType: EntrainmentType;
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  onEntrainmentTypeChange: (type: EntrainmentType) => void;
  onEntrainmentEnabledChange: (enabled: boolean) => void;
  onEntrainmentVolumeChange: (volume: number) => void;

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
  onConnectBluetooth,
  onConnectOSC,
  onDisconnect,
  isBluetoothAvailable,
  connectionError,
  entrainmentType,
  entrainmentEnabled,
  entrainmentVolume,
  onEntrainmentTypeChange,
  onEntrainmentEnabledChange,
  onEntrainmentVolumeChange,
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
                <span className="radio-label">Manual Tones (Isochronic)</span>
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
