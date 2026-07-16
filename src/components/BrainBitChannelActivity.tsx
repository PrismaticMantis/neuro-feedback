// BrainBit per-channel EEG activity diagnostics (A1 / C3 / C4 / A2).
// Channel ACTIVITY only — does usable data move on each channel — NOT pad
// contact or impedance truth (BrainBit signal-only reports no real impedance).

import { motion } from 'framer-motion';
import type {
  BrainBitChannelActivitySnapshot,
  BrainBitChannelState,
} from '../lib/eeg/brainbit-bridge-eeg-device';

interface BrainBitChannelActivityProps {
  activity: BrainBitChannelActivitySnapshot | null;
  compact?: boolean;
}

const STATE_META: Record<
  BrainBitChannelState,
  { color: string; label: string; pulse: boolean }
> = {
  active: { color: '#22c55e', label: 'Active', pulse: true },
  usable: { color: '#84cc16', label: 'Usable', pulse: false },
  stale: { color: '#f59e0b', label: 'Stale', pulse: false },
  low: { color: '#f59e0b', label: 'Low', pulse: false },
  flat: { color: 'hsl(270 10% 45%)', label: 'Flat', pulse: false },
  stuck: { color: '#ef4444', label: 'Stuck 0.4V', pulse: false },
};

function summaryText(activity: BrainBitChannelActivitySnapshot): string {
  const { activeCount, totalCount, overallState, channels } = activity;
  if (overallState === 'idle') return 'Waiting for channel data…';
  if (overallState === 'full') return `All ${totalCount} channels active`;
  const stuckLabels = channels.filter((c) => c.state === 'stuck').map((c) => c.label);
  const base = `${activeCount} of ${totalCount} channels active`;
  return stuckLabels.length > 0 ? `${base} · ${stuckLabels.join(', ')} stuck at 0.4 V` : base;
}

export function BrainBitChannelActivity({ activity, compact = false }: BrainBitChannelActivityProps) {
  const channels = activity?.channels ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          EEG channel activity
        </span>
        {activity && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-subtle)',
              whiteSpace: 'nowrap',
            }}
          >
            {activity.overallState === 'idle'
              ? '—'
              : `${activity.activeCount}/${activity.totalCount} active`}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        {channels.map((ch) => {
          const meta = STATE_META[ch.state];
          return (
            <div
              key={ch.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                minWidth: 0,
              }}
            >
              <motion.div
                key={ch.label}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: meta.color,
                }}
                animate={
                  meta.pulse
                    ? { boxShadow: [`0 0 6px ${meta.color}`, `0 0 12px ${meta.color}`, `0 0 6px ${meta.color}`] }
                    : {}
                }
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                {ch.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  fontWeight: 400,
                  color: meta.color,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      {activity && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            lineHeight: 1.45,
            color: 'var(--text-subtle)',
          }}
        >
          {summaryText(activity)}
        </p>
      )}

      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: '10px',
          lineHeight: 1.4,
          color: 'var(--text-subtle)',
          opacity: 0.8,
        }}
      >
        Channel activity only — not pad contact or impedance. Stream health above is the primary status.
      </p>
    </div>
  );
}
