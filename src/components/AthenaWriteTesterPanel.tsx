/**
 * Temporary debug UI for Athena manual BLE writes — remove with athena-write-tester-debug.ts.
 */

import { useState } from 'react';
import {
  DEBUG_ATHENA_WRITE_TESTER_UI,
  connectAthenaWriteTester,
  disconnectAthenaWriteTester,
  parseHexPayload,
  sendAthenaWriteTesterPayload,
  type AthenaWriteMode,
  type AthenaWriteTargetId,
} from '../lib/athena-write-tester-debug';
import { isAthenaBleProbeActive } from '../lib/athena-ble-probe-debug';

export interface AthenaWriteTesterPanelProps {
  /** Bumps parent re-render so mutual-exclusion checks (probe vs write tester) stay in sync. */
  onSessionChange?: () => void;
}

export function AthenaWriteTesterPanel({ onSessionChange }: AthenaWriteTesterPanelProps) {
  const [sessionReady, setSessionReady] = useState(false);
  const [busyConnect, setBusyConnect] = useState(false);
  const [busyWrite, setBusyWrite] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [target, setTarget] = useState<AthenaWriteTargetId>('c0001');
  const [mode0014, setMode0014] = useState<AthenaWriteMode>('withResponse');
  const [lastError, setLastError] = useState<string | null>(null);

  if (!DEBUG_ATHENA_WRITE_TESTER_UI) return null;

  const probeBlocks = isAthenaBleProbeActive();
  const modeForSend: AthenaWriteMode =
    target === 'c0014' ? mode0014 : 'withoutResponse';

  const onConnect = () => {
    void (async () => {
      setLastError(null);
      setBusyConnect(true);
      try {
        await connectAthenaWriteTester();
        setSessionReady(true);
        onSessionChange?.();
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        setSessionReady(false);
        onSessionChange?.();
      } finally {
        setBusyConnect(false);
      }
    })();
  };

  const onDisconnect = () => {
    void (async () => {
      setBusyConnect(true);
      try {
        await disconnectAthenaWriteTester();
        setSessionReady(false);
        onSessionChange?.();
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        onSessionChange?.();
      } finally {
        setBusyConnect(false);
      }
    })();
  };

  const onSend = () => {
    void (async () => {
      setLastError(null);
      setBusyWrite(true);
      try {
        const payload = parseHexPayload(hexInput);
        await sendAthenaWriteTesterPayload(target, payload, modeForSend);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyWrite(false);
      }
    })();
  };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 8,
        border: '1px dashed hsl(320 20% 35% / 0.55)',
        background: 'hsl(320 12% 8% / 0.5)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 600,
          color: 'hsl(320 15% 70%)',
          marginBottom: 8,
        }}
      >
        Athena write tester (debug)
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 10,
          color: 'hsl(270 10% 55%)',
          margin: '0 0 10px 0',
          lineHeight: 1.4,
        }}
      >
        Listens on 0013/0014/0015 first, then one manual write to 0001, 0014, or 0015. No automatic
        payloads — you supply hex. Stop other BLE debug tools first.
      </p>

      {lastError && (
        <div
          style={{
            fontSize: 11,
            color: 'hsl(0 50% 65%)',
            marginBottom: 8,
            wordBreak: 'break-word',
          }}
        >
          {lastError}
        </div>
      )}

      {!sessionReady ? (
        <button
          type="button"
          disabled={busyConnect || probeBlocks}
          onClick={onConnect}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid hsl(320 25% 40%)',
            background: 'hsl(320 15% 14%)',
            color: 'hsl(320 20% 85%)',
            cursor: busyConnect || probeBlocks ? 'not-allowed' : 'pointer',
          }}
        >
          {probeBlocks ? 'Stop Athena probe first' : busyConnect ? 'Connecting…' : 'Connect for write test'}
        </button>
      ) : (
        <>
          <label style={{ display: 'block', fontSize: 10, color: 'hsl(270 10% 60%)', marginBottom: 4 }}>
            Target
          </label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as AthenaWriteTargetId)}
            style={{
              width: '100%',
              marginBottom: 8,
              padding: 6,
              fontSize: 12,
              borderRadius: 4,
              background: '#1a1520',
              color: 'var(--text-primary)',
              border: '1px solid hsl(270 15% 25%)',
            }}
          >
            <option value="c0001">273e0001 (control — write without response)</option>
            <option value="c0014">273e0014 (write / indicate)</option>
            <option value="c0015">273e0015 (write without response)</option>
          </select>

          {target === 'c0014' && (
            <>
              <label style={{ display: 'block', fontSize: 10, color: 'hsl(270 10% 60%)', marginBottom: 4 }}>
                Write mode (0014)
              </label>
              <select
                value={mode0014}
                onChange={(e) => setMode0014(e.target.value as AthenaWriteMode)}
                style={{
                  width: '100%',
                  marginBottom: 8,
                  padding: 6,
                  fontSize: 12,
                  borderRadius: 4,
                  background: '#1a1520',
                  color: 'var(--text-primary)',
                  border: '1px solid hsl(270 15% 25%)',
                }}
              >
                <option value="withResponse">With response</option>
                <option value="withoutResponse">Without response</option>
              </select>
            </>
          )}

          {(target === 'c0001' || target === 'c0015') && (
            <div style={{ fontSize: 10, color: 'hsl(270 12% 50%)', marginBottom: 8 }}>
              Uses write without response (only mode for this characteristic).
            </div>
          )}

          <label style={{ display: 'block', fontSize: 10, color: 'hsl(270 10% 60%)', marginBottom: 4 }}>
            Hex payload (e.g. 01 02 ab)
          </label>
          <textarea
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            placeholder="00"
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 8,
              padding: 8,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              borderRadius: 4,
              background: '#120e18',
              color: 'hsl(45 20% 88%)',
              border: '1px solid hsl(270 15% 25%)',
              resize: 'vertical',
            }}
          />

          <button
            type="button"
            disabled={busyWrite}
            onClick={onSend}
            style={{
              width: '100%',
              marginBottom: 8,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid hsl(45 40% 45%)',
              background: 'hsl(45 25% 18%)',
              color: 'hsl(45 50% 88%)',
              cursor: busyWrite ? 'wait' : 'pointer',
            }}
          >
            {busyWrite ? 'Writing…' : 'Send one write'}
          </button>

          <button
            type="button"
            disabled={busyConnect}
            onClick={onDisconnect}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid hsl(270 15% 35%)',
              background: 'transparent',
              color: 'hsl(270 15% 70%)',
              cursor: busyConnect ? 'wait' : 'pointer',
            }}
          >
            {busyConnect ? '…' : 'Stop / disconnect'}
          </button>
        </>
      )}
    </div>
  );
}
