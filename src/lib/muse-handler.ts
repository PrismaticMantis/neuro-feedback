// Muse EEG Handler - Adapted from strudel's muse.mjs
// Supports Web Bluetooth and OSC connections

import { MuseClient } from 'muse-js';
import OSC from 'osc-js';
import { FFTProcessor, FFT_SIZE } from './fft-processor';
import type { BrainwaveBands, BrainwaveBandsDb, MuseState } from '../types';

// Feature flag for PPG (photoplethysmography) heart rate modulation
// When false, all PPG behavior is disabled and app behaves identically to current version
// To disable: set ENABLE_PPG_MODULATION = false
export const ENABLE_PPG_MODULATION = true;

// Debug flag for PPG logging (temporary, for verification)
// Set to true to enable throttled debug logs for PPG BPM/confidence
// To disable: set DEBUG_PPG = false
export const DEBUG_PPG = false;

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

  // Absolute power in dB (10 * log10(power))
  private _bandsDb: BrainwaveBandsDb = {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
  };

  // Smoothed dB values
  private _bandsDbSmooth: BrainwaveBandsDb = {
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
  
  // Disconnect debouncing (prevent false positives)
  private _signalPausedSince: number | null = null; // Timestamp when signal pause started
  private _disconnectDebounceMs = 4000; // Require 4 seconds of no data before marking disconnected
  private _lastDisconnectReason: string | null = null; // Debug: why disconnect was triggered
  
  // Electrode quality (horseshoe indicator): [TP9, AF7, AF8, TP10]
  // Values: 1 = good, 2 = medium, 3 = poor, 4 = off
  private _electrodeQuality: number[] = [4, 4, 4, 4];

  // Battery percentage (0-100)
  private _batteryLevel: number = -1; // -1 = unknown

  // Derived states
  private _dominantWave = 'alpha';
  private _relaxationIndex = 0;
  private _meditationIndex = 0;
  private _focusIndex = 0;

  // Smoothing factor (lower = more responsive, higher = more stable)
  smoothingFactor = 0.7;

  // OSC connection
  private osc: OSC | null = null;
  private reconnectInterval: ReturnType<typeof setTimeout> | null = null;

  // Bluetooth connection
  private museClient: MuseClient | null = null;
  private eegSubscription: { unsubscribe: () => void } | null = null;
  private telemetrySubscription: { unsubscribe: () => void } | null = null;
  private accelerometerSubscription: { unsubscribe: () => void } | null = null;
  private connectionStatusSubscription: { unsubscribe: () => void } | null = null;
  private ppgSubscription: { unsubscribe: () => void } | null = null; // PPG (heart rate) subscription

  // PPG (photoplethysmography) heart rate tracking (only if ENABLE_PPG_MODULATION is true)
  private ppgBuffer: Array<{ value: number; timestamp: number }> = []; // Ring buffer for PPG samples
  private ppgBufferMaxSize = 1000; // Store ~10 seconds at 100Hz
  private ppgPeakTimestamps: number[] = []; // Timestamps of detected peaks
  private ppgSmoothed: number = 0; // Smoothed PPG signal for peak detection
  private ppgBPM: number | null = null; // Current BPM estimate
  private ppgBPMConfidence: number = 0; // Confidence 0-1
  private ppgLastBeatMs: number | null = null; // Timestamp of last detected beat
  private ppgSmoothingAlpha = 0.1; // EMA smoothing for raw signal
  private ppgBPMSmoothingAlpha = 0.1; // EMA smoothing for BPM (heavy smoothing)
  private ppgMinRefractoryPeriod = 300; // Minimum time between peaks (ms) - prevents double detection
  private ppgLastPeakTime = 0; // Timestamp of last detected peak
  private ppgLastLogTime: number = 0; // For throttled debug logging

  // FFT processor
  private fft: FFTProcessor;
  private eegBuffers: number[][] = [[], [], [], []];
  
  // Electrode signal quality tracking (for Bluetooth)
  private eegAmplitudes: number[] = [0, 0, 0, 0];
  private eegVariances: number[] = [0, 0, 0, 0];

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

      // Subscribe to telemetry (battery level)
      if (this.museClient.telemetryData) {
        this.telemetrySubscription = this.museClient.telemetryData.subscribe(
          (telemetry: { batteryLevel: number; temperature: number }) => {
            this._batteryLevel = Math.round(telemetry.batteryLevel);
          }
        );
      }

      // Subscribe to PPG (photoplethysmography) for heart rate (if feature enabled)
      if (ENABLE_PPG_MODULATION && this.museClient.ppgReadings) {
        this.ppgSubscription = this.museClient.ppgReadings.subscribe(
          (ppg) => {
            this.handlePPGReading(ppg);
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
    const now = Date.now();
    this._lastUpdate = now;
    
    // Reset signal pause tracking if we're receiving data
    if (this._signalPausedSince !== null) {
      const pauseDuration = now - this._signalPausedSince;
      if (pauseDuration > 1000) {
        // Only log if pause was significant (>1s)
        console.log(`[Muse] Signal resumed after ${pauseDuration}ms pause`);
      }
      this._signalPausedSince = null;
    }

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

    // Update electrode quality from signal characteristics
    this.updateBluetoothElectrodeQuality(channel, reading.samples);

    // Process when we have enough samples (only on channel 0)
    if (channel === 0 && this.eegBuffers[0].length >= FFT_SIZE) {
      this.processBluetoothFFT();
    }
  }

  /**
   * Derive electrode quality from EEG signal characteristics (for Bluetooth).
   * Uses responsive smoothing so contact changes show within ~0.5s.
   */
  private updateBluetoothElectrodeQuality(channel: number, samples: number[]): void {
    if (samples.length === 0) return;

    const validSamples = samples.filter(s => isFinite(s) && !isNaN(s));
    if (validSamples.length === 0) {
      this._electrodeQuality[channel] = 4; // off
      this.eegAmplitudes[channel] = 0;
      this.eegVariances[channel] = 0;
      return;
    }

    const mean = validSamples.reduce((a, b) => a + b, 0) / validSamples.length;
    const absAmplitude = validSamples.reduce((a, b) => a + Math.abs(b - mean), 0) / validSamples.length;
    const variance = validSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / validSamples.length;

    // More responsive smoothing (0.7) so UI updates within ~0.5s when headset moves
    const smooth = 0.7;
    this.eegAmplitudes[channel] = this.eegAmplitudes[channel] * smooth + absAmplitude * (1 - smooth);
    this.eegVariances[channel] = this.eegVariances[channel] * smooth + variance * (1 - smooth);

    const amp = this.eegAmplitudes[channel];
    const vari = this.eegVariances[channel];

    let quality: number;
    if (amp < 1 || vari < 1) {
      quality = 4; // off
    } else if (amp > 1000 || vari > 100000) {
      quality = 3; // poor
    } else if (amp > 500 || vari > 50000) {
      quality = 2; // medium
    } else {
      quality = 1; // good
    }

    this._electrodeQuality[channel] = quality;

    // Update overall connection quality
    const avgQuality = this._electrodeQuality.reduce((sum, v) => sum + (v === 1 ? 1 : v === 2 ? 0.5 : 0), 0) / 4;
    this._connectionQuality = avgQuality;
    this._touching = avgQuality > 0.1;
  }

  /**
   * Process EEG buffers with FFT to extract band powers
   */
  private processBluetoothFFT(): void {
    const bandPowers = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
    const bandPowersSum = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
    let validChannels = 0;

    for (let ch = 0; ch < 4; ch++) {
      if (this.eegBuffers[ch].length < FFT_SIZE) continue;

      const filtered = this.fft.highPassFilter(this.eegBuffers[ch], 1.0);
      const magnitudes = this.fft.compute(filtered);

      // Average power (for relative calculation)
      bandPowers.delta += this.fft.getBandPower(magnitudes, 1, 4);
      bandPowers.theta += this.fft.getBandPower(magnitudes, 4, 8);
      bandPowers.alpha += this.fft.getBandPower(magnitudes, 8, 13);
      bandPowers.beta += this.fft.getBandPower(magnitudes, 13, 30);
      bandPowers.gamma += this.fft.getBandPower(magnitudes, 30, 44);

      // Sum power (for absolute dB calculation)
      bandPowersSum.delta += this.fft.getBandPowerSum(magnitudes, 1, 4);
      bandPowersSum.theta += this.fft.getBandPowerSum(magnitudes, 4, 8);
      bandPowersSum.alpha += this.fft.getBandPowerSum(magnitudes, 8, 13);
      bandPowersSum.beta += this.fft.getBandPowerSum(magnitudes, 13, 30);
      bandPowersSum.gamma += this.fft.getBandPowerSum(magnitudes, 30, 44);

      validChannels++;
    }

    if (validChannels === 0) return;

    // Average across channels
    for (const band in bandPowers) {
      bandPowers[band as keyof typeof bandPowers] /= validChannels;
      bandPowersSum[band as keyof typeof bandPowersSum] /= validChannels;
    }

    // Calculate absolute dB values using sum power (not averaged)
    // This matches Mind Monitor's convention which shows ~90-130 dB
    // dB = 10 * log10(power_sum), reference is 1 µV²
    const MIN_POWER = 1e-12;
    const dbDelta = 10 * Math.log10(Math.max(bandPowersSum.delta, MIN_POWER));
    const dbTheta = 10 * Math.log10(Math.max(bandPowersSum.theta, MIN_POWER));
    const dbAlpha = 10 * Math.log10(Math.max(bandPowersSum.alpha, MIN_POWER));
    const dbBeta = 10 * Math.log10(Math.max(bandPowersSum.beta, MIN_POWER));
    const dbGamma = 10 * Math.log10(Math.max(bandPowersSum.gamma, MIN_POWER));
    
    this.updateBandDb('delta', dbDelta);
    this.updateBandDb('theta', dbTheta);
    this.updateBandDb('alpha', dbAlpha);
    this.updateBandDb('beta', dbBeta);
    this.updateBandDb('gamma', dbGamma);

    // Apply 1/f correction for relative power calculation
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
   * Handle Bluetooth disconnection (transport-level, from connectionStatus subscription)
   */
  private handleBluetoothDisconnect(): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this._lastUpdate;
    
    console.warn('[Muse] 🔴 Bluetooth transport disconnected', {
      timeSinceLastUpdate,
      batteryLevel: this._batteryLevel,
      electrodeQuality: this._electrodeQuality,
      connectionQuality: this._connectionQuality,
      lastDisconnectReason: this._lastDisconnectReason || 'Transport-level disconnect',
    });
    
    this._lastDisconnectReason = 'Bluetooth transport disconnected';

    this.eegSubscription?.unsubscribe();
    this.telemetrySubscription?.unsubscribe();
    this.accelerometerSubscription?.unsubscribe();
    this.connectionStatusSubscription?.unsubscribe();
    this.ppgSubscription?.unsubscribe();

    this.eegSubscription = null;
    this.telemetrySubscription = null;
    this.accelerometerSubscription = null;
    this.connectionStatusSubscription = null;
    this.ppgSubscription = null;
    this.museClient = null;

    this._connected = false;
    this._connectionMode = null;
    this._deviceName = null;
    this.isInitialized = false;
    this.eegBuffers = [[], [], [], []];
    this._electrodeQuality = [4, 4, 4, 4];
    this.eegAmplitudes = [0, 0, 0, 0];
    this.eegVariances = [0, 0, 0, 0];
    this._batteryLevel = -1;

    // Reset PPG state on disconnect
    if (ENABLE_PPG_MODULATION) {
      this.ppgBuffer = [];
      this.ppgPeakTimestamps = [];
      this.ppgSmoothed = 0;
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      this.ppgLastBeatMs = null;
      this.ppgLastPeakTime = 0;
    }
    this._signalPausedSince = null;

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
   * Handle incoming PPG (photoplethysmography) readings from Bluetooth
   * Only active if ENABLE_PPG_MODULATION is true
   * PPGReading type from muse-js: { samples: number[]; timestamp: number }
   */
  private handlePPGReading(ppg: { samples: number[]; timestamp: number }): void {
    if (!ENABLE_PPG_MODULATION) {
      return; // Feature disabled
    }

    const now = Date.now();

    // Process each sample
    for (const sample of ppg.samples) {
      // Smooth the signal (EMA)
      this.ppgSmoothed = this.ppgSmoothed * (1 - this.ppgSmoothingAlpha) + sample * this.ppgSmoothingAlpha;

      // Add to ring buffer
      this.ppgBuffer.push({ value: this.ppgSmoothed, timestamp: now });
      if (this.ppgBuffer.length > this.ppgBufferMaxSize) {
        this.ppgBuffer.shift();
      }

      // Peak detection with refractory period
      if (this.ppgBuffer.length >= 3) {
        const prev = this.ppgBuffer[this.ppgBuffer.length - 3];
        const curr = this.ppgBuffer[this.ppgBuffer.length - 2];
        const next = this.ppgBuffer[this.ppgBuffer.length - 1];

        // Detect peak: current > previous AND current > next
        const isPeak = curr.value > prev.value && curr.value > next.value;
        const timeSinceLastPeak = curr.timestamp - this.ppgLastPeakTime;

        if (isPeak && timeSinceLastPeak >= this.ppgMinRefractoryPeriod) {
          // Valid peak detected
          this.ppgPeakTimestamps.push(curr.timestamp);
          this.ppgLastPeakTime = curr.timestamp;
          this.ppgLastBeatMs = curr.timestamp;

          // Keep only recent peaks (last 15 seconds)
          const cutoffTime = now - 15000;
          this.ppgPeakTimestamps = this.ppgPeakTimestamps.filter(
            (ts) => ts > cutoffTime
          );

          // Calculate BPM from inter-beat intervals
          this.updateBPM();
        }
      }
    }
  }

  /**
   * Update BPM estimate from peak timestamps
   * Confidence gating: requires at least 4 beats in last 10-15 seconds
   * Rejects BPM outside plausible range (40-140)
   */
  private updateBPM(): void {
    if (!ENABLE_PPG_MODULATION || this.ppgPeakTimestamps.length < 2) {
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      return;
    }

    const now = Date.now();
    const windowStart = now - 12000; // 12 second window

    // Get peaks within window
    const recentPeaks = this.ppgPeakTimestamps.filter((ts) => ts > windowStart);

    if (recentPeaks.length < 4) {
      // Not enough beats for confidence
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      return;
    }

    // Calculate inter-beat intervals (IBI)
    const ibis: number[] = [];
    for (let i = 1; i < recentPeaks.length; i++) {
      const ibi = recentPeaks[i] - recentPeaks[i - 1];
      ibis.push(ibi);
    }

    // Calculate average IBI
    const avgIBI = ibis.reduce((a, b) => a + b, 0) / ibis.length;

    // Convert to BPM: BPM = 60,000 / IBI_ms
    let newBPM = 60000 / avgIBI;

    // Confidence gating: reject implausible BPM (40-140 range)
    if (newBPM < 40 || newBPM > 140) {
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      return;
    }

    // Calculate confidence based on number of beats and consistency
    const ibiVariance =
      ibis.reduce((sum, ibi) => sum + Math.pow(ibi - avgIBI, 2), 0) / ibis.length;
    const ibiStdDev = Math.sqrt(ibiVariance);
    const coefficientOfVariation = ibiStdDev / avgIBI; // Lower is better

    // Confidence: higher with more beats, lower with high variance
    const beatCountScore = Math.min(1, recentPeaks.length / 10); // Max at 10+ beats
    const consistencyScore = Math.max(0, 1 - coefficientOfVariation * 2); // Penalize high variance
    const confidence = (beatCountScore * 0.6 + consistencyScore * 0.4);

    // Smooth BPM (heavy smoothing to avoid jitter)
    if (this.ppgBPM === null) {
      this.ppgBPM = newBPM;
    } else {
      this.ppgBPM =
        this.ppgBPM * (1 - this.ppgBPMSmoothingAlpha) +
        newBPM * this.ppgBPMSmoothingAlpha;
    }

    // Smooth confidence
    this.ppgBPMConfidence =
      this.ppgBPMConfidence * 0.9 + confidence * 0.1;

    // Only output BPM if confidence is high enough
    if (this.ppgBPMConfidence < 0.6) {
      this.ppgBPM = null;
    }

    // Debug logging (throttled to once every 3-5 seconds)
    if (DEBUG_PPG && this.ppgBPM !== null && this.ppgBPMConfidence >= 0.6) {
      const timeSinceLastLog = now - this.ppgLastLogTime;
      if (timeSinceLastLog >= 3000) { // Log at most once every 3 seconds
        console.log('[MuseHandler] PPG data:', {
          bpm: this.ppgBPM.toFixed(1),
          confidence: this.ppgBPMConfidence.toFixed(2),
          recentPeaks: recentPeaks.length,
          lastBeatMs: this.ppgLastBeatMs,
        });
        this.ppgLastLogTime = now;
      }
    }
  }

  /**
   * Parse incoming OSC message
   */
  private handleOSCMessage(message: { address: string; args: number[] }): void {
    try {
      const { address, args } = message;
      if (!address) return;

      const now = Date.now();
      this._lastUpdate = now;
      
      // Reset signal pause tracking if we're receiving data
      if (this._signalPausedSince !== null) {
        const pauseDuration = now - this._signalPausedSince;
        if (pauseDuration > 1000) {
          console.log(`[Muse] OSC signal resumed after ${pauseDuration}ms pause`);
        }
        this._signalPausedSince = null;
      }

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
            // Store individual electrode quality values
            this._electrodeQuality = [args[0], args[1], args[2], args[3]];
            const quality =
              args.reduce((sum, v) => sum + (v === 1 ? 1 : v === 2 ? 0.5 : 0), 0) / 4;
            this._connectionQuality = quality;
            this._touching = quality > 0.25;
          }
          break;
        case '/muse/elements/touching_forehead':
          this._touching = this.parseValue(args) > 0;
          break;
        case '/muse/batt':
          // Battery: [charge%, fuel_gauge_mv, adc_voltage, temperature_C]
          if (Array.isArray(args) && args.length >= 1) {
            this._batteryLevel = Math.round(args[0]);
          }
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
   * Update a brainwave band dB value with smoothing
   */
  private updateBandDb(band: keyof BrainwaveBandsDb, dbValue: number): void {
    // Clamp dB values to reasonable EEG range (0 to 150 dB)
    dbValue = Math.max(0, Math.min(150, dbValue));
    this._bandsDb[band] = dbValue;

    this._bandsDbSmooth[band] =
      this._bandsDbSmooth[band] * this.smoothingFactor + dbValue * (1 - this.smoothingFactor);
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
      this.ppgSubscription?.unsubscribe();
      this.museClient.disconnect();
      this.museClient = null;
    }

    // Reset PPG state on disconnect
    if (ENABLE_PPG_MODULATION) {
      this.ppgBuffer = [];
      this.ppgPeakTimestamps = [];
      this.ppgSmoothed = 0;
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      this.ppgLastBeatMs = null;
      this.ppgLastPeakTime = 0;
    }

    // Reset PPG state on disconnect
    if (ENABLE_PPG_MODULATION) {
      this.ppgBuffer = [];
      this.ppgPeakTimestamps = [];
      this.ppgSmoothed = 0;
      this.ppgBPM = null;
      this.ppgBPMConfidence = 0;
      this.ppgLastBeatMs = null;
      this.ppgLastPeakTime = 0;
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
    this._electrodeQuality = [4, 4, 4, 4];
    this.eegAmplitudes = [0, 0, 0, 0];
    this.eegVariances = [0, 0, 0, 0];
    this._batteryLevel = -1;
    this._signalPausedSince = null;
    this._lastDisconnectReason = null;
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
   * Check if still receiving data (with debouncing)
   * Uses debouncing to prevent false disconnections from brief gaps
   */
  isReceivingData(): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - this._lastUpdate;
    
    // If we're receiving data, reset pause tracking
    if (timeSinceLastUpdate < 2000) {
      if (this._signalPausedSince !== null) {
        // Signal resumed - log if pause was significant
        const pauseDuration = now - this._signalPausedSince;
        if (pauseDuration > 1000) {
          console.log(`[Muse] Signal resumed after ${pauseDuration}ms pause`);
        }
        this._signalPausedSince = null;
      }
      return true;
    }
    
    // Signal appears paused - start or continue tracking
    if (this._signalPausedSince === null) {
      this._signalPausedSince = now;
      console.log(`[Muse] Signal pause detected (last update ${timeSinceLastUpdate}ms ago)`);
    }
    
    // Only mark as "not receiving data" if pause exceeds debounce threshold
    const pauseDuration = now - this._signalPausedSince;
    if (pauseDuration >= this._disconnectDebounceMs) {
      // Sustained pause - mark as not receiving data
      if (!this._lastDisconnectReason) {
        this._lastDisconnectReason = `No data for ${pauseDuration}ms (threshold: ${this._disconnectDebounceMs}ms)`;
        console.warn(`[Muse] ⚠️ Sustained signal pause: ${this._lastDisconnectReason}`, {
          timeSinceLastUpdate,
          pauseDuration,
          batteryLevel: this._batteryLevel,
          electrodeQuality: this._electrodeQuality,
          connectionQuality: this._connectionQuality,
        });
      }
      return false;
    }
    
    // Still within debounce window - consider it as receiving data (signal paused but not disconnected)
    return true;
  }

  /**
   * Get full state object
   */
  getState(): MuseState {
    return {
      connected: this.connected, // Use the getter which has improved logic
      connectionMode: this._connectionMode,
      deviceName: this._deviceName,
      touching: this._touching,
      connectionQuality: this._connectionQuality,
      batteryLevel: this._batteryLevel,
      bands: { ...this._bands },
      bandsSmooth: { ...this._bandsSmooth },
      bandsDb: { ...this._bandsDb },
      bandsDbSmooth: { ...this._bandsDbSmooth },
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

  /**
   * Get electrode quality values
   * Returns array [TP9, AF7, AF8, TP10] with values 1-4
   * 1 = good, 2 = medium, 3 = poor, 4 = off
   */
  getElectrodeQuality(): number[] {
    return [...this._electrodeQuality];
  }

  // Getters
  get connected(): boolean {
    // Base connection state (transport-level)
    if (!this._connected) {
      // Reset pause tracking when not connected
      this._signalPausedSince = null;
      this._lastDisconnectReason = null;
      return false;
    }
    
    // For Bluetooth, check if we're still receiving data (with debouncing)
    // This prevents false disconnections from brief signal gaps
    if (this._connectionMode === 'bluetooth') {
      const isReceiving = this.isReceivingData();
      
      // If we're not receiving data but still within debounce window, 
      // return true (signal paused, not disconnected)
      if (!isReceiving && this._signalPausedSince !== null) {
        const pauseDuration = Date.now() - this._signalPausedSince;
        if (pauseDuration < this._disconnectDebounceMs) {
          // Still in debounce window - consider connected but signal paused
          return true;
        }
      }
      
      return isReceiving;
    }
    
    // For OSC, trust the connection status more (OSC handles its own reconnection)
    return this._connected;
  }
  
  /**
   * Get connection state detail (for debugging)
   */
  getConnectionStateDetail(): {
    connected: boolean;
    signalPaused: boolean;
    timeSinceLastUpdate: number;
    pauseDuration: number | null;
    lastDisconnectReason: string | null;
  } {
    const now = Date.now();
    const timeSinceLastUpdate = now - this._lastUpdate;
    const pauseDuration = this._signalPausedSince ? now - this._signalPausedSince : null;
    
    return {
      connected: this.connected,
      signalPaused: this._signalPausedSince !== null && (pauseDuration === null || pauseDuration < this._disconnectDebounceMs),
      timeSinceLastUpdate,
      pauseDuration,
      lastDisconnectReason: this._lastDisconnectReason,
    };
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
  get bandsDb(): BrainwaveBandsDb {
    return { ...this._bandsDb };
  }
  get bandsDbSmooth(): BrainwaveBandsDb {
    return { ...this._bandsDbSmooth };
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
  get batteryLevel(): number {
    return this._batteryLevel;
  }

  /**
   * Get PPG (heart rate) metrics
   * Returns null bpm and 0 confidence if feature disabled or insufficient data
   * To disable: set ENABLE_PPG_MODULATION = false in this file
   */
  getPPG(): { bpm: number | null; confidence: number; lastBeatMs: number | null } {
    if (!ENABLE_PPG_MODULATION) {
      return { bpm: null, confidence: 0, lastBeatMs: null };
    }
    return {
      bpm: this.ppgBPM,
      confidence: this.ppgBPMConfidence,
      lastBeatMs: this.ppgLastBeatMs,
    };
  }
}

// Singleton instance
export const museHandler = new MuseHandler();
