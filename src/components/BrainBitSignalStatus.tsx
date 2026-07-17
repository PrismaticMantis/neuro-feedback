/**
 * BrainBit-only status panel — Connected / Preparing / Stream health / Overall usable signal.
 * Does not imply Muse-style independent electrode contact from signal-only EEG.
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { BrainBitStreamHealthSnapshot } from '../lib/eeg/brainbit-stream-health';
import type { BrainBitChannelActivitySnapshot } from '../lib/eeg/brainbit-bridge-eeg-device';
import {
  brainBitDisplaySignalQuality01,
  brainBitOverallSignalLabel,
  brainBitStreamBannerMessage,
  brainBitStreamIsUsable,
  brainBitStreamStateLabel,
} from '../lib/eeg/brainbit-stream-health';

interface BrainBitSignalStatusProps {
  bluetoothConnected: boolean;
  deviceName: string | null;
  streamHealth: BrainBitStreamHealthSnapshot | null;
  /** Per-channel activity — refines the "Overall signal" wording when only some channels are active. */
  channelActivity?: BrainBitChannelActivitySnapshot | null;
  /** Setup-only resistance measurement is active; EEG is intentionally paused. */
  contactProbeActive?: boolean;
  compact?: boolean;
}

function rowDot(color: string, pulse = false) {
  return (
    <motion.span
      animate={pulse ? { opacity: [0.45, 1, 0.45] } : { opacity: 1 }}
      transition={pulse ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function streamDotColor(state: BrainBitStreamHealthSnapshot['streamState']): string {
  switch (state) {
    case 'healthy':
      return '#22c55e';
    case 'degraded':
      return '#f59e0b';
    case 'recovering':
      return '#60a5fa';
    case 'waiting':
      return '#c9a227';
    default:
      return 'hsl(270 10% 40%)';
  }
}

function overallDotColor(
  tone: 'good' | 'medium' | 'poor',
  streamUsable: boolean,
): string {
  if (streamUsable && tone !== 'poor') {
    return tone === 'good' ? '#22c55e' : '#f59e0b';
  }
  if (streamUsable && tone === 'poor') return '#f59e0b';
  return '#94a3b8';
}

export function BrainBitSignalStatus({
  bluetoothConnected,
  deviceName,
  streamHealth,
  channelActivity = null,
  contactProbeActive = false,
  compact = false,
}: BrainBitSignalStatusProps) {
  const banner = contactProbeActive
    ? 'Measuring electrode contact. EEG begins after setup is complete.'
    : streamHealth
      ? brainBitStreamBannerMessage(streamHealth)
      : null;
  const streamUsable = streamHealth ? brainBitStreamIsUsable(streamHealth) : false;
  const displayQuality = streamHealth ? brainBitDisplaySignalQuality01(streamHealth) : 0;
  const overall = streamHealth
    ? brainBitOverallSignalLabel(displayQuality)
    : { label: '—', tone: 'poor' as const };
  const overallColor = overallDotColor(overall.tone, streamUsable);

  // When the stream is usable but only some channels carry data, say so explicitly
  // rather than a bare "Usable" — keeps facilitators informed but calm.
  const partialChannels =
    streamUsable && channelActivity && channelActivity.overallState === 'partial';
  const signalContactUnverified =
    channelActivity?.source === 'signal' && channelActivity.verificationState !== 'verified';
  const overallSignalValue = contactProbeActive
    ? channelActivity?.overallState === 'full'
      ? 'Contact detected on all channels'
      : channelActivity?.overallState === 'partial'
        ? `Partial contact — ${channelActivity.activeCount}/${channelActivity.totalCount}`
        : 'No valid electrode contact detected'
    : signalContactUnverified
      ? channelActivity?.verificationState === 'rejected'
        ? 'EEG streaming; physical contact unverified'
        : 'EEG streaming; checking independent contact signal'
    : !streamHealth
    ? '—'
    : partialChannels
      ? `Partial — ${channelActivity!.activeCount}/${channelActivity!.totalCount} channels on head or weak`
      : streamUsable && channelActivity && channelActivity.overallState === 'none'
        ? 'Stream healthy, headphones look off head'
        : `${overall.label}${streamUsable ? '' : ' (waiting)'}`;
  const preparing =
    !contactProbeActive &&
    bluetoothConnected &&
    streamHealth &&
    (streamHealth.streamState === 'waiting' || streamHealth.streamState === 'recovering');

  const rows = [
    {
      key: 'connected',
      label: 'Connected',
      value: bluetoothConnected ? (deviceName ?? 'Headphones') : 'Not connected',
      dot: bluetoothConnected ? '#22c55e' : 'hsl(270 10% 40%)',
      pulse: false,
    },
    {
      key: 'stream',
      label: contactProbeActive ? 'Contact probe' : 'EEG stream',
      value: contactProbeActive
        ? 'Measuring resistance'
        : streamHealth
          ? brainBitStreamStateLabel(streamHealth.streamState)
          : preparing
            ? 'Preparing…'
            : '—',
      dot: contactProbeActive
        ? '#60a5fa'
        : streamHealth
          ? streamDotColor(streamHealth.streamState)
          : 'hsl(270 10% 40%)',
      pulse: Boolean(preparing || contactProbeActive),
    },
    {
      key: 'quality',
      label: contactProbeActive ? 'Contact result' : 'Overall signal',
      value: overallSignalValue,
      dot: overallColor,
      pulse: false,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
      <AnimatePresence mode="wait">
        {banner && !compact && (
          <motion.div
            key={banner.slice(0, 48)}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background:
                contactProbeActive || streamHealth?.streamState === 'waiting' || streamHealth?.streamState === 'recovering'
                  ? 'hsl(210 40% 14% / 0.55)'
                  : 'hsl(35 60% 14% / 0.55)',
              border:
                contactProbeActive || streamHealth?.streamState === 'waiting' || streamHealth?.streamState === 'recovering'
                  ? '1px solid hsl(210 40% 32% / 0.45)'
                  : '1px solid hsl(35 50% 32% / 0.45)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              lineHeight: 1.45,
              color:
                contactProbeActive || streamHealth?.streamState === 'waiting' || streamHealth?.streamState === 'recovering'
                  ? 'hsl(210 90% 82%)'
                  : 'hsl(40 90% 78%)',
            }}
          >
            {banner}
          </motion.div>
        )}
      </AnimatePresence>

      {preparing && !compact && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '2px solid hsl(45 55% 55% / 0.25)',
              borderTopColor: '#c9a227',
              flexShrink: 0,
            }}
          />
          Preparing EEG stream — scan, connect, and first chunks usually take a few seconds.
        </motion.div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 6 : 8,
        }}
      >
        {rows.map((row) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--font-sans)',
              fontSize: compact ? '11px' : '12px',
            }}
          >
            {rowDot(row.dot, row.pulse)}
            <span style={{ color: 'var(--text-muted)', minWidth: compact ? 72 : 88 }}>{row.label}</span>
            <span
              style={{
                color: 'var(--text-primary)',
                fontWeight: 500,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {!compact && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            lineHeight: 1.45,
            color: 'var(--text-subtle)',
          }}
        >
          {contactProbeActive
            ? 'Resistance contact check — invalid or zero readings fail closed as off head.'
            : 'Signal-only EEG — stream health above reflects usable data, not per-pad contact impedance.'}
        </p>
      )}
    </div>
  );
}
