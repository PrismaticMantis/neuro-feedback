/**
 * Maps device-reported contact values to UI models.
 * Muse 2 uses horseshoe 1–4 per channel; other devices may use different encodings in their adapters.
 */

import type { ElectrodeQuality, ElectrodeSiteContact, ElectrodeStatus } from '../../types';

/** Known Muse 2 / 10–20 layout — extend when adding devices with fixed site maps. */
const LABEL_TO_LEGACY: Record<string, keyof ElectrodeStatus> = {
  TP9: 'tp9',
  AF7: 'af7',
  AF8: 'af8',
  TP10: 'tp10',
  tp9: 'tp9',
  af7: 'af7',
  af8: 'af8',
  tp10: 'tp10',
};

export function legacyKeyForElectrodeLabel(label: string): keyof ElectrodeStatus | null {
  return LABEL_TO_LEGACY[label] ?? LABEL_TO_LEGACY[label.toUpperCase()] ?? null;
}

/** Map Muse-style horseshoe integer to UI quality (1=good … 4=off). */
export function horseshoeValueToQuality(value: number): ElectrodeQuality {
  if (value === 1) return 'good';
  if (value === 2) return 'medium';
  if (value === 3) return 'poor';
  return 'off';
}

const EMPTY_LEGACY: ElectrodeStatus = {
  tp9: 'off',
  af7: 'off',
  af8: 'off',
  tp10: 'off',
};

/**
 * Build both a site list (extensible) and legacy ElectrodeStatus for current UI components.
 * Unknown labels still appear in `sites` with siteId `ch_<index>`; they do not fill legacy keys.
 */
export function horseshoeToElectrodeModel(
  horseshoe: number[],
  channelLabels: readonly string[],
): { sites: ElectrodeSiteContact[]; legacyStatus: ElectrodeStatus } {
  const n = Math.min(horseshoe.length, channelLabels.length);
  const sites: ElectrodeSiteContact[] = [];
  const legacyStatus: ElectrodeStatus = { ...EMPTY_LEGACY };

  for (let i = 0; i < n; i++) {
    const label = channelLabels[i] ?? `Ch${i}`;
    const raw = horseshoe[i] ?? 4;
    const quality = horseshoeValueToQuality(raw);
    const legacyKey = legacyKeyForElectrodeLabel(label);
    const siteId = legacyKey ?? `ch_${i}`;
    sites.push({ siteId, label, quality });
    if (legacyKey) {
      legacyStatus[legacyKey] = quality;
    }
  }

  return { sites, legacyStatus };
}
