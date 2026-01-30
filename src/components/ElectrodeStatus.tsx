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
  good: 'var(--success)',
  medium: 'var(--warning)',
  poor: 'var(--destructive)',
  off: 'var(--text-subtle)',
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

  return (
    <div className={`electrode-status ${compact ? 'compact' : ''} electrode-status-lovable`}>
      <div className="electrode-header-lovable">
        <span className="electrode-title-lovable">ELECTRODE CONTACT</span>
        <motion.span 
          className={`electrode-badge-lovable electrode-badge-lovable--${overall.quality}`}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          key={overall.label}
        >
          {overallPillLabel}
        </motion.span>
      </div>
      
      <div className="electrode-row-lovable">
        {electrodes.map((electrode, index) => {
          const quality = status[electrode];
          const color = QUALITY_COLORS[quality];
          
          return (
            <div key={electrode} className="electrode-item-lovable">
              <motion.div 
                key={`${electrode}-${quality}`}
                className="electrode-dot-lovable"
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
              <span className="electrode-label-lovable">{ELECTRODE_LABELS[electrode]}</span>
              {index < electrodes.length - 1 && <span className="electrode-divider-lovable" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
