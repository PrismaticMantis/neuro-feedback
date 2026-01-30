// Electrode Status Component - Shows individual electrode contact quality

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

const QUALITY_COLORS: Record<ElectrodeQuality, string> = {
  good: 'var(--accent-primary)', /* Champagne */
  medium: 'var(--warning)',
  poor: 'var(--error)',
  off: 'var(--text-subtle)',
};

function getOverallStatus(status: ElectrodeStatusType): { label: string; quality: ElectrodeQuality } {
  const qualities = [status.tp9, status.af7, status.af8, status.tp10];
  const goodCount = qualities.filter(q => q === 'good').length;
  const offCount = qualities.filter(q => q === 'off').length;
  
  if (goodCount === 4) {
    return { label: 'Good contact', quality: 'good' };
  } else if (offCount >= 3) {
    return { label: 'No contact', quality: 'off' };
  } else if (goodCount >= 2) {
    return { label: 'Partial contact', quality: 'medium' };
  } else {
    return { label: 'Adjust headband', quality: 'poor' };
  }
}

export function ElectrodeStatus({ status, compact = false }: ElectrodeStatusProps) {
  const overall = getOverallStatus(status);
  const electrodes = ['tp9', 'af7', 'af8', 'tp10'] as const;

  return (
    <div className={`electrode-status ${compact ? 'compact' : ''}`}>
      <div className="electrode-header">
        <span className="electrode-title">ELECTRODE CONTACT</span>
        <motion.span 
          className="electrode-badge"
          style={{ 
            backgroundColor: `${QUALITY_COLORS[overall.quality]}20`,
            borderColor: QUALITY_COLORS[overall.quality],
            color: QUALITY_COLORS[overall.quality]
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          key={overall.label}
        >
          {overall.label}
        </motion.span>
      </div>
      
      <div className="electrode-grid">
        {electrodes.map((electrode) => {
          const quality = status[electrode];
          const color = QUALITY_COLORS[quality];
          
          return (
            <div key={electrode} className="electrode-item">
              <motion.div 
                className="electrode-dot"
                style={{ backgroundColor: color }}
                animate={quality === 'good' ? {
                  boxShadow: [
                    `0 0 8px ${color}`,
                    `0 0 16px ${color}`,
                    `0 0 8px ${color}`,
                  ]
                } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="electrode-label">{ELECTRODE_LABELS[electrode]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
