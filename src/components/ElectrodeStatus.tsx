// Electrode Status Component - Shows individual electrode contact quality
// UI reference: design/targets/5 - Session.png
// Design tokens: docs/design-specification.md

import { motion } from 'framer-motion';
import type { ElectrodeStatus as ElectrodeStatusType, ElectrodeQuality } from '../types';

interface ElectrodeStatusProps {
  status: ElectrodeStatusType;
  compact?: boolean;
}

const ELECTRODE_LABELS = {
  tp9: 'TP9',
  af7: 'AF7',
  af8: 'AF8',
  tp10: 'TP10',
};

// Lovable design colors for electrode quality
const QUALITY_COLORS: Record<ElectrodeQuality, string> = {
  good: '#22c55e',   // Green
  medium: '#f59e0b', // Orange/amber
  poor: '#ef4444',   // Red
  off: 'hsl(270 10% 40%)', // Muted grey
};

/**
 * Overall signal quality from electrode states (matches connectionQuality logic exactly).
 * 3-4 good → Strong signal, 1-2 good → Partial signal, 0 good → Poor signal.
 */
function getOverallStatus(status: ElectrodeStatusType): { label: string; quality: ElectrodeQuality } {
  const qualities = [status.tp9, status.af7, status.af8, status.tp10];
  const goodCount = qualities.filter(q => q === 'good').length;

  if (goodCount >= 3) return { label: 'Strong signal', quality: 'good' };
  if (goodCount >= 1) return { label: 'Partial signal', quality: 'medium' };
  return { label: 'Poor signal', quality: 'off' };
}

export function ElectrodeStatus({ status, compact = false }: ElectrodeStatusProps) {
  const overall = getOverallStatus(status);
  const electrodes = ['tp9', 'af7', 'af8', 'tp10'] as const;

  // Map overall label to shorter version for pill
  const overallPillLabel = overall.label === 'Strong signal' ? 'Good' : 
                           overall.label === 'Partial signal' ? 'Partial' : 'Poor';

  // Calculate quality percentage based on good electrodes (0-100%)
  const goodCount = electrodes.filter(e => status[e] === 'good').length;
  const qualityPercentage = (goodCount / 4) * 100;

  // Badge colors based on quality
  const badgeStyles: Record<ElectrodeQuality, { bg: string; border: string; text: string }> = {
    good: { bg: 'hsl(145 60% 40% / 0.2)', border: 'hsl(145 60% 50% / 0.4)', text: '#22c55e' },
    medium: { bg: 'hsl(35 100% 50% / 0.15)', border: 'hsl(35 100% 50% / 0.3)', text: '#f59e0b' },
    poor: { bg: 'hsl(0 80% 50% / 0.15)', border: 'hsl(0 80% 50% / 0.3)', text: '#ef4444' },
    off: { bg: 'hsl(270 10% 25%)', border: 'hsl(270 10% 35%)', text: 'var(--text-muted)' },
  };
  const badgeStyle = badgeStyles[overall.quality];

  return (
    <div 
      className={`electrode-status ${compact ? 'compact' : ''} electrode-status-lovable`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '12px' : '16px',
      }}
    >
      {/* Header Row - Title + Badge */}
      <div 
        className="electrode-header-lovable"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span 
          className="electrode-title-lovable"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >ELECTRODE CONTACT</span>
        <motion.span 
          className={`electrode-badge-lovable electrode-badge-lovable--${overall.quality}`}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          key={overall.label}
          style={{
            padding: '4px 10px',
            background: badgeStyle.bg,
            border: `1px solid ${badgeStyle.border}`,
            borderRadius: '999px',
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 500,
            color: badgeStyle.text,
          }}
        >
          {overallPillLabel}
        </motion.span>
      </div>
      
      {/* Electrode Dots Row */}
      <div 
        className="electrode-row-lovable"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {electrodes.map((electrode) => {
          const quality = status[electrode];
          const color = QUALITY_COLORS[quality];
          
          return (
            <div 
              key={electrode} 
              className="electrode-item-lovable"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                flex: 1,
              }}
            >
              <motion.div 
                key={`${electrode}-${quality}`}
                className={`electrode-dot-lovable electrode-dot-lovable--${quality}`}
                style={{ 
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: color,
                }}
                animate={quality === 'good' ? {
                  boxShadow: [
                    `0 0 6px ${color}`,
                    `0 0 12px ${color}`,
                    `0 0 6px ${color}`,
                  ]
                } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span 
                className="electrode-label-lovable"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                }}
              >{ELECTRODE_LABELS[electrode]}</span>
            </div>
          );
        })}
      </div>

      {/* Quality Bar - only shown in non-compact mode */}
      {!compact && (
        <div 
          className="quality-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            paddingTop: '8px',
            borderTop: '1px solid hsl(270 10% 25% / 0.3)',
            marginTop: '4px',
          }}
        >
          <span 
            className="quality-label"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >Contact Quality</span>
          <div 
            className="quality-track"
            style={{
              flex: 1,
              height: '6px',
              background: 'hsl(270 10% 20%)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <motion.div
              className="quality-fill"
              style={{
                height: '100%',
                background: qualityPercentage >= 75 ? '#22c55e' : qualityPercentage >= 25 ? '#f59e0b' : '#ef4444',
                borderRadius: '3px',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${qualityPercentage}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span 
            className="quality-value"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              minWidth: '32px',
              textAlign: 'right',
            }}
          >{Math.round(qualityPercentage)}%</span>
        </div>
      )}
    </div>
  );
}
