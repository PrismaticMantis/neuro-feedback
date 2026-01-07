// Muse EEG Handler - Adapted from strudel's muse.mjs
// Supports Web Bluetooth and OSC connections

import { MuseClient } from 'muse-js';
import OSC from 'osc-js';
import { FFTProcessor, FFT_SIZE } from './fft-processor';
import type { BrainwaveBands, MuseState } from '../types';

type ConnectionMode = 'bluetooth' | 'osc' | null;
type BrainState = 'disconnected' | 'deep' | 'meditative' | 'relaxed' | 'focused' | 'neutral';

export interface MuseEventCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onBlink?: () => void;
  onJawClench?: () => void;
  onStateChange?: (newState: string, oldState: string) => void;
  onDataUpdate?: (state: MuseState) => void;
}

export class MuseHandler {
  // Raw brainwave values (0-1 range)
  private _bands: BrainwaveBands = {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
  };

  // Smoothed values
  private _bandsSmooth: BrainwaveBands = {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
  };

  // Auxiliary signals
  private _blink = 0;
  private _jawClench = 0;
  private _touching = false;

  // Accelerometer
  private _accX = 0;
  private _accY = 0;
  private _accZ = 0;

  // Connection state
  private _connected = false;
  private _lastUpdate = 0;
  private _connectionQuality = 0;
  private _connectionMode: ConnectionMode = null;
  private _deviceName: string | null = null;

  // Derived states
  private _dominantWave = 'alpha';
  private _relaxationIndex = 0;
  private _meditationIndex = 0;
  private _focusIndex = 0;

  // Smoothing factor
  smoothingFactor = 0.85;

  // OSC connection
  private osc: OSC | null = null;
  private reconnectInterval: ReturnType<typeof setTimeout> | null = null;

  // Bluetooth connection
  private museClient: MuseClient | null = null;
  private eegSubscription: { unsubscribe: () => void } | null = null;
  private telemetrySubscription: { unsubscribe: () => void } | null = null;
  private accelerometerSubscription: { unsubscribe: () => void } | null = null;
  private connectionStatusSubscription: { unsubscribe: () => void } | null = null;

  // FFT processor
  private fft: FFTProcessor;
  private eegBuffers: number[][] = [[], [], [], []];

  // Event callbacks
  callbacks: MuseEventCallbacks = {};

  // History for visualization
  private _history: Record<string, number[]> = {
    delta: [],
    theta: [],
    alpha: [],
    beta: [],
    gamma: [],
  };
  historyLength = 256;

  isInitialized = false;

  constructor() {
    this.fft = new FFTProcessor(FFT_SIZE);
  }

