/**
 * WebSocket JSON contract: Athena iOS (LibMuse) → NeuroFlo bridge.
 * Not used by Muse 2 / muse-js. Future AthenaBridgeEEGDevice can import this shape.
 */

/** Current wire schema — bump when fields change semantically. */
export const ATHENA_BRIDGE_SCHEMA_VERSION = 2 as const;

export type AthenaBridgeEegPacketKind = 'eeg';

/**
 * Normalized EEG frame over the bridge (v2).
 * - `u`: microvolts, same order as `labels`.
 * - `td` / `tdUnit`: device timestamp from LibMuse when available (unit documented per SDK).
 * - `th`: host Unix time in seconds.
 * - `sr` / `srAssumed`: nominal rate from preset/docs when not measured.
 */
export type AthenaBridgeEegPacketV2 = {
  v: 2;
  k: AthenaBridgeEegPacketKind;
  /** Monotonic per WebSocket session on the emitter (throttled sends still increment). */
  seq: number;
  td: number | null;
  /** e.g. "unknown" until LibMuse timestamp units are verified */
  tdUnit: string;
  th: number;
  pr?: number;
  pn?: string;
  labels: readonly string[];
  u: readonly number[];
  sr: number | null;
  srAssumed: boolean;
};

export type AthenaBridgeEegPacketV1 = {
  v: 1;
  k: AthenaBridgeEegPacketKind;
  td: number | null;
  th: number;
  pr?: number;
  pn?: string;
  u: readonly number[];
};

export type AthenaBridgeEegPacket = AthenaBridgeEegPacketV1 | AthenaBridgeEegPacketV2;

function isFiniteNumberArray(a: unknown[], len: number): boolean {
  if (a.length !== len || a.length === 0) return false;
  return a.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isStringArray(a: unknown[]): boolean {
  return a.every((x) => typeof x === 'string');
}

export function isAthenaBridgeEegPacketV2(x: unknown): x is AthenaBridgeEegPacketV2 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (
    o.v !== 2 ||
    o.k !== 'eeg' ||
    typeof o.seq !== 'number' ||
    !Number.isFinite(o.seq) ||
    !Number.isInteger(o.seq) ||
    typeof o.th !== 'number' ||
    !Number.isFinite(o.th) ||
    typeof o.tdUnit !== 'string' ||
    typeof o.srAssumed !== 'boolean'
  ) {
    return false;
  }
  if (o.td != null && (typeof o.td !== 'number' || !Number.isFinite(o.td))) return false;
  if (o.sr != null && (typeof o.sr !== 'number' || !Number.isFinite(o.sr))) return false;
  if (o.pr != null && (typeof o.pr !== 'number' || !Number.isFinite(o.pr))) return false;
  if (o.pn != null && typeof o.pn !== 'string') return false;
  if (!Array.isArray(o.labels) || !Array.isArray(o.u)) return false;
  if (o.labels.length !== o.u.length || o.labels.length === 0) return false;
  if (!isStringArray(o.labels as unknown[]) || !isFiniteNumberArray(o.u as unknown[], o.u.length)) {
    return false;
  }
  return true;
}

/**
 * Safe parse: returns a normalized v2 packet or null (invalid / wrong shape).
 */
export function parseAthenaBridgeEegPacketV2(raw: unknown): AthenaBridgeEegPacketV2 | null {
  if (!isAthenaBridgeEegPacketV2(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    v: 2,
    k: 'eeg',
    seq: o.seq as number,
    td: o.td == null ? null : (o.td as number),
    tdUnit: o.tdUnit as string,
    th: o.th as number,
    pr: o.pr as number | undefined,
    pn: o.pn as string | undefined,
    labels: [...(o.labels as readonly string[])],
    u: [...(o.u as readonly number[])],
    sr: o.sr == null ? null : (o.sr as number),
    srAssumed: o.srAssumed as boolean,
  };
}

export function isAthenaBridgeEegPacketV1(x: unknown): x is AthenaBridgeEegPacketV1 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.v === 1 && o.k === 'eeg' && Array.isArray(o.u) && typeof o.th === 'number';
}
