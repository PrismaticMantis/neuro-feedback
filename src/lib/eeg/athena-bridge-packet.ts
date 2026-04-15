/**
 * WebSocket JSON contract: Athena iOS (LibMuse) → NeuroFlo bridge.
 * Not used by Muse 2 / muse-js. Future AthenaBridgeEEGDevice can import this shape.
 */

/** Current wire schema — bump when fields change semantically. */
export const ATHENA_BRIDGE_SCHEMA_VERSION = 2 as const;

export type AthenaBridgeEegPacketKind = 'eeg';

/**
 * Normalized EEG frame over the bridge (v2).
 * - `u`: microvolts, same order as `labels` (any channel count ≥ 1).
 * - `td` / `tdUnit`: device timestamp from LibMuse when available. Use a **known** unit string (e.g. `ms`, `s`)
 *   so the receiver can derive per-step seconds; `unknown` means NeuroFlo will not use `td` for the time base.
 * - `th`: host Unix time in seconds (set on the emitter immediately before send — stable inter-packet spacing).
 * - `sr` / `srAssumed`: **effective rate of `u` rows** (Hz), i.e. one row per packet ⇒ ~send rate after throttle.
 *   Legacy emitters may still send the headset’s native rate (e.g. 256); the receiver **ignores** that for FFT when
 *   it is much higher than the measured stream rate.
 * Emitter must set `v: 2` explicitly; `seq` ≥ 1; `labels.length === u.length`; `tdUnit` and `srAssumed` required.
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

/** Default channel labels when emitter omits `labels` (v1 or partial v2). */
const DEFAULT_EEG_LABELS = ['TP9', 'AF7', 'AF8', 'TP10'] as const;

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

function coerceWireVersion(v: unknown): 1 | 2 | null {
  if (v === 1 || v === 2) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (n === 1 || n === 2) return n;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const t = Math.trunc(v);
    if (t === 1 || t === 2) return t;
  }
  return null;
}

function coerceMicrovoltsArray(u: unknown): number[] | null {
  if (!Array.isArray(u) || u.length === 0) return null;
  const out: number[] = [];
  for (const x of u) {
    if (typeof x === 'number' && Number.isFinite(x)) {
      out.push(x);
      continue;
    }
    if (typeof x === 'string' && x.trim() !== '') {
      const n = Number(x);
      if (Number.isFinite(n)) {
        out.push(n);
        continue;
      }
    }
    return null;
  }
  return out;
}

