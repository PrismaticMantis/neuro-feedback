/**
 * BrainBit signal confidence — separate from raw coherence so the graph stays responsive
 * while honestly reflecting weak/stale channel conditions.
 */

import type { BrainBitChannelActivitySnapshot } from './brainbit-bridge-eeg-device';
import {
  countBrainBitChannelBuckets,
  deriveBrainBitChannelSessionMode,
  type BrainBitChannelSessionMode,
} from './brainbit-channel-state';
import type { BrainBitStreamHealthSnapshot } from './brainbit-stream-health';
import { brainBitStreamIsUsable } from './brainbit-stream-health';

export type { BrainBitChannelSessionMode };

const MODE_BASE: Record<BrainBitChannelSessionMode, number> = {
  normal: 1,
  fallback: 0.62,
  insufficient: 0.25,
};

export function computeBrainBitSignalConfidence(args: {
  channelActivity: BrainBitChannelActivitySnapshot | null;
  streamHealth?: BrainBitStreamHealthSnapshot | null;
  electrodeQuality01?: number;
}): number {
  const mode = deriveBrainBitChannelSessionMode(args.channelActivity);
  let conf = MODE_BASE[mode];

  if (args.channelActivity) {
    const { activeUsable, stale, total } = countBrainBitChannelBuckets(args.channelActivity.channels);
    if (total > 0) {
      const stalePenalty = (stale / total) * 0.2;
      conf -= stalePenalty;
      const ratio = activeUsable / total;
      conf = conf * (0.55 + 0.45 * ratio);
    }
  }

  if (args.streamHealth && !brainBitStreamIsUsable(args.streamHealth)) {
    conf *= 0.5;
  } else if (args.streamHealth?.streamState === 'degraded') {
    conf *= 0.85;
  }

  if (args.electrodeQuality01 != null) {
    conf *= 0.65 + 0.35 * Math.min(1, args.electrodeQuality01);
  }

  return Math.max(0.08, Math.min(1, conf));
}

/** Visual coherence stays raw; confidence drives opacity / debug only. */
export function brainBitConfidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High';
  if (confidence >= 0.5) return 'Moderate';
  if (confidence >= 0.3) return 'Low';
  return 'Minimal';
}

export function brainBitContactGateForMode(mode: BrainBitChannelSessionMode): {
  minContactQuality: number;
  minContactWhenSignalValid: number;
} {
  switch (mode) {
    case 'normal':
      return { minContactQuality: 0.25, minContactWhenSignalValid: 0.12 };
    case 'fallback':
      return { minContactQuality: 0.18, minContactWhenSignalValid: 0.08 };
    default:
      return { minContactQuality: 0.35, minContactWhenSignalValid: 0.2 };
  }
}
