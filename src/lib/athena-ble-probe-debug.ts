/**
 * Temporary Muse S Athena BLE probe: Web Bluetooth only, no muse-js.
 * Subscribes to notify/indicate on all FE8D characteristics and logs raw payloads.
 */

/** Show Start/Stop on Setup + register globals. */
export const DEBUG_ATHENA_BLE_PROBE_UI = true;

const TAG = '[MuseBLE][DEBUG]';
const MUSE_SERVICE = 0xfe8d;

type HandlerRecord = {
  char: BluetoothRemoteGATTCharacteristic;
  fn: (ev: Event) => void;
};

let active: {
  device: BluetoothDevice;
  handlers: HandlerRecord[];
} | null = null;

function hexPreview(u8: Uint8Array, maxBytes = 48): string {
  const n = Math.min(u8.length, maxBytes);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(u8[i]!.toString(16).padStart(2, '0'));
  }
  let s = parts.join(' ');
  if (u8.length > maxBytes) {
    s += ` … (+${u8.length - maxBytes} bytes)`;
  }
  return s;
}

function formatNotificationLog(u8: Uint8Array, packetIndex: number): Record<string, unknown> {
  const fullDetail = packetIndex <= 20 || packetIndex % 100 === 0;
  return {
    byteLength: u8.length,
    hex: hexPreview(u8, fullDetail ? 128 : 48),
    bytesArray: fullDetail ? Array.from(u8.slice(0, Math.min(64, u8.length))) : undefined,
  };
}

export function isAthenaBleProbeActive(): boolean {
  return active !== null;
}

export async function stopAthenaBleProbeDebug(): Promise<void> {
  if (!active) return;
  const { device, handlers } = active;
  active = null;

  for (const { char, fn } of handlers) {
    char.removeEventListener('characteristicvaluechanged', fn);
    try {
      await char.stopNotifications();
    } catch (e) {
      console.warn(`${TAG} athena-probe stopNotifications`, { uuid: char.uuid, err: e });
    }
  }

  try {
    if (device.gatt?.connected) {
      await device.gatt.disconnect();
    }
  } catch (e) {
    console.warn(`${TAG} athena-probe disconnect`, e);
  }

  console.log(`${TAG} athena-probe stopped`);
}

/**
 * requestDevice → connect → FE8D → enumerate characteristics → log props → subscribe notify/indicate → log payloads.
 * Does not call writeValue (writes skipped for safety).
 */
export async function startAthenaBleProbeDebug(): Promise<void> {
  await stopAthenaBleProbeDebug();

  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    console.error(`${TAG} athena-probe Web Bluetooth not available`);
    return;
  }

  console.log(`${TAG} athena-probe begin`);

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [MUSE_SERVICE] }],
  });

  console.log(`${TAG} athena-probe device`, { deviceId: device.id, deviceName: device.name });

  const gatt = device.gatt;
  if (gatt == null) {
    console.error(`${TAG} athena-probe device.gatt is null`);
    return;
  }

  const server = await gatt.connect();
  console.log(`${TAG} athena-probe gatt connected`, { connected: server.connected });

  const service = await server.getPrimaryService(MUSE_SERVICE);
  const chars = await service.getCharacteristics();

  console.log(`${TAG} athena-probe characteristic count`, chars.length);

  const handlers: HandlerRecord[] = [];
  const packetCount = new Map<string, number>();

  for (const char of chars) {
    const props = {
      read: char.properties.read,
      write: char.properties.write,
      writeWithoutResponse: char.properties.writeWithoutResponse ?? false,
      notify: char.properties.notify,
      indicate: char.properties.indicate,
    };

    console.log(`${TAG} athena-probe char props`, { uuid: char.uuid, ...props });

    if (props.write || props.writeWithoutResponse) {
      console.log(`${TAG} athena-probe write-capable (no commands sent — debug safety)`, {
        uuid: char.uuid,
      });
    }

    const canNotify = props.notify || props.indicate;
    if (!canNotify) {
      console.log(`${TAG} athena-probe skip subscribe (no notify/indicate)`, { uuid: char.uuid });
      continue;
    }

    const fn = (ev: Event) => {
      const c = ev.target as BluetoothRemoteGATTCharacteristic;
      const v = c.value;
      if (!v) {
        console.log(`${TAG} athena-probe notify (empty value)`, { uuid: c.uuid });
        return;
      }
      const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      const prev = packetCount.get(c.uuid) ?? 0;
      const n = prev + 1;
      packetCount.set(c.uuid, n);

      const detail = formatNotificationLog(u8, n);
      console.log(`${TAG} athena-probe notify`, { uuid: c.uuid, packetIndex: n, ...detail });
    };

    char.addEventListener('characteristicvaluechanged', fn);
    await char.startNotifications();
    handlers.push({ char, fn });
    console.log(`${TAG} athena-probe subscribed`, { uuid: char.uuid });
  }

  active = { device, handlers };
  console.log(`${TAG} athena-probe listening — call stopAthenaBleProbeDebug() or use Stop in UI`);
}

if (DEBUG_ATHENA_BLE_PROBE_UI && typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  g.__athenaBleProbeStart = startAthenaBleProbeDebug;
  g.__athenaBleProbeStop = stopAthenaBleProbeDebug;
}
