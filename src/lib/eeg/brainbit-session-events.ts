/**
 * Structured BrainBit session markers — always emitted to console for Xcode / logs:save.
 */

export type BrainBitSessionEventType =
  | 'session_start'
  | 'headset_adjusted'
  | 'channel_recovered'
  | 'coherence_entered'
  | 'coherence_exited';

export interface BrainBitSessionEvent {
  type: BrainBitSessionEventType;
  at: string;
  detail?: Record<string, unknown>;
}

const recent: BrainBitSessionEvent[] = [];
const MAX_RECENT = 40;

export function logBrainBitSessionEvent(
  type: BrainBitSessionEventType,
  detail?: Record<string, unknown>,
): void {
  const evt: BrainBitSessionEvent = {
    type,
    at: new Date().toISOString(),
    ...(detail && Object.keys(detail).length > 0 ? { detail } : {}),
  };
  recent.push(evt);
  while (recent.length > MAX_RECENT) recent.shift();
  console.log('[BrainBitEvent]', type, detail ?? '');
}

export function getRecentBrainBitSessionEvents(): readonly BrainBitSessionEvent[] {
  return recent;
}
