/**
 * BrainBit per-channel display state — derived from classifier *rules*, not horseshoe alone.
 * stale-dc must not render green even when smoothed horseshoe reads 1 (good).
 */

import type {
  BrainBitChannelActivity,
  BrainBitChannelActivitySnapshot,
  BrainBitChannelState,
} from './brainbit-bridge-eeg-device';

/** Full hold when ≥2 channels are active or usable. */
export const BRAINBIT_STABILIZATION_HOLD_MS = 12_000;
/** Shorter hold when only stale (quiet DC) channels qualify — stream still live. */
export const BRAINBIT_STABILIZATION_HOLD_STALE_MS = 8_000;

const CORTICAL = new Set(['C3', 'C4']);

const STATE_READINESS_WEIGHT: Record<BrainBitChannelState, number> = {
  active: 1,
  usable: 0.88,
  stale: 0.4,
  low: 0.15,
  flat: 0,
  stuck: 0,
};

export function classifyBrainBitChannelState(args: {
  hasData: boolean;
  horseshoe: number;
  rule: string;
  stuck04Streak: number;
  stuckThreshold?: number;
}): BrainBitChannelState {
  const { hasData, horseshoe, rule, stuck04Streak, stuckThreshold = 96 } = args;
  if (!hasData) return 'flat';
  if (stuck04Streak >= stuckThreshold) return 'stuck';
  if (rule.startsWith('flat')) return 'flat';
  // Per-channel quiet-DC only — ignore chunk-level overlay strings (legacy / debug).
  if (rule.includes('stale-dc') && !rule.includes('→ min hs')) return 'stale';
  if (rule.startsWith('good')) return 'active';
  if (rule.startsWith('artifact') || rule.startsWith('clip')) return 'low';
  if (rule.startsWith('weak') || rule.startsWith('warmup')) return 'usable';
  if (rule.includes('var<') && !rule.startsWith('good')) return 'low';
  if (horseshoe >= 4) return 'flat';
  if (horseshoe === 3) return 'low';
  return 'usable';
}

export function isBrainBitChannelHealthy(state: BrainBitChannelState): boolean {
  return state === 'active' || state === 'usable';
}

/** Pre-session: stale still counts — DC plateau with live stream beats flat/stuck. */
export function isBrainBitStabilizationAcceptable(state: BrainBitChannelState): boolean {
  return state === 'active' || state === 'usable' || state === 'stale';
}

/** 0–1 for the setup “channel readiness” bar (not BLE link strength). */
export function brainBitChannelReadiness01(
  snapshot: BrainBitChannelActivitySnapshot | null,
): number {
  if (!snapshot || snapshot.totalCount === 0) return 0;
  let sum = 0;
  for (const ch of snapshot.channels) {
    sum += STATE_READINESS_WEIGHT[ch.state] ?? 0;
  }
  return sum / snapshot.totalCount;
}

export function brainBitStabilizationHoldMs(
  snapshot: BrainBitChannelActivitySnapshot | null,
): number {
  if (!snapshot) return BRAINBIT_STABILIZATION_HOLD_MS;
  const { activeUsable } = countBrainBitChannelBuckets(snapshot.channels);
  return activeUsable >= 2
    ? BRAINBIT_STABILIZATION_HOLD_MS
    : BRAINBIT_STABILIZATION_HOLD_STALE_MS;
}

export function countBrainBitChannelBuckets(channels: BrainBitChannelActivity[]): {
  activeUsable: number;
  stale: number;
  bad: number;
  total: number;
} {
  let activeUsable = 0;
  let stale = 0;
  let bad = 0;
  for (const ch of channels) {
    if (isBrainBitChannelHealthy(ch.state)) activeUsable += 1;
    else if (ch.state === 'stale') stale += 1;
    else bad += 1;
  }
  return { activeUsable, stale, bad, total: channels.length };
}

export type BrainBitChannelSessionMode = 'normal' | 'fallback' | 'insufficient';

/** Session EEG policy from healthy channel count (active + usable only). */
export function deriveBrainBitChannelSessionMode(
  snapshot: BrainBitChannelActivitySnapshot | null,
): BrainBitChannelSessionMode {
  if (!snapshot || snapshot.overallState === 'idle') return 'insufficient';
  const { activeUsable } = countBrainBitChannelBuckets(snapshot.channels);
  if (activeUsable >= 3) return 'normal';
  if (activeUsable >= 2) return 'fallback';
  return 'insufficient';
}

/** True when cortical pads look bad enough to warn (flat/stuck/low — not mere stale). */
export function c3c4NeedAdjustment(snapshot: BrainBitChannelActivitySnapshot | null): boolean {
  if (!snapshot) return false;
  for (const ch of snapshot.channels) {
    if (!CORTICAL.has(ch.label.toUpperCase())) continue;
    if (ch.state === 'flat' || ch.state === 'stuck' || ch.state === 'low') {
      return true;
    }
  }
  return false;
}

export function c3c4LookStale(snapshot: BrainBitChannelActivitySnapshot | null): boolean {
  if (!snapshot) return false;
  for (const ch of snapshot.channels) {
    if (!CORTICAL.has(ch.label.toUpperCase())) continue;
    if (ch.state === 'stale') return true;
  }
  return false;
}

export function countBrainBitStabilizationAcceptable(channels: BrainBitChannelActivity[]): number {
  return channels.filter((c) => isBrainBitStabilizationAcceptable(c.state)).length;
}

export function isBrainBitStabilizationTick(
  snapshot: BrainBitChannelActivitySnapshot | null,
): boolean {
  if (!snapshot || snapshot.overallState === 'idle') return false;
  if (countBrainBitStabilizationAcceptable(snapshot.channels) < 2) return false;
  for (const ch of snapshot.channels) {
    if (!CORTICAL.has(ch.label.toUpperCase())) continue;
    if (ch.state === 'flat' || ch.state === 'stuck') return false;
  }
  return true;
}

export function rebuildBrainBitActivitySnapshot(
  channels: BrainBitChannelActivity[],
): BrainBitChannelActivitySnapshot {
  const activeCount = channels.filter((c) => isBrainBitChannelHealthy(c.state)).length;
  const n = channels.length;
  let overallState: BrainBitChannelActivitySnapshot['overallState'];
  if (n === 0 || channels.every((c) => c.state === 'flat' && c.stuck04Streak === 0)) {
    overallState = 'idle';
  } else if (activeCount === 0) overallState = 'none';
  else if (activeCount >= n) overallState = 'full';
  else overallState = 'partial';
  return { channels, activeCount, totalCount: n, overallState };
}
