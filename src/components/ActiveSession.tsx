// Active Session Screen Component - Match Lovable "5 - Session" design

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CoherenceGraph } from './CoherenceGraph';
import { ElectrodeStatus } from './ElectrodeStatus';
import { DEBUG_SESSION_TELEMETRY } from '../lib/feature-flags';
import { museHandler } from '../lib/muse-handler';
import { getJourneys, getLastJourneyId } from '../lib/session-storage';
import { useSession } from '../hooks/useSession';
import type { ElectrodeStatus as ElectrodeStatusType, BrainwaveBands, BrainwaveBandsDb } from '../types';

interface ActiveSessionProps {
  // Session data
  duration: number;
  coherenceHistory: number[];
  coherenceZone: 'flow' | 'stabilizing' | 'noise';

  // Muse state
  museConnected: boolean;
  touching: boolean;
  electrodeStatus: ElectrodeStatusType;
  bands: BrainwaveBands;
  bandsDb: BrainwaveBandsDb;
  batteryLevel: number;

  // Audio
  entrainmentEnabled: boolean;
  onEntrainmentToggle: () => void;

  // Controls
  onEndSession: () => void;
}

export function ActiveSession({
  duration,
  coherenceHistory,
  coherenceZone,
  museConnected,
  touching,
  electrodeStatus,
  bands: _bands, // Keep for potential future use
  bandsDb,
  batteryLevel,
  entrainmentEnabled,
  onEntrainmentToggle,
  onEndSession,
}: ActiveSessionProps) {
  void _bands; // Silence unused warning
  
  // Debug: Track update timestamps
  const [debugInfo, setDebugInfo] = useState<{
    lastUpdate: number;
    lastHistoryAppend: number;
    historyLength: number;
  }>({ lastUpdate: 0, lastHistoryAppend: 0, historyLength: 0 });

  const prevHistoryLengthRef = useRef(coherenceHistory.length);
  const lastHistoryAppendTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!DEBUG_SESSION_TELEMETRY) return;
    
    // Track when history changes
    if (coherenceHistory.length !== prevHistoryLengthRef.current) {
      lastHistoryAppendTimeRef.current = Date.now();
      prevHistoryLengthRef.current = coherenceHistory.length;
    }

    const interval = setInterval(() => {
      const handlerDetail = museHandler.getConnectionStateDetail();
      const now = Date.now();
      setDebugInfo({
        lastUpdate: handlerDetail.timeSinceLastUpdate,
        lastHistoryAppend: lastHistoryAppendTimeRef.current > 0 ? now - lastHistoryAppendTimeRef.current : 999999,
        historyLength: coherenceHistory.length,
      });
    }, 200);
    return () => clearInterval(interval);
  }, [coherenceHistory.length]);

  // Get journey info
  const sessionHook = useSession();
  const journeyId = useMemo(() => {
    if (sessionHook.currentUser) {
      return getLastJourneyId(sessionHook.currentUser.id);
    }
    return 'creativeFlow';
  }, [sessionHook.currentUser]);
  const journeys = getJourneys();
  const journey = journeys.find(j => j.id === journeyId) || journeys[0];

  // Format time display
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate time remaining based on journey duration
  const journeyDurations: Record<string, number> = {
    calm: 15,
    deepRest: 25,
    creativeFlow: 20,
    nightWindDown: 30,
  };
  const journeyMinutes = journeyDurations[journeyId] || 20;
  const journeyDurationMs = journeyMinutes * 60 * 1000;
  const timeRemaining = Math.max(0, journeyDurationMs - duration);
  const timeRemainingFormatted = formatTime(timeRemaining);

  return (
    <motion.div
      className="screen active-session"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Top Bar - Simplified */}
      <header className="session-header-lovable">
        <div className="session-header-left">
          <span className="muse-logo-lovable">muse</span>
          {batteryLevel >= 0 && (
            <span className={`battery-indicator-lovable ${batteryLevel <= 25 ? 'low' : ''}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
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
              <span className="battery-text-lovable">{batteryLevel}%</span>
            </span>
          )}
        </div>
        <div className="session-header-right">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" className="header-icon">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
          <div className={`status-dot-lovable ${museConnected && touching ? 'active' : 'warning'}`} />
        </div>
      </header>

      {/* Debug Overlay (when enabled) */}
      {DEBUG_SESSION_TELEMETRY && (
        <div className="debug-overlay" style={{ position: 'fixed', top: 80, right: 20, zIndex: 1000, maxWidth: '300px' }}>
          <h3 style={{ color: 'var(--accent-primary)', marginBottom: 12, fontSize: '14px' }}>🔍 Session Debug</h3>
          <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 }}>
            <div>museConnected: {String(museConnected)}</div>
            <div>touching: {String(touching)}</div>
            <div>lastUpdate: {debugInfo.lastUpdate}ms ago</div>
            <div>raw horseshoe: [{museHandler.getElectrodeQuality().join(', ')}]</div>
            <div>electrodeStatus: {JSON.stringify(electrodeStatus)}</div>
            <div>bandsDb: δ={bandsDb.delta.toFixed(0)} θ={bandsDb.theta.toFixed(0)} α={bandsDb.alpha.toFixed(0)} β={bandsDb.beta.toFixed(0)} γ={bandsDb.gamma.toFixed(0)}</div>
            <div>coherenceHistory: {coherenceHistory.length} points</div>
            <div>lastHistoryAppend: {debugInfo.lastHistoryAppend > 5000 ? 'stale' : `${Math.round(debugInfo.lastHistoryAppend)}ms ago`}</div>
            <div>coherenceZone: {coherenceZone}</div>
            <div>latest coherence: {coherenceHistory.length > 0 ? coherenceHistory[coherenceHistory.length - 1].toFixed(3) : 'none'}</div>
          </div>
        </div>
      )}

      {/* Top Cards Row - Electrode Contact & Mental State */}
      <div className="session-top-cards">
        {/* Electrode Contact Card */}
        <div className="session-card electrode-contact-card">
          <ElectrodeStatus status={electrodeStatus} compact />
          
          {/* Band Power / Greeks Row */}
          <div className="session-greeks-row">
            {(['delta', 'theta', 'alpha', 'beta', 'gamma'] as const).map((band, index) => {
              const dbVal = bandsDb[band];
              const symbol = { delta: 'δ', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ' }[band];
              
              return (
                <div key={band} className="session-greek-item">
                  <span className="session-greek-symbol">{symbol}</span>
                  <span className="session-greek-value">{dbVal.toFixed(0)}</span>
                  {index < 4 && <span className="session-greek-divider" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mental State Card */}
        <div className="session-card mental-state-card">
          <h3 className="session-card-title">MENTAL STATE</h3>
          <div className="mental-state-list">
            <div className={`mental-state-item ${coherenceZone === 'flow' ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <span>Coherence</span>
            </div>
            <div className={`mental-state-item ${coherenceZone === 'stabilizing' ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M17.66 8L12 2.35 6.34 8C4.78 9.56 4 11.64 4 13.64s.78 4.11 2.34 5.67 3.61 2.35 5.66 2.35 4.1-.79 5.66-2.35S20 15.64 20 13.64 19.22 9.56 17.66 8zM6 14c.01-2 .62-3.27 1.76-4.4L12 5.27l4.24 4.38C17.38 10.77 17.99 12 18 14H6z" />
              </svg>
              <span>Settling In</span>
            </div>
            <div className={`mental-state-item ${coherenceZone === 'noise' ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M7 2v11h3v9l7-12h-4l4-8z" />
              </svg>
              <span>Active Mind</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Journey Card */}
      <div className="session-journey-card">
        <svg className="journey-card-icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
        </svg>
        <div className="journey-card-content">
          <h4 className="journey-card-title">{journey.name}</h4>
          <p className="journey-card-subtitle">{journey.description}</p>
        </div>
        <div className="journey-card-duration">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span>{journeyMinutes} min</span>
        </div>
      </div>

      {/* Session Timer - Central */}
      <div className="session-timer-central">
        <div className="session-timer-circle">
          <motion.span 
            className="session-timer-elapsed"
            key={formatTime(duration)}
            initial={{ scale: 1.05 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {formatTime(duration)}
          </motion.span>
          <span className="session-timer-label">elapsed</span>
        </div>
        <div className="session-timer-remaining">
          <span className="session-timer-remaining-label">Time Remaining</span>
          <span className="session-timer-remaining-value">{timeRemainingFormatted}</span>
        </div>
      </div>

      {/* Main Content - Coherence Graph Card */}
      <main className="session-main-lovable">
        <div className="session-chart-card">
          <CoherenceGraph
            coherenceHistory={coherenceHistory}
            coherenceZone={coherenceZone}
            duration={duration}
          />
        </div>

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

      {/* Footer - CTA Buttons */}
      <footer className="session-footer-lovable">
        <motion.button
          className="btn btn-primary btn-large session-end-btn"
          onClick={onEndSession}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          End Session
        </motion.button>

        <button
          className={`session-guidance-btn ${entrainmentEnabled ? 'active' : ''}`}
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
        </button>
      </footer>
    </motion.div>
  );
}
