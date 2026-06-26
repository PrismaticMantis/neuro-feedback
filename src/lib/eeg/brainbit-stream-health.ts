/**
 * BrainBit Headphones — stream / frame health (signal-only EEG path).
 * Separates transport, stream integrity, and overall activity from per-channel horseshoe heuristics.
 */

import type { ConnectionHealthState } from '../../types';

export type BrainBitFrameQuality = 'valid' | 'mixed' | 'sentinel' | 'stale' | 'unknown';

/** EEG stream integrity — distinct from BLE/WS connected and from per-channel activity dots. */
export type BrainBitStreamState = 'healthy' | 'recovering' | 'degraded' | 'waiting' | 'offline';

export type BrainBitStreamHealthSnapshot = {
  frameQuality: BrainBitFrameQuality;
  streamState: BrainBitStreamState;
  validRowRatio: number;
  chunkSpreadVolts: number;
  sentinelChunkStreak: number;
  /** True when channels move together (common-mode / identical) — not independent contact. */
  channelsCoupled: boolean;
  overallSignalQuality01: number;
  packetFresh: boolean;
  timeSinceLastPacketMs: number;
};

const IDENTICAL_SPREAD_VOLTS = 1e-10;
const LOW_SPREAD_VOLTS = 5e-9;
const STALL_MS = 6000;
/** Grace while BLE is up but first EEG chunks are still arriving. */
const PREPARING_GRACE_MS = 8000;
/** Brief sentinel bursts below this streak stay "unstable", not "recovering". */
const SUSTAINED_SENTINEL_FOR_RECOVERING = 4;
/** Min valid row ratio to treat stale-dc as non-fatal while packets are fresh. */
const STALE_TOLERANT_VALID_RATIO = 0.5;

export type BrainBitContactDebugSlice = {
  frameQuality: BrainBitFrameQuality;
  validRowRatio: number;
  chunkSpreadVolts: number;
  sentinelChunkStreak: number;
  connectionQuality01: number;
};

export function deriveBrainBitStreamHealth(args: {
  wsConnected: boolean;
  connectionHealthState: ConnectionHealthState;
  timeSinceLastPacketMs: number;
  contact: BrainBitContactDebugSlice | null;
}): BrainBitStreamHealthSnapshot {
  const { wsConnected, connectionHealthState, timeSinceLastPacketMs, contact } = args;

  if (!wsConnected) {
    return {
      frameQuality: 'unknown',
      streamState: 'offline',
      validRowRatio: 0,
      chunkSpreadVolts: 0,
      sentinelChunkStreak: 0,
      channelsCoupled: false,
      overallSignalQuality01: 0,
      packetFresh: false,
      timeSinceLastPacketMs,
    };
  }

  const frameQuality = contact?.frameQuality ?? 'unknown';
  const validRowRatio = contact?.validRowRatio ?? 0;
  const chunkSpreadVolts = contact?.chunkSpreadVolts ?? 0;
  const sentinelChunkStreak = contact?.sentinelChunkStreak ?? 0;
  const overallSignalQuality01 = contact?.connectionQuality01 ?? 0;
  const packetFresh = timeSinceLastPacketMs < STALL_MS;
  const inStartupGrace =
    timeSinceLastPacketMs < PREPARING_GRACE_MS &&
    (frameQuality === 'unknown' || frameQuality === 'mixed');
  const channelsCoupled =
    chunkSpreadVolts <= Math.max(IDENTICAL_SPREAD_VOLTS, LOW_SPREAD_VOLTS) ||
    (frameQuality === 'sentinel' && sentinelChunkStreak >= 2);

  const briefSentinelBurst =
    frameQuality === 'sentinel' && sentinelChunkStreak < SUSTAINED_SENTINEL_FOR_RECOVERING;
  const briefStaleBurst =
    frameQuality === 'stale' &&
    validRowRatio >= STALE_TOLERANT_VALID_RATIO &&
    packetFresh &&
    !channelsCoupled &&
    sentinelChunkStreak < 2;

  let streamState: BrainBitStreamState = 'waiting';
  if (!packetFresh && !inStartupGrace) {
    streamState = connectionHealthState === 'disconnected' ? 'offline' : 'recovering';
  } else if (connectionHealthState === 'stalled' || connectionHealthState === 'reconnecting') {
    streamState = 'recovering';
  } else if (inStartupGrace) {
    streamState = 'waiting';
  } else if (
    !briefSentinelBurst &&
    !briefStaleBurst &&
    (sentinelChunkStreak >= SUSTAINED_SENTINEL_FOR_RECOVERING ||
      validRowRatio < 0.35)
  ) {
    streamState = 'recovering';
  } else if (frameQuality === 'mixed' || frameQuality === 'sentinel' || frameQuality === 'stale' || channelsCoupled) {
    streamState = 'degraded';
  } else if (frameQuality === 'valid' && packetFresh) {
    streamState = 'healthy';
  } else if (packetFresh) {
    streamState = 'degraded';
  }

  return {
    frameQuality,
    streamState,
    validRowRatio,
    chunkSpreadVolts,
    sentinelChunkStreak,
    channelsCoupled,
    overallSignalQuality01,
    packetFresh,
    timeSinceLastPacketMs,
  };
}

