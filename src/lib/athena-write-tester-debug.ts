/**
 * Temporary Muse S Athena manual write tester (Web Bluetooth only, no muse-js).
 * One manual write at a time; no hardcoded handshake payloads.
 */

export const DEBUG_ATHENA_WRITE_TESTER_UI = true;

const TAG = '[MuseBLE][DEBUG]';
const SUBTAG = 'athena-write-tester';
const MUSE_SERVICE = 0xfe8d;

/** Full 128-bit UUIDs (lowercase) — matches Athena FE8D layout. */
export const ATHENA_WRITE_TESTER_UUIDS = {
  c0001: '273e0001-4c4d-454d-96be-f03bac821358',
  c0013: '273e0013-4c4d-454d-96be-f03bac821358',
  c0014: '273e0014-4c4d-454d-96be-f03bac821358',
  c0015: '273e0015-4c4d-454d-96be-f03bac821358',
} as const;

export type AthenaWriteTargetId = 'c0001' | 'c0014' | 'c0015';

export type AthenaWriteMode = 'withResponse' | 'withoutResponse';

const STREAM_KEYS = ['c0013', 'c0014', 'c0015'] as const;

type NotifHandler = (ev: Event) => void;

type Session = {
  device: BluetoothDevice;
  characteristics: Map<string, BluetoothRemoteGATTCharacteristic>;
  streamHandlers: Array<{ uuid: string; fn: NotifHandler }>;
  /** per-source UUID notification index */
  notifyCounts: Map<string, number>;
};

let session: Session | null = null;

const MAX_PAYLOAD_BYTES = 512;

export function isAthenaWriteTesterActive(): boolean {
  return session !== null;
}

function wb(msg: string, detail?: Record<string, unknown>): void {
  if (detail !== undefined) {
    console.log(`${TAG} ${SUBTAG} ${msg}`, detail);
  } else {
    console.log(`${TAG} ${SUBTAG} ${msg}`);
  }
}

function wbErr(msg: string, detail?: Record<string, unknown>): void {
  if (detail !== undefined) {
    console.error(`${TAG} ${SUBTAG} ${msg}`, detail);
  } else {
    console.error(`${TAG} ${SUBTAG} ${msg}`);
  }
}

/**
 * Parse hex from "aa bb cc", "aabbcc", "0xaa 0xbb", commas optional.
 */
export function parseHexPayload(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Empty payload — enter hex bytes (e.g. 01 02 ab).');
  }
  const normalized = trimmed
    .replace(/0x/gi, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hexOnly = normalized.replace(/[^0-9a-fA-F]/g, '');
  if (hexOnly.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of nibbles.');
  }
  const out = new Uint8Array(hexOnly.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hexOnly.slice(i * 2, i * 2 + 2), 16);
  }
  if (out.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
  }
  return out;
}

function makeNotifyHandler(sourceUuid: string): NotifHandler {
  return (ev: Event) => {
    const s = session;
    if (!s) return;
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    const v = ch.value;
    const n = (s.notifyCounts.get(sourceUuid) ?? 0) + 1;
    s.notifyCounts.set(sourceUuid, n);
    const t = Date.now();
    const perf = typeof performance !== 'undefined' ? performance.now() : null;
    if (!v || v.byteLength === 0) {
      wb('notify (empty value)', { sourceUuid, packetIndex: n, wallMs: t, performanceNow: perf });
      return;
    }
    const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    const hex = [...u8.slice(0, Math.min(64, u8.length))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const more = u8.length > 64 ? ` … (+${u8.length - 64} bytes)` : '';
    wb('notify', {
      sourceUuid,
      packetIndex: n,
      byteLength: u8.length,
      wallMs: t,
      performanceNow: perf,
      hexPreview: hex + more,
      bytesArray: Array.from(u8),
    });
  };
}

/**
 * Connect, resolve FE8D + four characteristics, subscribe to 0013/0014/0015 (listen before any write).
 */
export async function connectAthenaWriteTester(): Promise<void> {
  if (session) {
    await disconnectAthenaWriteTester();
  }
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('Web Bluetooth not available');
  }

  wb('connect begin');

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [MUSE_SERVICE] }],
  });

  const gatt = device.gatt;
  if (!gatt) {
    throw new Error('device.gatt is null');
  }

  const server = await gatt.connect();
  wb('gatt connected', { connected: server.connected, deviceId: device.id, deviceName: device.name });

  const svc = await server.getPrimaryService(MUSE_SERVICE);
  const characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();

  const charKeys = ['c0001', 'c0013', 'c0014', 'c0015'] as const;
  for (const key of charKeys) {
    const uuid = ATHENA_WRITE_TESTER_UUIDS[key];
    const ch = await svc.getCharacteristic(uuid);
    characteristics.set(key, ch);
    wb('characteristic resolved', {
      key,
      uuid: ch.uuid,
      props: {
        read: ch.properties.read,
        write: ch.properties.write,
        writeWithoutResponse: ch.properties.writeWithoutResponse,
        notify: ch.properties.notify,
        indicate: ch.properties.indicate,
      },
    });
  }

  const streamHandlers: Array<{ uuid: string; fn: NotifHandler }> = [];
  const notifyCounts = new Map<string, number>();

  for (const key of STREAM_KEYS) {
    const ch = characteristics.get(key)!;
    const uuid = ch.uuid;
    notifyCounts.set(uuid, 0);
    const fn = makeNotifyHandler(uuid);
    ch.addEventListener('characteristicvaluechanged', fn as EventListener);
    await ch.startNotifications();
    streamHandlers.push({ uuid, fn });
    wb('subscribed stream listener', { key, uuid });
  }

  session = {
    device,
    characteristics,
    streamHandlers,
    notifyCounts,
  };

  wb('session ready — stream listeners active; you may send one manual write at a time');
}

