/**
 * Device-agnostic contact / signal quality helpers.
 * Muse 2 uses horseshoe 1–4 and a 4-site layout; thresholds scale by channel count (75% rule from Muse UX).
 *
 * TODO(brainbit/athena): Map vendor-specific contact bytes into ElectrodeSiteContact + reuse these helpers.
 */

import type { ElectrodeQuality, ElectrodeSiteContact, ElectrodeStatus } from '../../types';
import { BRAINBIT_MVP_MIN_GOOD_OR_MEDIUM_CHANNELS } from './brainbit-coherence-stability';

/** Fraction of channels that must read "good" for a "Strong" overall summary (Muse: 3/4). */
const STRONG_GOOD_FRACTION = 0.75;

function strongGoodCountThreshold(siteCount: number): number {
  if (siteCount <= 0) return 1;
  return Math.max(1, Math.ceil(STRONG_GOOD_FRACTION * siteCount));
}

/**
 * 0–1 metric matching legacy `electrodeStatusToConnectionQuality` for 4 Muse sites:
 * strong band → 1, partial → 0.5, else 0.
 */
export function connectionQualityMetricFromSites(sites: ElectrodeSiteContact[]): number {
  const n = sites.length;
  if (n === 0) return 0;
  const goodCount = sites.filter((s) => s.quality === 'good').length;
  const need = strongGoodCountThreshold(n);
  if (goodCount >= need) return 1;
  if (goodCount >= 1) return 0.5;
  return 0;
}

/** Same metric derived from legacy 4-key Muse `ElectrodeStatus` (when sites[] is empty). */
export function connectionQualityMetricFromLegacyStatus(status: ElectrodeStatus): number {
  const sites: ElectrodeSiteContact[] = (
    ['tp9', 'af7', 'af8', 'tp10'] as const
  ).map((siteId) => ({
    siteId,
    label: siteId.toUpperCase(),
    quality: status[siteId],
  }));
  return connectionQualityMetricFromSites(sites);
}

/**
 * Average score (0–1) for expressive / audio: good=1, medium=0.5, else 0 — mean over channels.
 */
export function averageContactScore01(sites: ElectrodeSiteContact[]): number {
  if (sites.length === 0) return 0;
  const scores = sites.map((s) =>
    s.quality === 'good' ? 1 : s.quality === 'medium' ? 0.5 : 0
  );
  return scores.reduce<number>((a, b) => a + b, 0) / sites.length;
}

export function averageContactScore01FromLegacyStatus(status: ElectrodeStatus): number {
  const sites: ElectrodeSiteContact[] = (
    ['tp9', 'af7', 'af8', 'tp10'] as const
  ).map((siteId) => ({
    siteId,
    label: siteId.toUpperCase(),
    quality: status[siteId],
  }));
  return averageContactScore01(sites);
}

/**
 * Session gating: "good" UX when enough channels are good OR medium (not just good).
 * Muse 2: at least 3 of 4 good|medium.
 */
export function hasEnoughGoodOrMediumContact(sites: ElectrodeSiteContact[]): boolean {
  const n = sites.length;
  if (n === 0) return false;
  const need = strongGoodCountThreshold(n);
  const ok = sites.filter((s) => s.quality === 'good' || s.quality === 'medium').length;
  return ok >= need;
}

export function hasEnoughGoodOrMediumContactLegacy(status: ElectrodeStatus): boolean {
  const vals = [status.tp9, status.af7, status.af8, status.tp10];
  return vals.filter((q) => q === 'good' || q === 'medium').length >= 3;
}

const BRAINBIT_CORTICAL_LABELS = new Set(['C3', 'C4']);

function isBrainBitCorticalSite(site: ElectrodeSiteContact): boolean {
  const u = site.label.toUpperCase();
  return BRAINBIT_CORTICAL_LABELS.has(u) || BRAINBIT_CORTICAL_LABELS.has(site.siteId.toUpperCase());
}

/**
 * Contact score for BrainBit audio gating — C3/C4 only (coherence montage). Ear refs A1/A2 often
 * read flat without blocking usable cortical EEG.
 */
export function averageContactScore01BrainBitAudio(sites: ElectrodeSiteContact[]): number {
  const cortical = sites.filter(isBrainBitCorticalSite);
  if (cortical.length > 0) {
    return averageContactScore01(cortical);
  }
  return averageContactScore01(sites);
}

/** BrainBit Headphones: 2 of 4 good|medium (A1/A2 ear refs often read weaker than C3/C4). */
export function hasEnoughGoodOrMediumContactBrainBit(sites: ElectrodeSiteContact[]): boolean {
  const n = sites.length;
  if (n === 0) return false;
  const ok = sites.filter((s) => s.quality === 'good' || s.quality === 'medium').length;
  const need = Math.min(BRAINBIT_MVP_MIN_GOOD_OR_MEDIUM_CHANNELS, n);
  return ok >= need;
}

/**
 * Overall pill summary (Strong / Partial / Poor) — same rules as previous ElectrodeStatus UI.
 */
export function overallContactSummaryFromSites(sites: ElectrodeSiteContact[]): {
  label: string;
  quality: ElectrodeQuality;
} {
  const n = sites.length;
  if (n === 0) {
    return { label: 'Poor signal', quality: 'off' };
  }
  const goodCount = sites.filter((s) => s.quality === 'good').length;
  const need = strongGoodCountThreshold(n);
  if (goodCount >= need) return { label: 'Strong signal', quality: 'good' };
  if (goodCount >= 1) return { label: 'Partial signal', quality: 'medium' };
  return { label: 'Poor signal', quality: 'off' };
}

export function overallContactSummaryFromLegacyStatus(status: ElectrodeStatus): {
  label: string;
  quality: ElectrodeQuality;
} {
  const sites: ElectrodeSiteContact[] = (
    ['tp9', 'af7', 'af8', 'tp10'] as const
  ).map((siteId) => ({
    siteId,
    label: siteId.toUpperCase(),
    quality: status[siteId],
  }));
  return overallContactSummaryFromSites(sites);
}

/** BrainBit bridge estimate: good/medium/poor/off weighted mean → Strong / Partial / Poor. */
export function overallContactSummaryFromAverage(sites: ElectrodeSiteContact[]): {
  label: string;
  quality: ElectrodeQuality;
} {
  if (sites.length === 0) {
    return { label: 'Poor signal', quality: 'off' };
  }
  const avg = averageContactScore01(sites);
  if (avg >= 0.65) return { label: 'Strong signal', quality: 'good' };
  if (avg >= 0.28) return { label: 'Partial signal', quality: 'medium' };
  if (avg >= 0.12) return { label: 'Low signal', quality: 'medium' };
  return { label: 'Poor signal', quality: 'off' };
}
