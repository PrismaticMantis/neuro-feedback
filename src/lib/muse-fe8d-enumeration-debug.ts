/**
 * Temporary: Web Bluetooth–only FE8D service enumeration (no muse-js).
 * Compare sorted characteristic UUID + property lists between Muse 2 vs Muse S Athena.
 */

/** Show "Enumerate FE8D (debug)" on Session Setup and expose `globalThis.__museFe8dEnumerationDebug`. */
export const DEBUG_MUSE_FE8D_ENUM_UI = true;

const TAG = '[MuseBLE][DEBUG]';
const MUSE_SERVICE = 0xfe8d;

export type Fe8dEnumCharacteristicRow = {
  uuid: string;
  read: boolean;
  write: boolean;
  notify: boolean;
  indicate: boolean;
};

export type Fe8dEnumerationResult = {
  deviceId: string;
  deviceName: string;
  serviceUuid: string;
  characteristics: Fe8dEnumCharacteristicRow[];
};

/**
 * requestDevice → gatt.connect → getPrimaryService(fe8d) → getCharacteristics() → log → disconnect.
 * Does not touch MuseHandler / muse-js.
 */
export async function runMuseFe8dEnumerationDebug(): Promise<Fe8dEnumerationResult | null> {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    console.error(`${TAG} fe8d-enum Web Bluetooth not available`);
    return null;
  }

  let device: BluetoothDevice | null = null;

  try {
    console.log(`${TAG} fe8d-enum begin`, { service: `0x${MUSE_SERVICE.toString(16)}`, MUSE_SERVICE });

    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [MUSE_SERVICE] }],
    });

    console.log(`${TAG} fe8d-enum device selected`, {
      deviceId: device.id,
      deviceName: device.name,
    });

    const gatt = device.gatt;
    if (gatt == null) {
      console.error(`${TAG} fe8d-enum device.gatt is null — cannot continue`);
      return null;
    }

    const server = await gatt.connect();
    console.log(`${TAG} fe8d-enum gatt connected`, { connected: server.connected });

    const service = await server.getPrimaryService(MUSE_SERVICE);
    console.log(`${TAG} fe8d-enum primary service`, { serviceUuid: service.uuid });

    const chars = await service.getCharacteristics();
    const rows: Fe8dEnumCharacteristicRow[] = chars.map((c) => ({
      uuid: c.uuid,
      read: c.properties.read,
      write: c.properties.write,
      notify: c.properties.notify,
      indicate: c.properties.indicate,
    }));

    rows.sort((a, b) => a.uuid.localeCompare(b.uuid, undefined, { sensitivity: 'base' }));

    const uuidsOnly = rows.map((r) => r.uuid);

    console.log(`${TAG} fe8d-enum characteristic count`, rows.length);
    console.log(`${TAG} fe8d-enum uuids sorted (copy for diff)`, JSON.stringify(uuidsOnly));
    console.log(`${TAG} fe8d-enum full table (uuid + properties)`, JSON.stringify(rows));

    for (const r of rows) {
      console.log(`${TAG} fe8d-enum char`, r);
    }

    console.log(`${TAG} fe8d-enum done (success)`);

    return {
      deviceId: device.id,
      deviceName: device.name ?? '',
      serviceUuid: service.uuid,
      characteristics: rows,
    };
  } catch (e) {
    console.error(`${TAG} fe8d-enum fail`, e);
    throw e;
  } finally {
    if (device?.gatt?.connected) {
      try {
        await device.gatt.disconnect();
        console.log(`${TAG} fe8d-enum disconnected`);
      } catch (e) {
        console.warn(`${TAG} fe8d-enum disconnect warning`, e);
      }
    }
  }
}

if (DEBUG_MUSE_FE8D_ENUM_UI && typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__museFe8dEnumerationDebug = runMuseFe8dEnumerationDebug;
}