export async function disconnectAthenaWriteTester(): Promise<void> {
  if (!session) return;
  const { device, characteristics, streamHandlers } = session;
  session = null;

  for (const { uuid, fn } of streamHandlers) {
    const ch = [...characteristics.values()].find(
      (c) => c.uuid.toLowerCase() === uuid.toLowerCase()
    );
    if (ch) {
      ch.removeEventListener('characteristicvaluechanged', fn as EventListener);
      try {
        await ch.stopNotifications();
      } catch (e) {
        wbErr('stopNotifications', { uuid, err: e });
      }
    }
  }

  try {
    if (device.gatt?.connected) {
      await device.gatt.disconnect();
    }
  } catch (e) {
    wbErr('disconnect', { err: e });
  }

  wb('disconnected');
}

function resolveWriteModeForTarget(
  target: AthenaWriteTargetId,
  requested: AthenaWriteMode,
  ch: BluetoothRemoteGATTCharacteristic
): AthenaWriteMode {
  if (target === 'c0001' || target === 'c0015') {
    if (!ch.properties.writeWithoutResponse) {
      throw new Error(`Characteristic ${target} has no writeWithoutResponse — aborting.`);
    }
    return 'withoutResponse';
  }
  if (target === 'c0014') {
    if (requested === 'withResponse' && !ch.properties.write) {
      throw new Error('0014: write (with response) not available on this characteristic.');
    }
    if (requested === 'withoutResponse' && !ch.properties.writeWithoutResponse) {
      throw new Error('0014: writeWithoutResponse not available — try with response.');
    }
    return requested;
  }
  return requested;
}

/**
 * Single manual write. Call only while session active (after connect, before disconnect).
 */
export async function sendAthenaWriteTesterPayload(
  target: AthenaWriteTargetId,
  payload: Uint8Array,
  mode: AthenaWriteMode
): Promise<void> {
  if (!session) {
    throw new Error('No active session — connect first.');
  }
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload too large (max ${MAX_PAYLOAD_BYTES}).`);
  }

  const ch = session.characteristics.get(target);
  if (!ch) {
    throw new Error(`Unknown target ${target}`);
  }

  const effectiveMode = resolveWriteModeForTarget(target, mode, ch);
  const t0 = Date.now();
  const p0 = typeof performance !== 'undefined' ? performance.now() : null;

  const bytesCopy = new Uint8Array(payload);
  const hex = [...bytesCopy].map((b) => b.toString(16).padStart(2, '0')).join(' ');

  wb('WRITE begin', {
    target,
    characteristicUuid: ch.uuid,
    byteLength: bytesCopy.length,
    bytesHex: hex,
    bytesArray: Array.from(bytesCopy),
    modeRequested: mode,
    modeEffective: effectiveMode,
    wallMs: t0,
    performanceNow: p0,
  });

  const dataView = new DataView(
    bytesCopy.buffer,
    bytesCopy.byteOffset,
    bytesCopy.byteLength
  );

  if (effectiveMode === 'withoutResponse') {
    const wwr = (
      ch as BluetoothRemoteGATTCharacteristic & {
        writeValueWithoutResponse?(value: BufferSource): Promise<void>;
      }
    ).writeValueWithoutResponse;
    if (typeof wwr !== 'function') {
      throw new Error('writeValueWithoutResponse not supported in this browser for this characteristic.');
    }
    await wwr.call(ch, dataView);
  } else {
    await ch.writeValue(dataView);
  }

  const t1 = Date.now();
  const p1 = typeof performance !== 'undefined' ? performance.now() : null;

  wb('WRITE end', {
    target,
    characteristicUuid: ch.uuid,
    wallMs: t1,
    performanceNow: p1,
    durationMsApprox: t1 - t0,
  });
}

if (DEBUG_ATHENA_WRITE_TESTER_UI && typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  g.__athenaWriteTesterConnect = connectAthenaWriteTester;
  g.__athenaWriteTesterDisconnect = disconnectAthenaWriteTester;
  g.__athenaWriteTesterSend = sendAthenaWriteTesterPayload;
}