export function brainBitDisplaySignalQuality01(health: BrainBitStreamHealthSnapshot): number {
  const q = health.overallSignalQuality01;
  if (!health.packetFresh) return q;

  const sentinelDominant =
    health.sentinelChunkStreak >= 2 || health.frameQuality === 'sentinel';
  const channelsIndependent = !health.channelsCoupled;
  const validEnough = health.validRowRatio >= STALE_TOLERANT_VALID_RATIO;

  if (validEnough && channelsIndependent && !sentinelDominant) {
    if (health.frameQuality === 'stale' || health.frameQuality === 'mixed') {
      return Math.max(q, 0.35);
    }
    if (q < 0.35) {
      return Math.max(q, 0.35);
    }
  }

  return q;
}

export function brainBitStreamIsUsable(health: BrainBitStreamHealthSnapshot): boolean {
  if (health.streamState === 'offline') return false;
  if (health.streamState === 'waiting') return health.packetFresh;
  return health.streamState === 'healthy' || health.streamState === 'degraded' || health.streamState === 'recovering';
}

export function brainBitStreamStateLabel(state: BrainBitStreamState): string {
  switch (state) {
    case 'healthy':
      return 'Stream healthy';
    case 'recovering':
      return 'Stream recovering';
    case 'degraded':
      return 'Stream unstable';
    case 'waiting':
      return 'Preparing EEG stream';
    default:
      return 'Not streaming';
  }
}

export function brainBitStreamBannerMessage(health: BrainBitStreamHealthSnapshot): string | null {
  if (health.streamState === 'offline') {
    return 'No recent EEG packets — check headset power and tap Connect if needed.';
  }
  if (health.streamState === 'waiting') {
    return 'Connected — waiting for the first EEG chunks. This usually takes a few seconds.';
  }
  if (health.streamState === 'recovering') {
    if (health.frameQuality === 'sentinel') {
      return 'Brief device fallback frames detected — stream is stabilizing. Session can continue when packets return.';
    }
    return 'EEG stream is recovering after a brief interruption.';
  }
  if (health.streamState === 'degraded') {
    if (health.frameQuality === 'sentinel') {
      return 'Intermittent fallback frames (e.g. 0.4 V bursts) — usable between bursts; not a contact reading.';
    }
    return 'Signal is usable but imperfect — common in signal-only mode without per-pad impedance.';
  }
  if (health.frameQuality === 'mixed') {
    return 'Some frames were filtered — overall stream remains usable.';
  }
  return null;
}

export function brainBitOverallSignalLabel(quality01: number): { label: string; tone: 'good' | 'medium' | 'poor' } {
  if (quality01 >= 0.65) return { label: 'Strong', tone: 'good' };
  if (quality01 >= 0.32) return { label: 'Usable', tone: 'medium' };
  if (quality01 >= 0.18) return { label: 'Low', tone: 'medium' };
  return { label: 'Minimal', tone: 'poor' };
}
