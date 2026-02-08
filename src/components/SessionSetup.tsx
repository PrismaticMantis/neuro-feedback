// UI reference: design/targets/3 - Session Setup.png, design/targets/4 - Session Setup (Muse Connected).png
// Lovable design tokens applied: two-column layout, card styling, button styling

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
  // showUserForm state removed - Lovable design doesn't show user switcher inline

  const handleCreateUser = () => {
    if (newUserName.trim()) {
      onCreateUser(newUserName.trim());
      setNewUserName('');
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
      style={{
        padding: '0 24px 80px',
        maxWidth: '960px',
        margin: '0 auto',
      }}
    >
      {/* Header - Target 3: Back arrow + Title + Subtitle */}
      <header 
        className="setup-header-row"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '20px 0 16px',
        }}
      >
        <Link 
          to="/home" 
          className="setup-header-back" 
          aria-label="Back"
          style={{
            padding: '8px',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '4px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div className="setup-header-title-block" style={{ flex: 1 }}>
          <h1 
            className="setup-header-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '24px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 4px 0',
              lineHeight: 1.2,
            }}
          >
            Session Setup
          </h1>
          {subtitle && (
            <p 
              className="setup-header-subtitle"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 400,
                color: 'var(--text-muted)',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </header>

      {/* Card Grid — layout changes based on connection state:
         Not connected: 3 equal columns → all 3 cards in one row
         Connected:     2 columns, 2 rows → tight 2×2 grid
         alignContent: start prevents rows from stretching to fill the container. */}
      <div 
        className="setup-content"
        style={{
          display: 'grid',
          gridTemplateColumns: museConnected ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: '16px',
          alignItems: 'start',
          alignContent: 'start',
        }}
      >
        {/* Device Connection */}
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

        {/* Detection Settings */}
        <section 
          className="setup-section"
          style={{
            background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
            border: '1px solid hsl(270 15% 22% / 0.35)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
          }}
        >
          <h2 
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 16px 0',
              lineHeight: 1.3,
            }}
          >
            Detection Settings
          </h2>
          <div className="settings-group">
            <div className="setting-row" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 400, color: 'var(--text-primary)' }}>
                  Coherence Sensitivity
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, color: '#9B6BC8' }}>
                  {thresholdSettings.coherenceSensitivity < 0.33 
                    ? 'Easy' 
                    : thresholdSettings.coherenceSensitivity < 0.67 
                    ? 'Medium' 
                    : 'Hard'}
                </span>
              </div>
              
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
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '999px',
                  appearance: 'none',
                  background: `linear-gradient(to right, #D9C478 0%, #D9C478 ${thresholdSettings.coherenceSensitivity * 100}%, hsl(270 7% 20%) ${thresholdSettings.coherenceSensitivity * 100}%, hsl(270 7% 20%) 100%)`,
                  cursor: 'pointer',
                }}
              />
              
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)', fontStyle: 'italic', margin: '4px 0 0 0' }}>
                Controls how easy it is to enter coherence state
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 400, color: 'var(--text-subtle)' }}>
                  Current: Threshold {Math.round((0.2 + thresholdSettings.coherenceSensitivity * 0.7) * 100)}%, Time {Math.round((1 + thresholdSettings.coherenceSensitivity * 9) * 10) / 10}s
                </p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 400, color: 'var(--text-subtle)' }}>
                  Easy (0.0): Threshold 20%, Time 1.0s
                </p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 400, color: 'var(--text-subtle)' }}>
                  Hard (1.0): Threshold 90%, Time 10.0s
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Electrode Contact — only when Muse connected (row 2 in 2-col mode) */}
        {museConnected && (
          <section 
            className="setup-section"
            style={{
              background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
              border: '1px solid hsl(270 15% 22% / 0.35)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
            }}
          >
            <ElectrodeStatus status={electrodeStatus} />
            {batteryLevel >= 0 && (
              <div 
                className={`battery-display ${batteryLevel <= 20 ? 'low' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '16px',
                  padding: '8px 12px',
                  background: 'hsl(270 10% 16% / 0.6)',
                  borderRadius: '8px',
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ color: batteryLevel <= 20 ? '#c73c3c' : '#D9C478' }}>
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
                <span 
                  className="battery-text"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: batteryLevel <= 20 ? '#c73c3c' : 'var(--text-muted)',
                  }}
                >
                  {batteryLevel}%
                </span>
              </div>
            )}
          </section>
        )}

        {/* Guidance Audio — col 3 in 3-col mode (not connected), or row 2 col 2 in 2-col mode (connected) */}
        <section 
          className="setup-section"
          style={{
            background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
            border: '1px solid hsl(270 15% 22% / 0.35)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0', lineHeight: 1.3 }}>
                Guidance Audio
              </h2>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>
                Optional Entrainment
              </span>
            </div>
            <label 
              className="toggle"
              style={{
                position: 'relative',
                width: '44px',
                height: '24px',
                flexShrink: 0,
              }}
            >
              <input
                type="checkbox"
                checked={entrainmentEnabled}
                onChange={(e) => onEntrainmentEnabledChange(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span 
                className="toggle-slider"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: entrainmentEnabled ? '#D9C478' : 'hsl(270 7% 20%)',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    width: '18px',
                    height: '18px',
                    left: entrainmentEnabled ? '23px' : '3px',
                    bottom: '3px',
                    background: entrainmentEnabled ? '#0c0a0e' : 'var(--text-muted)',
                    borderRadius: '50%',
                    transition: 'all 0.2s ease',
                  }}
                />
              </span>
            </label>
          </div>

          <div className={`audio-options ${!entrainmentEnabled ? 'disabled' : ''}`} style={{ opacity: entrainmentEnabled ? 1 : 0.5 }}>
            {entrainmentEnabled && (
              <div className="binaural-settings" style={{ marginBottom: '16px', paddingTop: '12px', borderTop: '1px solid hsl(270 15% 22% / 0.3)' }}>
                <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '10px' }}>Preset</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {(['delta', 'theta', 'alpha', 'beta'] as const).map((preset) => (
                    <button
                      key={preset}
                      className={`preset-btn ${binauralPreset === preset ? 'active' : ''}`}
                      onClick={() => onBinauralPresetChange(preset)}
                      disabled={!entrainmentEnabled}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '10px',
                        background: binauralPreset === preset ? 'hsl(45 55% 70% / 0.15)' : 'hsl(270 10% 14%)',
                        border: binauralPreset === preset ? '1px solid hsl(45 55% 70% / 0.4)' : '1px solid transparent',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{BINAURAL_PRESETS[preset].label}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#D9C478' }}>{BINAURAL_PRESETS[preset].beatFrequency} Hz</span>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>{BINAURAL_PRESETS[preset].description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entrainmentEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
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
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    appearance: 'none',
                    background: `linear-gradient(to right, #D9C478 0%, #D9C478 ${entrainmentVolume * 100}%, hsl(270 7% 20%) ${entrainmentVolume * 100}%, hsl(270 7% 20%) 100%)`,
                    cursor: 'pointer',
                  }}
                />
              </div>
            )}

            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              These sounds gently guide your nervous system. They do not indicate success.
            </p>
          </div>
        </section>

        {/* Debug Electrode Overlay — only when enabled and connected */}
        {museConnected && DEBUG_ELECTRODES_OVERLAY && (
          <section 
            className="setup-section debug-overlay"
            style={{
              gridColumn: '1 / -1',
              background: 'hsl(270 10% 12% / 0.9)',
              border: '2px solid var(--accent-primary)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <h3 style={{ color: 'var(--accent-primary)', marginBottom: 12, fontSize: '14px' }}>Electrode Debug</h3>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
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

        {/* User Selection (only when no user is selected) — spans full width */}
        {!currentUser && (
          <section 
            className="setup-section"
            style={{
              gridColumn: '1 / -1',
              background: 'linear-gradient(165deg, hsl(270 7% 13% / 0.75), hsl(270 10% 9% / 0.85))',
              border: '1px solid hsl(270 15% 22% / 0.35)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 20px hsl(270 20% 2% / 0.5)',
              maxWidth: '480px',
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0', lineHeight: 1.3 }}>
              User Profile
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)', marginBottom: '12px' }}>
              Select or create a user to track your sessions
            </p>
            {users.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onSelectUser(user.id)}
                    style={{
                      padding: '8px 14px',
                      background: 'hsl(270 10% 14%)',
                      border: '1px solid transparent',
                      borderRadius: '8px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {user.name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Enter name..."
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateUser()}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'hsl(270 10% 14%)',
                  border: '1px solid hsl(270 15% 22% / 0.3)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={handleCreateUser}
                disabled={!newUserName.trim()}
                style={{
                  padding: '10px 18px',
                  background: 'hsl(270 10% 14%)',
                  border: '1px solid hsl(270 15% 25% / 0.4)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: newUserName.trim() ? 1 : 0.5,
                }}
              >
                Create
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Start Button Footer - Target 3/4: Centered gold button */}
      <footer 
        className="screen-footer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          paddingTop: '20px',
        }}
      >
        <motion.button
          className="btn btn-primary btn-large"
          onClick={onStartSession}
          disabled={!canStartSession}
          whileHover={{ scale: canStartSession ? 1.02 : 1, y: canStartSession ? -2 : 0 }}
          whileTap={{ scale: canStartSession ? 0.98 : 1 }}
          style={{
            padding: '16px 48px',
            background: canStartSession 
              ? 'linear-gradient(135deg, #D9C478, #C9B468)'
              : 'hsl(270 10% 20%)',
            color: canStartSession ? '#0c0a0e' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '999px',
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            fontWeight: 500,
            cursor: canStartSession ? 'pointer' : 'not-allowed',
            boxShadow: canStartSession 
              ? '0 4px 20px hsl(45 55% 70% / 0.3)'
              : 'none',
            transition: 'all 0.2s ease',
            minWidth: '200px',
          }}
        >
          Begin Practice
        </motion.button>
        <p 
          className="footer-hint"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--text-muted)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {!canStartSession
            ? (!museConnected
                ? 'Connect your Muse device to begin'
                : 'Select a user profile to begin')
            : 'Ready to begin your session'}
        </p>
      </footer>
    </motion.div>
  );
}
