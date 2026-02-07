// UI reference: design/targets/5 - Session.png
// Design tokens: docs/design-specification.md
// - Card (Glass): background linear-gradient with blur, 12px border-radius
// - Typography: Inter font family, various weights
// - Colors: #D9C478 (accent gold), various HSL backgrounds

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CoherenceGraph } from './CoherenceGraph';
import { ElectrodeStatus } from './ElectrodeStatus';
import { DEBUG_SESSION_TELEMETRY } from '../lib/feature-flags';
import { museHandler } from '../lib/muse-handler';
import { getJourneys, getLastJourneyId } from '../lib/session-storage';
import { useSession } from '../hooks/useSession';
import type { ElectrodeStatus as ElectrodeStatusType, BrainwaveBands, BrainwaveBandsDb, ConnectionHealthState } from '../types';

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
  connectionHealthState?: ConnectionHealthState; // Connection health for UI display

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
  connectionHealthState = 'healthy', // Default to healthy for backward compat
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
      style={{
        padding: '0 24px 16px',
        maxWidth: '900px',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {/* Ambient glow removed - global body::before provides the static background haze */}
      
      {/* Top Bar - Target 5: muse logo + battery left, headphone icon + status right */}
      <header 
        className="session-header-lovable"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0 6px',
        }}
      >
        <div 
          className="session-header-left"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span 
            className="muse-logo-lovable"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            muse
          </span>
          {batteryLevel >= 0 && (
            <span 
              className={`battery-indicator-lovable ${batteryLevel <= 25 ? 'low' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'hsl(270 10% 18% / 0.6)',
                borderRadius: '12px',
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ color: batteryLevel <= 25 ? '#ef4444' : '#22c55e' }}>
                <rect x="6" y="7" width="12" height="10" rx="1" stroke="currentColor" fill="none" strokeWidth="1.5" />
                <rect x="18" y="10" width="2" height="4" fill="currentColor" />
                <rect x="7.5" y="8.5" width={`${Math.min(batteryLevel / 100 * 9, 9)}`} height="7" fill="currentColor" rx="0.5" />
              </svg>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-muted)',
              }}>{batteryLevel}%</span>
            </span>
          )}
        </div>
        <div 
          className="session-header-right"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div 
            className={`status-dot-lovable ${museConnected && touching ? 'active' : 'warning'}`}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: museConnected && touching ? '#22c55e' : '#f59e0b',
              boxShadow: museConnected && touching ? '0 0 8px #22c55e' : '0 0 8px #f59e0b',
            }}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" style={{ color: 'var(--text-muted)' }}>
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
        </div>
      </header>

      {/* Debug Overlay (when enabled) */}
      {DEBUG_SESSION_TELEMETRY && (
        <div className="debug-overlay" style={{ position: 'fixed', top: 80, right: 20, zIndex: 1000, maxWidth: '320px' }}>
          <h3 style={{ color: 'var(--accent-primary)', marginBottom: 12, fontSize: '14px' }}>🔍 Session Debug</h3>
          <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 'bold', color: connectionHealthState === 'healthy' ? '#22c55e' : connectionHealthState === 'reconnecting' ? '#3b82f6' : connectionHealthState === 'stalled' ? '#facc15' : '#ef4444' }}>
              healthState: {connectionHealthState}
            </div>
            <div>museConnected: {String(museConnected)}</div>
            <div>bleTransport: {String(museHandler.bleTransportConnected)}</div>
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
      <div 
        className="session-top-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          marginBottom: '8px',
        }}
      >
        {/* Electrode Contact Card - Target 5: Shows electrode status + band powers */}
        <div 
          className="session-card electrode-contact-card"
          style={{
            background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
            border: '1px solid hsl(270 10% 25% / 0.3)',
            borderRadius: '12px',
            padding: '14px',
            backdropFilter: 'blur(20px)',
          }}
        >
          <ElectrodeStatus status={electrodeStatus} compact />
          
          {/* Band Power / Greeks Row */}
          <div 
            className="session-greeks-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '10px',
              marginTop: '10px',
              borderTop: '1px solid hsl(270 10% 25% / 0.3)',
            }}
          >
            {(['delta', 'theta', 'alpha', 'beta', 'gamma'] as const).map((band) => {
              const dbVal = bandsDb[band];
              const symbol = { delta: 'δ', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ' }[band];
              
              return (
                <div 
                  key={band} 
                  className="session-greek-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span 
                    className="session-greek-symbol"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 400,
                      color: 'var(--text-muted)',
                    }}
                  >{symbol}</span>
                  <span 
                    className="session-greek-value"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}
                  >{dbVal.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mental State Card - Target 5: Coherence, Settling In, Active Mind tabs */}
        <div 
          className="session-card mental-state-card"
          style={{
            background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
            border: '1px solid hsl(270 10% 25% / 0.3)',
            borderRadius: '12px',
            padding: '14px',
            backdropFilter: 'blur(20px)',
          }}
        >
          <h3 
            className="session-card-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              margin: '0 0 8px',
            }}
          >MENTAL STATE</h3>
          <div 
            className="mental-state-list"
            style={{
              display: 'flex',
              gap: '8px',
            }}
          >
            {/* Coherence Button - Lovable: muted accent when active, subtle distinction */}
            <button 
              className={`mental-state-item ${coherenceZone === 'flow' ? 'active' : ''}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 8px',
                background: coherenceZone === 'flow' 
                  ? 'hsl(270 10% 20% / 0.6)'
                  : 'transparent',
                border: coherenceZone === 'flow' 
                  ? '1px solid hsl(45 30% 55% / 0.25)'
                  : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'default',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color: coherenceZone === 'flow' ? 'hsl(45 35% 72%)' : 'var(--text-subtle)' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 500,
                color: coherenceZone === 'flow' ? 'hsl(45 30% 75%)' : 'var(--text-subtle)',
              }}>Coherence</span>
            </button>
            
            {/* Settling In Button */}
            <button 
              className={`mental-state-item ${coherenceZone === 'stabilizing' ? 'active' : ''}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 8px',
                background: coherenceZone === 'stabilizing' 
                  ? 'hsl(270 10% 20% / 0.6)'
                  : 'transparent',
                border: coherenceZone === 'stabilizing' 
                  ? '1px solid hsl(275 25% 50% / 0.25)'
                  : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'default',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color: coherenceZone === 'stabilizing' ? 'hsl(275 25% 68%)' : 'var(--text-subtle)' }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 500,
                color: coherenceZone === 'stabilizing' ? 'hsl(275 20% 72%)' : 'var(--text-subtle)',
              }}>Settling In</span>
            </button>
            
            {/* Active Mind Button */}
            <button 
              className={`mental-state-item ${coherenceZone === 'noise' ? 'active' : ''}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 8px',
                background: coherenceZone === 'noise' 
                  ? 'hsl(270 10% 20% / 0.6)'
                  : 'transparent',
                border: coherenceZone === 'noise' 
                  ? '1px solid hsl(270 12% 45% / 0.25)'
                  : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'default',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color: coherenceZone === 'noise' ? 'hsl(270 10% 65%)' : 'var(--text-subtle)' }}>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 500,
                color: coherenceZone === 'noise' ? 'hsl(270 8% 68%)' : 'var(--text-subtle)',
              }}>Active Mind</span>
            </button>
          </div>
        </div>
      </div>

      {/* Current Journey Card - Lovable: subtle glass card, muted tint, no harsh gold */}
      <div 
        className="session-journey-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, hsl(270 10% 16% / 0.7), hsl(270 10% 13% / 0.5))',
          border: '1px solid hsl(270 10% 25% / 0.3)',
          borderRadius: '12px',
          marginBottom: '8px',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Journey Icon Circle - muted accent tint */}
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'hsl(45 30% 45% / 0.2)',
            border: '1px solid hsl(45 30% 50% / 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" style={{ color: 'hsl(45 40% 70%)' }}>
            <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
          </svg>
        </div>
        
        <div className="journey-card-content" style={{ flex: 1 }}>
          <h4 
            className="journey-card-title"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >{journey.name}</h4>
          <p 
            className="journey-card-subtitle"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              margin: '2px 0 0',
              lineHeight: 1.4,
            }}
          >{journey.description}</p>
        </div>
        
        <div 
          className="journey-card-duration"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 500,
          }}>{journeyMinutes} min</span>
        </div>
      </div>

      {/* Session Timer - Central - Target 5: Circular timer with progress ring */}
      <div 
        className="session-timer-central"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          margin: '2px 0 8px',
        }}
      >
        {/* Circular Timer with Progress Ring - with breathing glow effect */}
        <motion.div 
          className="session-timer-circle breathe-element"
          style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          animate={{
            boxShadow: [
              '0 0 20px hsl(270 15% 35% / 0.2)',
              '0 0 35px hsl(270 15% 35% / 0.35)',
              '0 0 20px hsl(270 15% 35% / 0.2)',
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* SVG Progress Ring */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              transform: 'rotate(-90deg)',
            }}
            viewBox="0 0 120 120"
          >
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="hsl(270 10% 20%)"
              strokeWidth="4"
            />
            {/* Progress circle with glow filter */}
            <defs>
              <filter id="progress-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="hsl(270 15% 45%)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(duration / journeyDurationMs) * 339.3} 339.3`}
              filter="url(#progress-glow)"
            />
          </svg>
          
          {/* Timer Text */}
          <motion.span 
            className="session-timer-elapsed"
            key={formatTime(duration)}
            initial={{ scale: 1.02 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '0.02em',
              zIndex: 1,
            }}
          >
            {formatTime(duration)}
          </motion.span>
          <span 
            className="session-timer-label"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              zIndex: 1,
              marginTop: '2px',
            }}
          >elapsed</span>
        </motion.div>
        
        {/* Time Remaining Text */}
        <div 
          className="session-timer-remaining"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '6px',
          }}
        >
          <span 
            className="session-timer-remaining-label"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--text-muted)',
            }}
          >Time Remaining</span>
          <span 
            className="session-timer-remaining-value"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '18px',
              fontWeight: 600,
              color: '#D9C478',
              marginTop: '2px',
            }}
          >{timeRemainingFormatted}</span>
        </div>
      </div>

      {/* Main Content - Coherence Graph Card - Target 5: Large glass card with graph */}
      <main 
        className="session-main-lovable"
        style={{
          marginBottom: '10px',
        }}
      >
        <div 
          className="session-chart-card"
          style={{
            background: 'linear-gradient(135deg, hsl(270 10% 15% / 0.6), hsl(270 10% 12% / 0.4))',
            border: '1px solid hsl(270 10% 25% / 0.3)',
            borderRadius: '12px',
            padding: '16px',
            backdropFilter: 'blur(20px)',
            minHeight: '280px',
          }}
        >
          <CoherenceGraph
            coherenceHistory={coherenceHistory}
            coherenceZone={coherenceZone}
            duration={duration}
          />
        </div>

        {/* Connection Status Banners - shows different states based on connection health */}
        {/* CRITICAL: Don't show "disconnected" for brief stalls - only for confirmed disconnection */}
        {connectionHealthState === 'reconnecting' && (
          <motion.div 
            className="connection-warning reconnecting"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'hsl(220 80% 50% / 0.15)',
              border: '1px solid hsl(220 80% 50% / 0.3)',
              borderRadius: '8px',
              marginTop: '12px',
              color: '#3b82f6',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" className="spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Reconnecting... Session continues</span>
          </motion.div>
        )}
        {connectionHealthState === 'stalled' && (
          <motion.div 
            className="connection-warning stalled"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'hsl(45 100% 50% / 0.15)',
              border: '1px solid hsl(45 100% 50% / 0.3)',
              borderRadius: '8px',
              marginTop: '12px',
              color: '#facc15',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>Signal paused... Waiting</span>
          </motion.div>
        )}
        {connectionHealthState === 'disconnected' && !museConnected && (
          <motion.div 
            className="connection-warning disconnected"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'hsl(0 80% 50% / 0.15)',
              border: '1px solid hsl(0 80% 50% / 0.3)',
              borderRadius: '8px',
              marginTop: '12px',
              color: '#ef4444',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>Connection lost - reconnect Muse</span>
          </motion.div>
        )}
        {/* Headband position warning (only when connected but not touching) */}
        {museConnected && !touching && connectionHealthState === 'healthy' && (
          <div 
            className="connection-warning headband"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'hsl(35 100% 50% / 0.15)',
              border: '1px solid hsl(35 100% 50% / 0.3)',
              borderRadius: '8px',
              marginTop: '12px',
              color: '#f59e0b',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>Adjust headband position</span>
          </div>
        )}
      </main>

      {/* Footer - CTA Buttons - Target 5: Centered gold End Session + audio toggle */}
      <footer 
        className="session-footer-lovable"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          paddingBottom: '10px',
        }}
      >
        <motion.button
          className="btn btn-primary btn-large session-end-btn"
          onClick={onEndSession}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '14px 40px',
            background: 'linear-gradient(135deg, #D9C478, #C9B468)',
            color: '#0c0a0e',
            border: 'none',
            borderRadius: '999px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 4px 20px hsl(45 55% 70% / 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          End Session
        </motion.button>

        <button
          className={`session-guidance-btn ${entrainmentEnabled ? 'active' : ''}`}
          onClick={onEntrainmentToggle}
          title="Toggle Guidance Audio"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: entrainmentEnabled 
              ? 'hsl(270 10% 25%)'
              : 'hsl(270 10% 18%)',
            border: '1px solid hsl(270 10% 30%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: entrainmentEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
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
