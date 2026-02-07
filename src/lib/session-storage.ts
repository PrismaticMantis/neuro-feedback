/**
 * Session storage – Save + History
 * Device-local persistence for SessionRecord, Journeys, last journey per user.
 * Uses localStorage. All data scoped by userId.
 */

import { ENABLE_SESSION_HISTORY } from './feature-flags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StabilityLevel = 'Unsettled' | 'Steady' | 'Very Steady';

export interface PPGSummary {
  avgHR: number;
  avgHRV?: number | null; // RMSSD of inter-beat intervals (ms)
  hrTrend: 'up' | 'down' | 'stable';
}

export interface SessionRecord {
  id: string;
  userId: string;
  journeyId: string;
  startedAt: string; // ISO
  endedAt: string;
  durationMs: number;
  coherenceMs: number;
  coherencePercent: number;
  coherenceEntries: number;
  longestStreakMs: number;
  avgCoherenceLevel: number; // 0–1
  stabilityLevel: StabilityLevel;
  graphSeries: number[]; // Downsampled time series
  ppgSummary?: PPGSummary;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: string;
}

export interface Journey {
  id: string;
  name: string;
  description: string;
  icon?: string;
  configId?: string;
}

// ---------------------------------------------------------------------------
// Default journeys
// ---------------------------------------------------------------------------

/* Lovable design: Calm, Deep Rest, Creative Flow, Night Wind-Down */
export const DEFAULT_JOURNEYS: Journey[] = [
  { id: 'calm', name: 'Calm', description: 'Release tension, quiet the mind, and restore inner stillness. Perfect for moments of overwhelm.', configId: 'calm' },
  { id: 'deepRest', name: 'Deep Rest', description: 'Full nervous system reset. Drop into profound restoration and physical renewal.', configId: 'deepRest' },
  { id: 'creativeFlow', name: 'Creative Flow', description: 'Unlock expansive thinking and creative possibility. Shift from force to flow.', configId: 'creativeFlow' },
  { id: 'nightWindDown', name: 'Night Wind-Down', description: 'Gentle transition from day to night. Prepare body and mind for restorative sleep.', configId: 'nightWindDown' },
];

const DEFAULT_JOURNEY_ID = 'calm';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEY_RECORDS = 'neuro-session-records';
const KEY_LAST_JOURNEY = 'neuro-last-journey'; // userId -> journeyId

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecords(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY_RECORDS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setRecords(records: SessionRecord[]): void {
  localStorage.setItem(KEY_RECORDS, JSON.stringify(records));
}

function getLastJourneyMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY_LAST_JOURNEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLastJourneyMap(m: Record<string, string>): void {
  localStorage.setItem(KEY_LAST_JOURNEY, JSON.stringify(m));
}

/** Downsample array to maxLen points. */
function downsample(series: number[], maxLen: number): number[] {
  if (series.length <= maxLen) return [...series];
  const step = (series.length - 1) / (maxLen - 1);
  const out: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const idx = i * step;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, series.length - 1);
    const t = idx - lo;
    out.push(series[lo] * (1 - t) + series[hi] * t);
  }
  return out;
}

function achievementToStability(achievementScore: string): StabilityLevel {
  switch (achievementScore) {
    case 'Mastery':
    case 'Flowing':
      return 'Very Steady';
    case 'Settled':
      return 'Steady';
    default:
      return 'Unsettled';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a session record. Idempotent: if a record with the same id exists,
 * it is updated (no duplicate created).
 */
export function saveSessionRecord(record: SessionRecord): SessionRecord {
  if (!ENABLE_SESSION_HISTORY) return record;

  const records = getRecords();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    records[idx] = { ...record };
    setRecords(records);
    return records[idx];
  }
  records.push({ ...record });
  setRecords(records);
  return record;
}

/**
 * Get a session record by id.
 */
export function getSessionRecord(id: string): SessionRecord | null {
  return getRecords().find((r) => r.id === id) ?? null;
}

/**
 * Get recent session records for a user, newest first.
 */
export function getRecentSessionRecords(userId: string, limit: number = 10): SessionRecord[] {
  return getRecords()
    .filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, limit);
}

/**
 * Get all session records for a user, newest first.
 */
export function getUserSessionRecords(userId: string): SessionRecord[] {
  return getRecords()
    .filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

/**
 * Delete a session record by id.
 */
export function deleteSessionRecord(id: string): void {
  if (!ENABLE_SESSION_HISTORY) return;
  const records = getRecords().filter((r) => r.id !== id);
  setRecords(records);
}

/**
 * Get all journeys.
 */
export function getJourneys(): Journey[] {
  return [...DEFAULT_JOURNEYS];
}

/**
 * Get last selected journey id for a user.
 */
export function getLastJourneyId(userId: string): string {
  const m = getLastJourneyMap();
  return m[userId] ?? DEFAULT_JOURNEY_ID;
}

/**
 * Persist last selected journey for a user.
 */
export function setLastJourneyId(userId: string, journeyId: string): void {
  const m = getLastJourneyMap();
  m[userId] = journeyId;
  setLastJourneyMap(m);
}

/**
 * Build a SessionRecord from session + stats (e.g. from useSession / storage).
 * Used when saving after "End Session". Downsampled graphSeries, stabilityLevel from achievement.
 */
export function buildSessionRecord(params: {
  id: string;
  userId: string;
  journeyId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  coherenceMs: number;
  coherencePercent: number;
  coherenceEntries: number;
  longestStreakMs: number;
  avgCoherence: number;
  achievementScore: string;
  coherenceHistory: number[];
  ppgSummary?: PPGSummary;
}): SessionRecord {
  const maxGraphPoints = 120;
  const graphSeries = downsample(params.coherenceHistory, maxGraphPoints);

  return {
    id: params.id,
    userId: params.userId,
    journeyId: params.journeyId,
    startedAt: params.startTime,
    endedAt: params.endTime,
    durationMs: params.durationMs,
    coherenceMs: params.coherenceMs,
    coherencePercent: params.coherencePercent,
    coherenceEntries: params.coherenceEntries,
    longestStreakMs: params.longestStreakMs,
    avgCoherenceLevel: params.avgCoherence,
    stabilityLevel: achievementToStability(params.achievementScore),
    graphSeries,
    ppgSummary: params.ppgSummary,
  };
}
