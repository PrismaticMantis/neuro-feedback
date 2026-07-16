import { useEffect, useRef, useState } from 'react';
import type { BrainBitChannelActivitySnapshot } from '../lib/eeg/brainbit-bridge-eeg-device';
import {
  BRAINBIT_STABILIZATION_HOLD_MS,
  brainBitStabilizationHoldMs,
  c3c4LookStale,
  c3c4NeedAdjustment,
  countBrainBitStabilizationAcceptable,
  isBrainBitStabilizationTick,
} from '../lib/eeg/brainbit-channel-state';

export interface BrainBitContactStabilizationState {
  /** Milliseconds of continuous good contact accumulated toward hold target. */
  stableMs: number;
  holdMs: number;
  isReady: boolean;
  c3c4Weak: boolean;
  hint: string | null;
}

const EMPTY: BrainBitContactStabilizationState = {
  stableMs: 0,
  holdMs: BRAINBIT_STABILIZATION_HOLD_MS,
  isReady: false,
  c3c4Weak: false,
  hint: null,
};

/**
 * Pre-session gate: require continuous active/usable channels before start.
 * Stale (chunk plateau / contamination) does not count toward ready.
 */
export function useBrainBitContactStabilization(
  enabled: boolean,
  activity: BrainBitChannelActivitySnapshot | null,
  pollMs = 400,
): BrainBitContactStabilizationState {
  const [state, setState] = useState<BrainBitContactStabilizationState>(EMPTY);
  const stableMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      stableMsRef.current = 0;
      lastTickRef.current = null;
      wasReadyRef.current = false;
      setState(EMPTY);
      return;
    }

    const id = setInterval(() => {
      const now = Date.now();
      const dt = lastTickRef.current != null ? now - lastTickRef.current : 0;
      lastTickRef.current = now;

      const tickOk = isBrainBitStabilizationTick(activity);
      const holdMs = brainBitStabilizationHoldMs(activity);
      if (tickOk && dt > 0 && dt < pollMs * 3) {
        stableMsRef.current += dt;
      } else if (!tickOk) {
        stableMsRef.current = 0;
      }

      const c3c4Weak = c3c4NeedAdjustment(activity);
      const c3c4Stale = c3c4LookStale(activity);
      const stableMs = stableMsRef.current;
      const isReady = stableMs >= holdMs && tickOk;

      let hint: string | null = null;
      if (!activity || activity.overallState === 'idle') {
        hint = 'Waiting for channel data…';
      } else if (countBrainBitStabilizationAcceptable(activity.channels) < 2) {
        hint = 'Need at least 2 active or usable channels (not stale, flat, or stuck)';
      } else if (c3c4Weak) {
        hint = 'Adjust C3 / C4 — cortical pads look off or weak';
      } else if (c3c4Stale && !isReady) {
        hint = 'C3 / C4 signal stalled — hold steady or reseat pads';
      } else if (!isReady) {
        const secLeft = Math.ceil((holdMs - stableMs) / 1000);
        hint = `Hold steady contact ~${secLeft}s more`;
      }

      if (isReady && !wasReadyRef.current) {
        wasReadyRef.current = true;
      } else if (!isReady) {
        wasReadyRef.current = false;
      }

      setState({
        stableMs,
        holdMs,
        isReady,
        c3c4Weak,
        hint,
      });
    }, pollMs);

    return () => clearInterval(id);
  }, [enabled, activity, pollMs]);

  return state;
}