  /**
   * Check if Web Bluetooth is available
   */
  static isBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && navigator.bluetooth !== undefined;
  }

  /**
   * Connect directly to Muse headband via Bluetooth (BLE)
   */
  async connectBluetooth(): Promise<void> {
    if (!MuseHandler.isBluetoothAvailable()) {
      throw new Error(
        'Web Bluetooth is not available. Please use Chrome, Edge, or Opera browser.'
      );
    }

    if (this._connected) {
      console.log('[Muse] Already connected');
      return;
    }

    try {
      console.log('[Muse] Scanning for BLE devices...');

      this.museClient = new MuseClient();
      await this.museClient.connect();

      this._deviceName = this.museClient.deviceName || 'Muse';
      console.log(`[Muse] Connected to ${this._deviceName} via Bluetooth`);

      await this.museClient.start();

      // Subscribe to EEG readings
      this.eegSubscription = this.museClient.eegReadings.subscribe(
        (reading: { electrode: number; samples: number[]; timestamp: number }) => {
          this.handleBluetoothEEG(reading);
        }
      );

      // Subscribe to accelerometer
      if (this.museClient.accelerometerData) {
        this.accelerometerSubscription = this.museClient.accelerometerData.subscribe(
          (acc: { samples: { x: number; y: number; z: number }[] }) => {
            const lastSample = acc.samples[acc.samples.length - 1];
            if (lastSample) {
              this._accX = lastSample.x;
              this._accY = lastSample.y;
              this._accZ = lastSample.z;
            }
          }
        );
      }

      this._connected = true;
      this._connectionMode = 'bluetooth';
      this._touching = true;
      this._connectionQuality = 1;
      this.isInitialized = true;
      this._lastUpdate = Date.now();

      this.callbacks.onConnect?.();

      // Handle disconnection
      this.connectionStatusSubscription = this.museClient.connectionStatus.subscribe(
        (status: boolean) => {
          if (!status) {
            this.handleBluetoothDisconnect();
          }
        }
      );
    } catch (error) {
      console.error('[Muse] Bluetooth connection failed:', error);
      this.museClient = null;
      throw error;
    }
  }

  /**
   * Handle incoming EEG data from Bluetooth
   */
  private handleBluetoothEEG(reading: {
    electrode: number;
    samples: number[];
    timestamp: number;
  }): void {
    this._lastUpdate = Date.now();

    const channel = reading.electrode;
    if (channel < 0 || channel > 3) return;

    // Add samples to buffer
    for (const sample of reading.samples) {
      this.eegBuffers[channel].push(sample);
    }

    // Keep buffer at FFT size
    while (this.eegBuffers[channel].length > FFT_SIZE) {
      this.eegBuffers[channel].shift();
    }

    // Process when we have enough samples (only on channel 0)
    if (channel === 0 && this.eegBuffers[0].length >= FFT_SIZE) {
      this.processBluetoothFFT();
    }
  }

  /**
   * Process EEG buffers with FFT to extract band powers
   */
  private processBluetoothFFT(): void {
    const bandPowers = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
    let validChannels = 0;

    for (let ch = 0; ch < 4; ch++) {
      if (this.eegBuffers[ch].length < FFT_SIZE) continue;

      const filtered = this.fft.highPassFilter(this.eegBuffers[ch], 1.0);
      const magnitudes = this.fft.compute(filtered);

      bandPowers.delta += this.fft.getBandPower(magnitudes, 1, 4);
      bandPowers.theta += this.fft.getBandPower(magnitudes, 4, 8);
      bandPowers.alpha += this.fft.getBandPower(magnitudes, 8, 13);
      bandPowers.beta += this.fft.getBandPower(magnitudes, 13, 30);
      bandPowers.gamma += this.fft.getBandPower(magnitudes, 30, 44);

      validChannels++;
    }

    if (validChannels === 0) return;

    // Average across channels
    for (const band in bandPowers) {
      bandPowers[band as keyof typeof bandPowers] /= validChannels;
    }

    // Apply 1/f correction
    bandPowers.theta *= 1.5;
    bandPowers.alpha *= 2.0;
    bandPowers.beta *= 3.0;
    bandPowers.gamma *= 4.0;

    // Convert to relative powers (0-1 range)
    const totalPower =
      bandPowers.delta +
      bandPowers.theta +
      bandPowers.alpha +
      bandPowers.beta +
      bandPowers.gamma;

    if (totalPower > 0) {
      this.updateBand('delta', bandPowers.delta / totalPower);
      this.updateBand('theta', bandPowers.theta / totalPower);
      this.updateBand('alpha', bandPowers.alpha / totalPower);
      this.updateBand('beta', bandPowers.beta / totalPower);
      this.updateBand('gamma', bandPowers.gamma / totalPower);
    }
  }

  /**
   * Handle Bluetooth disconnection
   */
  private handleBluetoothDisconnect(): void {
    console.log('[Muse] Bluetooth disconnected');

    this.eegSubscription?.unsubscribe();
    this.telemetrySubscription?.unsubscribe();
    this.accelerometerSubscription?.unsubscribe();
    this.connectionStatusSubscription?.unsubscribe();

    this.eegSubscription = null;
    this.telemetrySubscription = null;
    this.accelerometerSubscription = null;
    this.connectionStatusSubscription = null;
    this.museClient = null;

    this._connected = false;
    this._connectionMode = null;
    this._deviceName = null;
    this.isInitialized = false;
    this.eegBuffers = [[], [], [], []];

    this.callbacks.onDisconnect?.();
  }

  /**
   * Connect via OSC bridge
   */
  async connectOSC(url: string = 'ws://localhost:8080'): Promise<void> {
    if (this.osc) {
      console.log('[Muse] Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Parse URL for host and port
        const urlObj = new URL(url);
        const host = urlObj.hostname;
        const port = parseInt(urlObj.port) || 8080;
        const secure = urlObj.protocol === 'wss:';

        this.osc = new OSC({
          plugin: new OSC.WebsocketClientPlugin({ host, port, secure }),
        });

        this.osc.on('open', () => {
          console.log('[Muse] Connected to OSC bridge');
          this._connected = true;
          this._connectionMode = 'osc';
          this.isInitialized = true;
          this.callbacks.onConnect?.();
          resolve();
        });

        this.osc.on('close', () => {
          console.log('[Muse] Disconnected from OSC bridge');
          this._connected = false;
          this._connectionMode = null;
          this.osc = null;
          this.callbacks.onDisconnect?.();

          if (!this.reconnectInterval) {
            this.reconnectInterval = setTimeout(() => {
              this.reconnectInterval = null;
              if (!this._connected) {
                console.log('[Muse] Attempting to reconnect...');
                this.connectOSC(url).catch(() => {});
              }
            }, 3000);
          }
        });

        this.osc.on('error', (error: Error) => {
          console.error('[Muse] OSC error:', error);
          reject(error);
        });

        this.osc.on('*', (message: { address: string; args: number[] }) => {
          this.handleOSCMessage(message);
        });

        this.osc.open();
      } catch (error) {
        console.error('[Muse] Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Parse incoming OSC message
   */
  private handleOSCMessage(message: { address: string; args: number[] }): void {
    try {
      const { address, args } = message;
      if (!address) return;

      this._lastUpdate = Date.now();

      switch (address) {
        case '/muse/elements/delta_relative':
          this.updateBand('delta', this.parseValue(args));
          break;
        case '/muse/elements/theta_relative':
          this.updateBand('theta', this.parseValue(args));
          break;
        case '/muse/elements/alpha_relative':
          this.updateBand('alpha', this.parseValue(args));
          break;
        case '/muse/elements/beta_relative':
          this.updateBand('beta', this.parseValue(args));
          break;
        case '/muse/elements/gamma_relative':
          this.updateBand('gamma', this.parseValue(args));
          break;
        case '/muse/blink':
          this._blink = this.parseValue(args) > 0 ? 1 : 0;
          if (this._blink) this.callbacks.onBlink?.();
          break;
        case '/muse/jaw_clench':
          this._jawClench = this.parseValue(args) > 0 ? 1 : 0;
          if (this._jawClench) this.callbacks.onJawClench?.();
          break;
        case '/muse/acc':
          if (Array.isArray(args) && args.length >= 3) {
            this._accX = args[0];
            this._accY = args[1];
            this._accZ = args[2];
          }
          break;
        case '/muse/elements/horseshoe':
          if (Array.isArray(args) && args.length >= 4) {
            const quality =
              args.reduce((sum, v) => sum + (v === 1 ? 1 : v === 2 ? 0.5 : 0), 0) / 4;
            this._connectionQuality = quality;
            this._touching = quality > 0.25;
          }
          break;
        case '/muse/elements/touching_forehead':
          this._touching = this.parseValue(args) > 0;
          break;
      }
    } catch {
      // Silently ignore parse errors
    }
  }

  private parseValue(args: number | number[]): number {
    if (Array.isArray(args)) {
      const valid = args.filter((v) => typeof v === 'number' && !isNaN(v) && isFinite(v));
      if (valid.length === 0) return 0;
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    }
    return typeof args === 'number' ? args : 0;
  }

  /**
   * Update a brainwave band with smoothing
   */
  private updateBand(band: keyof BrainwaveBands, value: number): void {
    value = Math.max(0, Math.min(1, value));
    this._bands[band] = value;

    this._bandsSmooth[band] =
      this._bandsSmooth[band] * this.smoothingFactor + value * (1 - this.smoothingFactor);

    this._history[band].push(value);
    if (this._history[band].length > this.historyLength) {
      this._history[band].shift();
    }

    this.updateDerivedStates();
    this.emitDataUpdate();
  }

  /**
   * Calculate derived brain states
   */
  private updateDerivedStates(): void {
    const { delta, theta, alpha, beta, gamma } = this._bandsSmooth;

    const waves: Record<string, number> = { delta, theta, alpha, beta, gamma };
    const oldDominant = this._dominantWave;
    this._dominantWave = Object.entries(waves).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];

    if (oldDominant !== this._dominantWave) {
      this.callbacks.onStateChange?.(this._dominantWave, oldDominant);
    }

    const relaxNum = alpha + theta;
    const relaxDen = beta + gamma + 0.001;
    this._relaxationIndex = Math.min(relaxNum / relaxDen, 2) / 2;

    this._meditationIndex = theta / (alpha + 0.001);
    this._meditationIndex = Math.min(this._meditationIndex, 2) / 2;

    this._focusIndex = beta / (alpha + theta + 0.001);
    this._focusIndex = Math.min(this._focusIndex, 2) / 2;
  }

  private emitDataUpdate(): void {
    this.callbacks.onDataUpdate?.(this.getState());
  }

  /**
   * Disconnect from current connection
   */
  disconnect(): void {
    // Disconnect Bluetooth
    if (this.museClient) {
      this.eegSubscription?.unsubscribe();
      this.telemetrySubscription?.unsubscribe();
      this.accelerometerSubscription?.unsubscribe();
      this.connectionStatusSubscription?.unsubscribe();
      this.museClient.disconnect();
      this.museClient = null;
    }

    // Disconnect OSC
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.osc) {
      this.osc.close();
      this.osc = null;
    }

    this._connected = false;
    this._connectionMode = null;
    this._deviceName = null;
    this.isInitialized = false;
    this.eegBuffers = [[], [], [], []];
  }

  /**
   * Get current brain state
   */
  getBrainState(): BrainState {
    if (!this._connected || !this._touching) {
      return 'disconnected';
    }

    const { delta } = this._bandsSmooth;
    const m = this._meditationIndex;
    const r = this._relaxationIndex;
    const f = this._focusIndex;

    if (delta > 0.4) return 'deep';
    if (m > 0.6) return 'meditative';
    if (r > 0.6) return 'relaxed';
    if (f > 0.6) return 'focused';
    return 'neutral';
  }

  /**
   * Check if still receiving data
   */
  isReceivingData(): boolean {
    return Date.now() - this._lastUpdate < 2000;
  }

  /**
   * Get full state object
   */
  getState(): MuseState {
    return {
      connected: this._connected && this.isReceivingData(),
      connectionMode: this._connectionMode,
      deviceName: this._deviceName,
      touching: this._touching,
      connectionQuality: this._connectionQuality,
      bands: { ...this._bands },
      bandsSmooth: { ...this._bandsSmooth },
      relaxationIndex: this._relaxationIndex,
      meditationIndex: this._meditationIndex,
      focusIndex: this._focusIndex,
    };
  }

  /**
   * Get history for visualization
   */
  getHistory(band: keyof BrainwaveBands): number[] {
    return this._history[band] || [];
  }

  // Getters
  get connected(): boolean {
    return this._connected && this.isReceivingData();
  }
  get connectionMode(): ConnectionMode {
    return this._connectionMode;
  }
  get deviceName(): string | null {
    return this._deviceName;
  }
  get bands(): BrainwaveBands {
    return { ...this._bands };
  }
  get bandsSmooth(): BrainwaveBands {
    return { ...this._bandsSmooth };
  }
  get touching(): boolean {
    return this._touching;
  }
  get connectionQuality(): number {
    return this._connectionQuality;
  }
  get relaxationIndex(): number {
    return this._relaxationIndex;
  }
  get meditationIndex(): number {
    return this._meditationIndex;
  }
  get focusIndex(): number {
    return this._focusIndex;
  }
  get accX(): number {
    return this._accX;
  }
  get accY(): number {
    return this._accY;
  }
  get accZ(): number {
    return this._accZ;
  }
}

// Singleton instance
export const museHandler = new MuseHandler();
