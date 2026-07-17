// BrainBit per-channel EEG activity diagnostics (A1 / C3 / C4 / A2).
// Honest contact readout from signal heuristics — not SDK impedance.
// Flat ≈ off head; usable ≈ weak/quiet on-head; active ≈ good cortical contact.

import { motion } from 'framer-motion';
import type {
  BrainBitChannelActivitySnapshot,
  BrainBitChannelState,
} from '../lib/eeg/brainbit-bridge-eeg-device';
import { countBrainBitChannelBuckets } from '../lib/eeg/brainbit-channel-state';

interface BrainBitChannelActivityProps {
  activity: BrainBitChannelActivitySnapshot | null;
  compact?: boolean;
}

const STATE_META: Record<
  BrainBitChannelState,
  { color: string; label: string; pulse: boolean }
> = {
  active: { color: '#22c55e', label: 'On head', pulse: true },
  // Amber — weak/quiet must not read as “good green”
  usable: { color: '#f59e0b', label: 'Weak', pulse: false },
  stale: { color: '#f59e0b', label: 'Stale', pulse: false },
  low: { color: '#f59e0b', label: 'Noisy', pulse: false },
  flat: { color: 'hsl(270 10% 45%)', label: 'Off head', pulse: false },
  stuck: { color: '#ef4444', label: 'Stuck 0.4V', pulse: false },
};

function summaryText(activity: BrainBitChannelActivitySnapshot): string {
  const { totalCount, overallState, channels } = activity;
  if (overallState === 'idle') return 'Waiting for channel data…';
  if (activity.source === 'signal' && activity.verificationState !== 'verified') {
    return activity.verificationState === 'rejected'
      ? `Contact not verified — ${activity.verificationReason ?? 'channels are not independently active'}`
      : `Checking independent channel signal — ${activity.verificationReason ?? 'hold still'}`;
  }

  const { active, usable, stale } = countBrainBitChannelBuckets(channels);
  const stuckLabels = channels.filter((c) => c.state === 'stuck').map((c) => c.label);
  const offHead = channels.filter((c) => c.state === 'flat').length;
  const noisy = channels.filter((c) => c.state === 'low').length;

  if (offHead === totalCount) {
    return 'Headphones look off your head — all channels flat';
  }
  if (active === totalCount) {
    return `All ${totalCount} channels on head`;
  }

  const parts: string[] = [];
  if (active > 0) parts.push(`${active} on head`);
  if (usable > 0) parts.push(`${usable} weak`);
  if (stale > 0) parts.push(`${stale} stale`);
  if (noisy > 0) parts.push(`${noisy} noisy`);
  if (offHead > 0) parts.push(`${offHead} off head`);
  let base = parts.length > 0 ? parts.join(' · ') : `${active} of ${totalCount} on head`;
  if (stuckLabels.length > 0) {
    base = `${base} · ${stuckLabels.join(', ')} stuck at 0.4 V`;
  }
  return base;
}

function headerCount(activity: BrainBitChannelActivitySnapshot): string {
  if (activity.overallState === 'idle') return '—';
  if (activity.source === 'signal' && activity.verificationState !== 'verified') {
    return activity.verificationState === 'rejected' ? 'Unverified' : 'Settling';
  }
  const { active, usable } = countBrainBitChannelBuckets(activity.channels);
  if (usable > 0) return `${active} on head · ${usable} weak`;
  return `${active}/${activity.totalCount} on head`;
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
          Headset contact
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
            {headerCount(activity)}
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
          const signalUnverified =
            activity?.source === 'signal' && activity.verificationState !== 'verified';
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
                {signalUnverified ? 'Unverified' : meta.label}
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
        {activity?.source === 'resistance'
          ? 'Native resistance contact. Zero, invalid, or open readings are off head.'
          : activity?.verificationState === 'verified'
            ? 'Signal-only contact estimate from sustained independent C3/C4 activity; not impedance.'
            : 'Signal-only contact is fail-closed until independent C3/C4 activity stays stable.'}
      </p>
    </div>
  );
}