/** Missing or invalid seq → 0 (legacy v1 / partial v2 emitters). */
function coerceSeq(o: Record<string, unknown>): number {
  const s = o.seq;
  if (typeof s === 'number' && Number.isFinite(s)) {
    return Math.trunc(s);
  }
  if (typeof s === 'string' && s.trim() !== '') {
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export type AthenaBridgePacketNormalizeResult =
  | { ok: true; packet: AthenaBridgeEegPacketV2 }
  | { ok: false; reason: string };

/**
 * Convert a **consecutive** device timestamp difference `tdNext - tdPrev` to seconds when `tdUnit` is recognized.
 * Returns `null` for `unknown`/unlisted units so callers fall back to host `th` deltas.
 */
export function interpretDeviceTimeDeltaSeconds(tdDelta: number, tdUnit: string): number | null {
  if (!Number.isFinite(tdDelta)) return null;
  const u = tdUnit.trim().toLowerCase();
  if (u === '' || u === 'unknown') return null;
  if (u === 's' || u === 'sec' || u === 'second' || u === 'seconds') return tdDelta;
  if (u === 'ms' || u === 'millisecond' || u === 'milliseconds') return tdDelta / 1000;
  if (u === 'us' || u === 'microsecond' || u === 'microseconds') return tdDelta / 1_000_000;
  if (u === 'libmuse_seconds') return tdDelta;
  if (u === 'libmuse_ms') return tdDelta / 1000;
  return null;
}

function parseV2Strict(o: Record<string, unknown>, u: number[]): AthenaBridgePacketNormalizeResult {
  if (coerceWireVersion(o.v) !== 2) {
    return { ok: false, reason: 'v2_requires_v_field_2' };
  }
  const seqRaw = o.seq;
  if (typeof seqRaw !== 'number' || !Number.isFinite(seqRaw)) {
    return { ok: false, reason: 'v2_seq_required_number' };
  }
  const seq = Math.trunc(seqRaw);
  if (seq < 1) return { ok: false, reason: 'v2_seq_must_be_positive' };

  if (!Array.isArray(o.labels) || o.labels.length !== u.length || u.length === 0) {
    return { ok: false, reason: 'v2_labels_must_match_u' };
  }
  if (!isStringArray(o.labels as unknown[])) {
    return { ok: false, reason: 'v2_labels_must_be_strings' };
  }
  const labels = [...(o.labels as string[])];
  for (const lab of labels) {
    if (lab.trim().length === 0) return { ok: false, reason: 'v2_label_empty' };
  }

  if (typeof o.tdUnit !== 'string' || o.tdUnit.trim().length === 0) {
    return { ok: false, reason: 'v2_tdUnit_required' };
  }
  if (typeof o.srAssumed !== 'boolean') {
    return { ok: false, reason: 'v2_srAssumed_required_boolean' };
  }

  let td: number | null = null;
  if (o.td != null) {
    if (typeof o.td === 'number' && Number.isFinite(o.td)) td = o.td;
    else return { ok: false, reason: 'td_not_finite' };
  }

  if (typeof o.th !== 'number' || !Number.isFinite(o.th)) {
    return { ok: false, reason: 'th_missing_or_invalid' };
  }
  const th = o.th;

  let sr: number | null = null;
  if (o.sr != null) {
    if (typeof o.sr === 'number' && Number.isFinite(o.sr)) sr = o.sr;
    else return { ok: false, reason: 'sr_not_finite' };
  }

  let pr: number | undefined;
  if (o.pr != null) {
    if (typeof o.pr === 'number' && Number.isFinite(o.pr)) pr = Math.trunc(o.pr);
    else return { ok: false, reason: 'pr_invalid' };
  }

  let pn: string | undefined;
  if (o.pn != null) {
    if (typeof o.pn === 'string') pn = o.pn;
    else return { ok: false, reason: 'pn_invalid' };
  }

  return {
    ok: true,
    packet: {
      v: 2,
      k: 'eeg',
      seq,
      td,
      tdUnit: o.tdUnit as string,
      th,
      pr,
      pn,
      labels,
      u,
      sr,
      srAssumed: o.srAssumed as boolean,
    },
  };
}

function parseV1Lenient(o: Record<string, unknown>, u: number[]): AthenaBridgePacketNormalizeResult {
  const seq = coerceSeq(o);

  let labels: string[];
  if (
    Array.isArray(o.labels) &&
    o.labels.length === u.length &&
    isStringArray(o.labels as unknown[])
  ) {
    labels = [...(o.labels as string[])];
  } else {
    labels = u.map((_, i) => DEFAULT_EEG_LABELS[i] ?? `ch${i}`);
  }

  let td: number | null = null;
  if (o.td != null) {
    if (typeof o.td === 'number' && Number.isFinite(o.td)) td = o.td;
    else return { ok: false, reason: 'td_not_finite' };
  }

  let th: number;
  if (typeof o.th === 'number' && Number.isFinite(o.th)) {
    th = o.th;
  } else if (o.th == null) {
    th = Date.now() / 1000;
  } else {
    return { ok: false, reason: 'th_missing_or_invalid' };
  }

  const tdUnit = typeof o.tdUnit === 'string' && o.tdUnit.trim().length > 0 ? o.tdUnit : 'unknown';
  const srAssumed = typeof o.srAssumed === 'boolean' ? o.srAssumed : true;

  let sr: number | null = null;
  if (o.sr != null) {
    if (typeof o.sr === 'number' && Number.isFinite(o.sr)) sr = o.sr;
    else return { ok: false, reason: 'sr_not_finite' };
  }

  let pr: number | undefined;
  if (o.pr != null) {
    if (typeof o.pr === 'number' && Number.isFinite(o.pr)) pr = Math.trunc(o.pr);
    else return { ok: false, reason: 'pr_invalid' };
  }

  let pn: string | undefined;
  if (o.pn != null) {
    if (typeof o.pn === 'string') pn = o.pn;
    else return { ok: false, reason: 'pn_invalid' };
  }

  return {
    ok: true,
    packet: {
      v: 2,
      k: 'eeg',
      seq,
      td,
      tdUnit,
      th,
      pr,
      pn,
      labels,
      u,
      sr,
      srAssumed,
    },
  };
}

/**
 * **v:2** — strict: explicit version, seq ≥ 1, `labels` must match `u`, `tdUnit` & `srAssumed` required.
 * **v:1** — legacy lenient path (synthetic labels / defaults); prefer upgrading emitters to v2.
 */
export function tryNormalizeAthenaBridgeEegPacket(raw: unknown): AthenaBridgePacketNormalizeResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, reason: 'not_an_object' };
  }
  const o = raw as Record<string, unknown>;
  if (o.k !== 'eeg') {
    return { ok: false, reason: 'k_not_eeg' };
  }
  const wireV = coerceWireVersion(o.v);
  if (wireV == null) {
    return { ok: false, reason: 'v_required_1_or_2' };
  }

  const u = coerceMicrovoltsArray(o.u);
  if (!u) {
    return { ok: false, reason: 'u_invalid_or_empty' };
  }

  if (wireV === 2) {
    return parseV2Strict(o, u);
  }
  return parseV1Lenient(o, u);
}

/**
 * Safe parse: strict v2 or legacy v1 normalized to v2 shape, or null.
 */
export function parseAthenaBridgeEegPacketV2(raw: unknown): AthenaBridgeEegPacketV2 | null {
  const r = tryNormalizeAthenaBridgeEegPacket(raw);
  return r.ok ? r.packet : null;
}

export function isAthenaBridgeEegPacketV1(x: unknown): x is AthenaBridgeEegPacketV1 {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.v === 1 && o.k === 'eeg' && Array.isArray(o.u) && typeof o.th === 'number';
}
