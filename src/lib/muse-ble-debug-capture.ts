/**
 * Temporary: capture [MuseBLE][DEBUG] lines from console for on-device viewing (e.g. Bluefy / iPad).
 * Does not alter BLE or connection code — install once in main.tsx before render.
 */

export type MuseBleDebugLevel = 'log' | 'warn' | 'error';

export type MuseBleDebugEntry = {
  id: number;
  t: number;
  level: MuseBleDebugLevel;
  message: string;
};

const CAPTURE_SUBSTRING = '[MuseBLE][DEBUG]';
const MAX_ENTRIES = 600;

let entries: MuseBleDebugEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

/** Toggle without reassigning — read in push() */
export const captureEnabledRef = { current: true };

try {
  if (typeof localStorage !== 'undefined') {
    const v = localStorage.getItem('museBleDebugCaptureEnabled');
    if (v === '0') captureEnabledRef.current = false;
    if (v === '1') captureEnabledRef.current = true;
  }
} catch {
  /* private mode / no storage */
}

function notify(): void {
  for (const l of listeners) l();
}

function formatArg(a: unknown): string {
  if (a instanceof Error) {
    return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
  }
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return args.map(formatArg).join(' ');
}

function shouldCapture(args: unknown[]): boolean {
  const s = formatArgs(args);
  return s.includes(CAPTURE_SUBSTRING);
}

function push(level: MuseBleDebugLevel, args: unknown[]): void {
  if (!captureEnabledRef.current || !shouldCapture(args)) return;
  seq += 1;
  entries.push({
    id: seq,
    t: Date.now(),
    level,
    message: formatArgs(args),
  });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  notify();
}

export function setMuseBleDebugCaptureEnabled(on: boolean): void {
  captureEnabledRef.current = on;
}

export function getMuseBleDebugCaptureEnabled(): boolean {
  return captureEnabledRef.current;
}

export function getMuseBleDebugEntries(): MuseBleDebugEntry[] {
  return entries.slice();
}

export function clearMuseBleDebugEntries(): void {
  entries = [];
  notify();
}

export function subscribeMuseBleDebugEntries(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatMuseBleDebugEntriesForCopy(list: MuseBleDebugEntry[]): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  };
  const lvl = (l: MuseBleDebugLevel) =>
    l === 'log' ? 'LOG' : l === 'warn' ? 'WARN' : 'ERR';
  return list.map((e) => `[${ts(e.t)}] [${lvl(e.level)}] ${e.message}`).join('\n');
}

let installed = false;

/**
 * Patches console.log / warn / error. Original behavior unchanged; matching lines are also stored.
 */
export function installMuseBleConsoleCapture(): void {
  if (installed || typeof console === 'undefined') return;
  installed = true;

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    push('log', args);
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    push('warn', args);
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    push('error', args);
    origErr(...args);
  };
}
