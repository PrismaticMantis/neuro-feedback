/**
 * Temporary: floating panel to view Muse BLE diagnostic logs on devices without Web Inspector (e.g. Bluefy).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearMuseBleDebugEntries,
  formatMuseBleDebugEntriesForCopy,
  getMuseBleDebugCaptureEnabled,
  getMuseBleDebugEntries,
  setMuseBleDebugCaptureEnabled,
  subscribeMuseBleDebugEntries,
  type MuseBleDebugEntry,
  type MuseBleDebugLevel,
} from '../lib/muse-ble-debug-capture';
import './MuseBleDebugPanel.css';

const LS_CAPTURE = 'museBleDebugCaptureEnabled';
const LS_PANEL = 'museBleDebugPanelOpen';

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function levelLabel(l: MuseBleDebugLevel): string {
  if (l === 'log') return 'LOG';
  if (l === 'warn') return 'WARN';
  return 'ERR';
}

export function MuseBleDebugPanel() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_PANEL) === '1';
    } catch {
      return false;
    }
  });

  const [captureOn, setCaptureOn] = useState(() => {
    try {
      const v = localStorage.getItem(LS_CAPTURE);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {
      /* ignore */
    }
    return getMuseBleDebugCaptureEnabled();
  });

  const [entries, setEntries] = useState<MuseBleDebugEntry[]>(() => getMuseBleDebugEntries());

  useEffect(() => {
    setMuseBleDebugCaptureEnabled(captureOn);
    try {
      localStorage.setItem(LS_CAPTURE, captureOn ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [captureOn]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PANEL, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    return subscribeMuseBleDebugEntries(() => {
      setEntries(getMuseBleDebugEntries());
    });
  }, []);

  const onClear = useCallback(() => {
    clearMuseBleDebugEntries();
    setEntries([]);
  }, []);

  const onCopy = useCallback(async () => {
    const text = formatMuseBleDebugEntriesForCopy(entries);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* Fallback for restricted contexts */
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [entries]);

  const countLabel = useMemo(() => (entries.length > 0 ? ` (${entries.length})` : ''), [entries.length]);

  return (
    <>
      <button
        type="button"
        className="muse-ble-debug-fab"
        data-open={open ? 'true' : 'false'}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close Muse BLE debug log' : 'Open Muse BLE debug log'}
      >
        BLE log{countLabel}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="muse-ble-debug-backdrop"
            aria-label="Close debug panel"
            onClick={() => setOpen(false)}
          />
          <div className="muse-ble-debug-panel" role="dialog" aria-labelledby="muse-ble-debug-title">
            <header>
              <span className="title" id="muse-ble-debug-title">
                Muse BLE debug
              </span>
              <div className="muse-ble-debug-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={captureOn}
                    onChange={(e) => setCaptureOn(e.target.checked)}
                  />
                  Capture
                </label>
                <button type="button" onClick={onClear}>
                  Clear
                </button>
                <button type="button" onClick={onCopy}>
                  Copy all
                </button>
                <button type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </header>
            <div className="muse-ble-debug-log">
              {entries.length === 0 ? (
                <div className="muse-ble-debug-empty">
                  No captured lines yet. Connect via Bluetooth with Muse BLE diagnostics enabled in code.
                </div>
              ) : (
                <>
                  {entries.map((e) => (
                    <div key={e.id} className="muse-ble-debug-line">
                      <span className="muse-ble-debug-ts">{formatTime(e.t)}</span>
                      <span className={`muse-ble-debug-lvl muse-ble-debug-lvl--${e.level}`}>
                        [{levelLabel(e.level)}]
                      </span>
                      <span className="muse-ble-debug-msg">{e.message}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="muse-ble-debug-hint">
              Temporary tool. Toggle Capture off to stop recording. Lines must include [MuseBLE][DEBUG].
            </div>
          </div>
        </>
      )}
    </>
  );
}
