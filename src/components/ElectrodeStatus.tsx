// Electrode Status Component - Shows individual electrode contact quality
// UI reference: design/targets/5 - Session.png
// Renders from `electrodeSites` when provided (device-agnostic); falls back to legacy 4-key Muse `status`.

import { motion } from 'framer-motion';
import type { ElectrodeStatus as ElectrodeStatusType, ElectrodeQuality, ElectrodeSiteContact } from '../types';
import {
  overallContactSummaryFromLegacyStatus,
  overallContactSummaryFromSites,
} from '../lib/eeg/contact-quality';

interface ElectrodeStatusProps {
  /** Preferred: ordered sites from the active EEG device (labels + quality). */
  sites?: ElectrodeSiteContact[];
  /** Fallback when `sites` is empty: Muse 10–20 four-key map (TP9, AF7, AF8, TP10). */
  status: ElectrodeStatusType;
  compact?: boolean;
  /** Override header (e.g. Athena bridge estimate). Default: ELECTRODE CONTACT */
  sectionTitle?: string;
  /** Bar label (default: Contact Quality). */
  qualityBarLabel?: string;
  /**
   * When true, % = weighted good/medium/poor. When false (default), only “good” electrodes count — Muse 2 behavior.
   */
  weightedContactPercent?: boolean;
}

const LEGACY_KEYS = ['tp9', 'af7', 'af8', 'tp10'] as const;

const ELECTRODE_LABELS: Record<(typeof LEGACY_KEYS)[number], string> = {
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

type Row = { key: string; label: string; quality: ElectrodeQuality };

function siteWeightedPercent(sites: ElectrodeSiteContact[]): number {
  const score = sites.reduce((acc, s) => {
    if (s.quality === 'good') return acc + 1;
    if (s.quality === 'medium') return acc + 0.55;
    if (s.quality === 'poor') return acc + 0.2;
    return acc;
  }, 0);
  return (score / sites.length) * 100;
}

function buildRenderModel(
  sites: ElectrodeSiteContact[] | undefined,
  status: ElectrodeStatusType,
  weightedContactPercent: boolean,
): { rows: Row[]; overall: { label: string; quality: ElectrodeQuality }; qualityPercentage: number } {
  if (sites && sites.length > 0) {
    const overall = overallContactSummaryFromSites(sites);
    const goodCount = sites.filter((s) => s.quality === 'good').length;
    const qualityPercentage = weightedContactPercent
      ? siteWeightedPercent(sites)
      : (goodCount / sites.length) * 100;
    const rows: Row[] = sites.map((s) => ({
      key: s.siteId,
      label: s.label,
      quality: s.quality,
    }));
    return { rows, overall, qualityPercentage };
  }

  const overall = overallContactSummaryFromLegacyStatus(status);
  const goodCount = LEGACY_KEYS.filter((k) => status[k] === 'good').length;
  const qualityPercentage = (goodCount / 4) * 100;
  const rows: Row[] = LEGACY_KEYS.map((k) => ({
    key: k,
    label: ELECTRODE_LABELS[k],
    quality: status[k],
  }));
  return { rows, overall, qualityPercentage };
}

export function ElectrodeStatus({
  sites,
  status,
  compact = false,
  sectionTitle = 'ELECTRODE CONTACT',
  qualityBarLabel = 'Contact Quality',
  weightedContactPercent = false,
}: ElectrodeStatusProps) {
  const { rows, overall, qualityPercentage } = buildRenderModel(sites, status, weightedContactPercent);

  // Map overall label to shorter version for pill
  const overallPillLabel = overall.label === 'Strong signal' ? 'Good' : 
                           overall.label === 'Partial signal' ? 'Partial' : 'Poor';

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
        >{sectionTitle}</span>
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
          flexWrap: rows.length > 4 ? 'wrap' : 'nowrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: rows.length > 4 ? '10px' : undefined,
        }}
      >
        {rows.map((row) => {
          const quality = row.quality;
          const color = QUALITY_COLORS[quality];
          
          return (
            <div 
              key={row.key} 
              className="electrode-item-lovable"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                flex: rows.length > 4 ? '1 1 36px' : 1,
                minWidth: rows.length > 4 ? '36px' : undefined,
              }}
            >
              <motion.div 
                key={`${row.key}-${quality}`}
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
              >{row.label}</span>
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
          >{qualityBarLabel}</span>
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
