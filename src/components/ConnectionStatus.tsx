// Connection Status Component
// Shows Muse and headphone connection status

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectionStatusProps {
  museConnected: boolean;
  museDeviceName: string | null;
  connectionQuality: number;
  onConnectBluetooth: () => void;
  onConnectOSC: (url?: string) => void;
  onDisconnect: () => void;
  isBluetoothAvailable: boolean;
  error: string | null;
}

// Detect iOS/iPadOS
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Detect if running in a WebBluetooth-capable browser on iOS (like Bluefy)
function isWebBluetoothBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.bluetooth !== undefined;
}

export function ConnectionStatus({
  museConnected,
  museDeviceName,
  connectionQuality,
  onConnectBluetooth,
  onConnectOSC,
  onDisconnect,
  isBluetoothAvailable,
  error,
}: ConnectionStatusProps) {
  const [showOSCHelp, setShowOSCHelp] = useState(false);
  const [oscUrl, setOscUrl] = useState('ws://localhost:8080');
  const isiOSDevice = isIOS();
  const showIOSWarning = isiOSDevice && !isWebBluetoothBrowser();

  const handleOSCConnect = () => {
    onConnectOSC(oscUrl || undefined);
  };

  return (
    <div className="connection-status">
      <div className="status-bar">
        {/* Muse Status */}
        <div className="status-item">
          <div className="status-icon muse-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <div className="status-text">
            <span className="status-label">Muse</span>
            <span className={`status-value ${museConnected ? 'connected' : ''}`}>
              {museConnected ? museDeviceName || 'Connected' : 'Not Connected'}
            </span>
          </div>
          <motion.div
            className={`status-indicator ${museConnected ? 'active' : ''}`}
            animate={{
              scale: museConnected ? [1, 1.2, 1] : 1,
              opacity: museConnected ? 1 : 0.3,
            }}
            transition={{ repeat: museConnected ? Infinity : 0, duration: 2 }}
          />
        </div>

        {/* Headphone Status */}
        <div className="status-item">
          <div className="status-icon headphone-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
            </svg>
          </div>
          <div className="status-text">
            <span className="status-label">Headphone</span>
            <span className="status-value hint">Required for binaural</span>
          </div>
        </div>
      </div>

      {/* Connection Quality Bar */}
      {museConnected && (
        <div className="quality-bar">
          <span className="quality-label">Signal Quality</span>
          <div className="quality-track">
            <motion.div
              className="quality-fill"
              initial={{ width: 0 }}
              animate={{ width: `${connectionQuality * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="quality-value">{Math.round(connectionQuality * 100)}%</span>
        </div>
      )}

      {/* Error Message */}
      {error && <div className="error-message">{error}</div>}

      {/* iOS Warning */}
      {!museConnected && showIOSWarning && (
        <div className="ios-warning">
          <div className="ios-warning-header">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>Safari doesn't support Bluetooth</span>
          </div>
          <p className="ios-warning-text">
            To connect your Muse on iOS, you have two options:
          </p>
          <div className="ios-options">
            <div className="ios-option">
              <strong>Option 1: Bluefy Browser</strong>
              <p>Download the free <a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055" target="_blank" rel="noopener noreferrer">Bluefy app</a> from the App Store. It's a browser with Bluetooth support—just open this page there.</p>
            </div>
            <div className="ios-option">
              <strong>Option 2: Mind Monitor + OSC</strong>
              <p>Use the <a href="https://apps.apple.com/app/mind-monitor/id988527143" target="_blank" rel="noopener noreferrer">Mind Monitor app</a> to stream data via OSC to a computer running an OSC-WebSocket bridge.</p>
              <button 
                className="btn btn-text ios-help-btn"
                onClick={() => setShowOSCHelp(!showOSCHelp)}
              >
                {showOSCHelp ? 'Hide setup guide' : 'Show setup guide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OSC Help Panel */}
      <AnimatePresence>
        {showOSCHelp && (
          <motion.div 
            className="osc-help-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <h4>OSC Setup Guide</h4>
            <ol>
              <li>Install <a href="https://apps.apple.com/app/mind-monitor/id988527143" target="_blank" rel="noopener noreferrer">Mind Monitor</a> on your iOS device</li>
              <li>Connect your Muse to Mind Monitor via Bluetooth</li>
              <li>On your computer, run an OSC-to-WebSocket bridge:
                <code className="code-block">npx osc-js --udp 9000 --ws 8080</code>
              </li>
              <li>In Mind Monitor settings, set OSC Stream Target IP to your computer's IP</li>
              <li>Start streaming in Mind Monitor, then connect below</li>
            </ol>
            <div className="osc-url-input">
              <label>WebSocket URL:</label>
              <input 
                type="text" 
                value={oscUrl} 
                onChange={(e) => setOscUrl(e.target.value)}
                placeholder="ws://localhost:8080"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Buttons */}
      {!museConnected && (
        <div className="connection-buttons">
          {isBluetoothAvailable && (
            <button className="btn btn-primary" onClick={onConnectBluetooth}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" />
              </svg>
              Connect Bluetooth
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleOSCConnect}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            Connect via OSC
          </button>
        </div>
      )}

      {museConnected && (
        <button className="btn btn-text disconnect-btn" onClick={onDisconnect}>
          Disconnect
        </button>
      )}
    </div>
  );
}
