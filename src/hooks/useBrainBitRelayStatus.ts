import { useEffect, useState } from 'react';

export type BrainBitRelayPhase = 'starting' | 'ready' | 'failed' | 'skipped' | 'stopped';

export interface BrainBitRelayStatus {
  phase: BrainBitRelayPhase;
  message?: string | null;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Desktop-only BrainBit relay sidecar status from Tauri.
 * No-op in browser builds (returns null).
 */
export function useBrainBitRelayStatus(enabled: boolean): BrainBitRelayStatus | null {
  const [status, setStatus] = useState<BrainBitRelayStatus | null>(null);

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        const initial = await invoke<BrainBitRelayStatus>('get_brainbit_relay_status');
        if (!cancelled) {
          setStatus(initial);
        }

        unlisten = await listen<BrainBitRelayStatus>('brainbit-relay-status', (event) => {
          if (!cancelled) {
            setStatus(event.payload);
          }
        });
      } catch (err) {
        console.warn('[BrainBit relay status] Tauri hook unavailable:', err);
        if (!cancelled) {
          setStatus(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);

  return status;
}

export function brainBitRelayServiceLabel(status: BrainBitRelayStatus | null): string {
  if (!status) return 'Starting…';
  switch (status.phase) {
    case 'starting':
      return 'Starting…';
    case 'ready':
      return 'Ready';
    default:
      return 'Unavailable';
  }
}

export function isBrainBitRelayReadyForConnect(
  status: BrainBitRelayStatus | null,
  isTauri: boolean,
): boolean {
  if (!isTauri) return true;
  return status?.phase === 'ready';
}
