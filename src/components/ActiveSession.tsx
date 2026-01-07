// Active Session Screen Component

import { motion } from 'framer-motion';
import { CoherenceGraph } from './CoherenceGraph';

interface ActiveSessionProps {
  // Session data
  duration: number;
  coherenceHistory: number[];
  currentCoherence: number;
  coherenceZone: 'quiet' | 'stabilizing' | 'noise';
  quietPowerActive: boolean;
  currentStreak: number;

  // Muse state
  museConnected: boolean;
  touching: boolean;

  // Audio
  entrainmentEnabled: boolean;
  onEntrainmentToggle: () => void;
  isRewardPlaying: boolean;

  // Controls
  onEndSession: () => void;
}

export function ActiveSession({
  duration,
  coherenceHistory,
  currentCoherence,
  coherenceZone,
  quietPowerActive,
  currentStreak,
  museConnected,
  touching,
  entrainmentEnabled,
  onEntrainmentToggle,
  isRewardPlaying,
  onEndSession,
}: ActiveSessionProps) {
  // Format time display
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      className="screen active-session"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <header className="session-header">
        <div className="header-left">
          <span className="muse-logo">muse</span>
        </div>
        <div className="header-right">
          <div className={`status-dot ${museConnected && touching ? 'active' : 'warning'}`} />
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" className="icon">
            <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
          </svg>
          <span className="timer">{formatTime(duration)}</span>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" className="icon">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
          </svg>
        </div>
      </header>

      {/* Main Content - Coherence Graph */}
      <main className="session-main">
        <CoherenceGraph
          coherenceHistory={coherenceHistory}
          currentCoherence={currentCoherence}
          coherenceZone={coherenceZone}
          duration={duration}
          isActive={true}
        />

        {/* Quiet Power Indicator */}
        {quietPowerActive && (
          <motion.div
            className="quiet-power-indicator"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <div className="qp-glow" />
            <span className="qp-text">Quiet Power</span>
            <span className="qp-streak">{formatTime(currentStreak)}</span>
          </motion.div>
        )}

        {/* Reward Playing Indicator */}
        {isRewardPlaying && (
          <motion.div
            className="reward-indicator"
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </motion.div>
        )}

        {/* Connection Warning */}
        {(!museConnected || !touching) && (
          <div className="connection-warning">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>
              {!museConnected
                ? 'Connection lost - reconnect Muse'
                : 'Adjust headband position'}
            </span>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="session-footer">
        <motion.button
          className="btn btn-primary btn-large"
          onClick={onEndSession}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          End Session
        </motion.button>

        <button
          className={`btn btn-icon guidance-toggle ${entrainmentEnabled ? 'active' : ''}`}
          onClick={onEntrainmentToggle}
          title="Toggle Guidance Audio"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            {entrainmentEnabled ? (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            ) : (
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            )}
          </svg>
          <span className="btn-label">Guidance Audio</span>
        </button>
      </footer>
    </motion.div>
  );
}
