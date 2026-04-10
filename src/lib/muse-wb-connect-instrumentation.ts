/**
 * Temporary: log muse-js–equivalent Web Bluetooth sub-steps during MuseClient.connect().
 *
 * muse-js connect() order (see node_modules/muse-js/dist/muse.js):
 * 1. navigator.bluetooth.requestDevice({ filters: [{ services: [0xfe8d] }] }) — unless gatt passed in
 * 2. device.gatt.connect()
 * 3. gatt.getPrimaryService(0xfe8d)
 * 4. For each stream: getCharacteristic(uuid) then observableCharacteristic() → startNotifications()
 *    Order: control → telemetry → gyro → accel → [PPG×3 if enablePpg] → EEG×4 (or ×5 if enableAux)
 *
 * Does not change connection behavior — only wraps prototypes and logs. Safe no-op if Web Bluetooth missing.
 */

/** Set false to disable wb.* step logs (console + in-app BLE log panel). */
export const DEBUG_MUSE_WB_CONNECT_STEPS = true;

const TAG = '[MuseBLE][DEBUG]';

/** DOM lib exposes GATT types as interfaces — no runtime global for TS `typeof`. Resolve via globalThis. */
function getGlobalConstructor(name: string): ((...args: unknown[]) => unknown) | undefined {
  const c = (globalThis as Record<string, unknown>)[name];
  return typeof c === 'function' ? (c as (...args: unknown[]) => unknown) : undefined;
}

function wb(step: string, detail?: Record<string, unknown>): void {
  if (!DEBUG_MUSE_WB_CONNECT_STEPS) return;
  if (detail !== undefined) {
    console.log(`${TAG} wb.${step}`, detail);
  } else {
    console.log(`${TAG} wb.${step}`);
  }
}

function wbFail(step: string, detail: Record<string, unknown>): void {
  if (!DEBUG_MUSE_WB_CONNECT_STEPS) return;
  console.error(`${TAG} wb.${step}`, detail);
}

let seq = 0;

function nextSeq(): number {
  seq += 1;
  return seq;
}

let installed = false;

export function installMuseWebBluetoothConnectInstrumentation(): void {
  if (!DEBUG_MUSE_WB_CONNECT_STEPS || installed) return;
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    return;
  }
  installed = true;

  const BT = navigator.bluetooth;

  // --- requestDevice ---
  const origRequestDevice = BT.requestDevice.bind(BT);
  BT.requestDevice = function (options?: RequestDeviceOptions) {
    const n = nextSeq();
    const filters = options?.filters?.map((f) => ({
      services: f.services,
      name: f.name,
      namePrefix: f.namePrefix,
    }));
    wb('requestDevice begin', { n, filters, optionalServices: options?.optionalServices });
    return origRequestDevice(options).then(
      (device) => {
        wb('requestDevice ok', {
          n,
          deviceId: device.id,
          deviceName: device.name,
        });
        return device;
      },
      (err: unknown) => {
        wbFail('requestDevice fail', { n, err: formatErr(err) });
        throw err;
      }
    );
  };

  // --- gatt.connect + getPrimaryService (BluetoothRemoteGATTServer.prototype) ---
  const GattServer = getGlobalConstructor('BluetoothRemoteGATTServer');
  if (GattServer?.prototype) {
    const proto = GattServer.prototype as Record<string, unknown>;

    const origConnect = proto.connect;
    if (typeof origConnect === 'function') {
      proto.connect = function (this: unknown) {
        const n = nextSeq();
        wb('gatt.connect begin', { n });
        const p = origConnect.call(this) as Promise<{
          connected: boolean;
          device: { name?: string; id: string };
        }>;
        return p.then(
          (server) => {
            wb('gatt.connect ok', {
              n,
              connected: server.connected,
              device: server.device?.name,
              deviceId: server.device?.id,
            });
            return server;
          },
          (err: unknown) => {
            wbFail('gatt.connect fail', { n, err: formatErr(err) });
            throw err;
          }
        );
      };
    }

    const origGetPrimaryService = proto.getPrimaryService;
    if (typeof origGetPrimaryService === 'function') {
      proto.getPrimaryService = function (this: unknown, service: BluetoothServiceUUID) {
        const n = nextSeq();
        wb('getPrimaryService begin', { n, service: String(service) });
        const p = origGetPrimaryService.call(this, service) as Promise<{ uuid: string }>;
        return p.then(
          (svc) => {
            wb('getPrimaryService ok', { n, serviceUuid: svc.uuid });
            return svc;
          },
          (err: unknown) => {
            wbFail('getPrimaryService fail', { n, service: String(service), err: formatErr(err) });
            throw err;
          }
        );
      };
    }
  }

  // --- getCharacteristic (BluetoothRemoteGATTService.prototype) ---
  const GattService = getGlobalConstructor('BluetoothRemoteGATTService');
  if (GattService?.prototype) {
    const svcProto = GattService.prototype as Record<string, unknown>;
    const origGetChar = svcProto.getCharacteristic;
    if (typeof origGetChar === 'function') {
      svcProto.getCharacteristic = function (
        this: { uuid: string },
        characteristic: BluetoothCharacteristicUUID
      ) {
        const n = nextSeq();
        const cu = String(characteristic);
        wb('getCharacteristic begin', { n, parentServiceUuid: this.uuid, characteristic: cu });
        const p = origGetChar.call(this, characteristic) as Promise<{ uuid: string }>;
        return p.then(
          (ch: { uuid: string }) => {
            wb('getCharacteristic ok', { n, characteristicUuid: ch.uuid, serviceUuid: this.uuid });
            return ch;
          },
          (err: unknown) => {
            wbFail('getCharacteristic fail', {
              n,
              parentServiceUuid: this.uuid,
              characteristic: cu,
              err: formatErr(err),
            });
            throw err;
          }
        );
      };
    }
  }

  // --- startNotifications (BluetoothRemoteGATTCharacteristic.prototype) ---
  const GattCharacteristic = getGlobalConstructor('BluetoothRemoteGATTCharacteristic');
  if (GattCharacteristic?.prototype) {
    const chProto = GattCharacteristic.prototype as Record<string, unknown>;
    const origStart = chProto.startNotifications;
    if (typeof origStart === 'function') {
      chProto.startNotifications = function (this: {
        uuid: string;
        service: { uuid: string } | null;
      }) {
        const n = nextSeq();
        wb('startNotifications begin', {
          n,
          characteristicUuid: this.uuid,
          serviceUuid: this.service?.uuid,
        });
        const p = origStart.call(this) as Promise<BluetoothRemoteGATTCharacteristic>;
        return p.then(
          (resolved: BluetoothRemoteGATTCharacteristic) => {
            wb('startNotifications ok', { n, characteristicUuid: this.uuid });
            return resolved;
          },
          (err: unknown) => {
            wbFail('startNotifications fail', {
              n,
              characteristicUuid: this.uuid,
              serviceUuid: this.service?.uuid,
              err: formatErr(err),
            });
            throw err;
          }
        );
      };
    }
  }
}

function formatErr(err: unknown): Record<string, unknown> {
  if (err instanceof DOMException) {
    return {
      type: 'DOMException',
      name: err.name,
      message: err.message,
      code: err.code,
    };
  }
  if (err instanceof Error) {
    return { type: 'Error', name: err.name, message: err.message, stack: err.stack };
  }
  return { type: typeof err, value: String(err), raw: err };
}
