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

export function isAthenaBridgeEegPacketV2(x: unknown): x is AthenaBridgeEegPacketV2 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === 2 &&
    o.k === 'eeg' &&
    typeof o.seq === 'number' &&
    Number.isFinite(o.seq) &&
    Array.isArray(o.labels) &&
    Array.isArray(o.u) &&
    typeof o.th === 'number'
  );
}

export function isAthenaBridgeEegPacketV1(x: unknown): x is AthenaBridgeEegPacketV1 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.v === 1 && o.k === 'eeg' && Array.isArray(o.u) && typeof o.th === 'number';
}
