/**
 * Muse 2 adapter — thin wrapper around the existing MuseHandler (muse-js).
 * Preserves behavior bit-for-bit; all logic remains in muse-handler.ts.
 *
 * TODO(multi-device): When adding Athena / BrainBit, add sibling adapters that implement EEGDevice
 * and delegate to their respective transports/parsers.
 */

import { MuseHandler, museHandler as defaultHandler } from '../muse-handler';
import type { EEGDevice } from './eeg-device';
import {
  MUSE2_DEVICE_CAPABILITIES,
  type EEGDeviceCapabilities,
  type EEGConnectionStateDetail,
  type HeartRateMetrics,
  type PPGDiagnostics,
  type SessionHeartSummary,
} from './eeg-device-types';
import type { EEGDeviceState } from './eeg-device-types';

export class Muse2EEGDevice implements EEGDevice {
  readonly capabilities: EEGDeviceCapabilities = MUSE2_DEVICE_CAPABILITIES;

  private readonly handler: MuseHandler;

  constructor(handler: MuseHandler) {
    this.handler = handler;
  }

  isBluetoothAvailable(): boolean {
    return MuseHandler.isBluetoothAvailable();
  }

  async connectBluetooth(): Promise<void> {
    return this.handler.connectBluetooth();
  }

  async connectOSC(url?: string): Promise<void> {
    return this.handler.connectOSC(url);
  }

  disconnect(): void {
    this.handler.disconnect();
  }

  get connected(): boolean {
    return this.handler.connected;
  }

  get bleTransportConnected(): boolean {
    return this.handler.bleTransportConnected;
  }

  getHealthState() {
    return this.handler.getHealthState();
  }

  getState(): EEGDeviceState {
    return this.handler.getState();
  }

  getElectrodeQuality(): number[] {
    return this.handler.getElectrodeQuality();
  }

  getConnectionStateDetail(): EEGConnectionStateDetail {
    return this.handler.getConnectionStateDetail();
  }

  getPPG(): HeartRateMetrics {
    return this.handler.getPPG();
  }

  getSessionPPGSummary(): SessionHeartSummary {
    return this.handler.getSessionPPGSummary();
  }

  resetSessionPPG(): void {
    this.handler.resetSessionPPG();
  }

  getPPGDiagnostics(): PPGDiagnostics {
    return this.handler.getPPGDiagnostics();
  }

  get accX(): number {
    return this.handler.accX;
  }

  get accY(): number {
    return this.handler.accY;
  }

  get accZ(): number {
    return this.handler.accZ;
  }

  get accelSubscribed(): boolean {
    return this.handler.accelSubscribed;
  }

  get accelSampleCount(): number {
    return this.handler.accelSampleCount;
  }

  get bandsDb() {
    return this.handler.bandsDb;
  }
}

/** Singleton adapter around the existing global MuseHandler — default device for the app. */
export const muse2EegDevice = new Muse2EEGDevice(defaultHandler);
