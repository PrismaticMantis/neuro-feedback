/**
 * FFT + band extraction for Athena WebSocket frames (one multi-channel sample per packet).
 * Logic mirrors `MuseHandler.processBluetoothFFT` without importing muse-handler (Muse 2 path unchanged).
 *
 * **Real:** FFT, Hann window, high-pass, Mind-Monitor-style dB, relative band ratios,1/f weighting.
 * **Approximate:** FFT `sampleRateHz` tracks the **bridge stream** (one sample per packet), derived from
 *   `td` deltas when `tdUnit` is known, else emitter `th` spacing, else receive time. This is not the headset’s
 *   native 256 Hz unless you send multi-sample frames (not supported here). Band edges are therefore approximate
 *   vs Muse 2 BLE.
 */

import type { BrainwaveBands, BrainwaveBandsDb } from '../../types';
import type { FFTProcessor } from '../fft-processor';

const MIN_POWER = 1e-12;

export type AthenaBridgeFftSnapshot = {
  bands: BrainwaveBands;
  bandsDb: BrainwaveBandsDb;
};

const EMPTY: AthenaBridgeFftSnapshot = {
  bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  bandsDb: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
};

/**
 * When every channel buffer has `windowSize` samples, run the same band pipeline as Muse BLE FFT.
 * @param eegBuffers rows = channels, same order as `microvolts` in the bridge packet */
export function snapshotBandsFromBridgeBuffers(
  eegBuffers: number[][],
  fft: FFTProcessor,
  channelCount: number,
  windowSize: number
): AthenaBridgeFftSnapshot | null {
  for (let ch = 0; ch < channelCount; ch++) {
    if ((eegBuffers[ch]?.length ?? 0) < windowSize) return null;
  }

  const bandPowers = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  const bandPowersSum = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  let validChannels = 0;

  for (let ch = 0; ch < channelCount; ch++) {
    const buf = eegBuffers[ch];
    if (buf.length < windowSize) continue;

    const filtered = fft.highPassFilter(buf, 1.0);
    const magnitudes = fft.compute(filtered);

    bandPowers.delta += fft.getBandPower(magnitudes, 1, 4);
    bandPowers.theta += fft.getBandPower(magnitudes, 4, 8);
    bandPowers.alpha += fft.getBandPower(magnitudes, 8, 13);
    bandPowers.beta += fft.getBandPower(magnitudes, 13, 30);
    bandPowers.gamma += fft.getBandPower(magnitudes, 30, 44);

    bandPowersSum.delta += fft.getBandPowerSum(magnitudes, 1, 4);
    bandPowersSum.theta += fft.getBandPowerSum(magnitudes, 4, 8);
    bandPowersSum.alpha += fft.getBandPowerSum(magnitudes, 8, 13);
    bandPowersSum.beta += fft.getBandPowerSum(magnitudes, 13, 30);
    bandPowersSum.gamma += fft.getBandPowerSum(magnitudes, 30, 44);

    validChannels++;
  }

  if (validChannels === 0) return null;

  for (const band of Object.keys(bandPowers) as (keyof typeof bandPowers)[]) {
    bandPowers[band] /= validChannels;
    bandPowersSum[band] /= validChannels;
  }

  const bandsDb: BrainwaveBandsDb = {
    delta: 10 * Math.log10(Math.max(bandPowersSum.delta, MIN_POWER)),
    theta: 10 * Math.log10(Math.max(bandPowersSum.theta, MIN_POWER)),
    alpha: 10 * Math.log10(Math.max(bandPowersSum.alpha, MIN_POWER)),
    beta: 10 * Math.log10(Math.max(bandPowersSum.beta, MIN_POWER)),
    gamma: 10 * Math.log10(Math.max(bandPowersSum.gamma, MIN_POWER)),
  };

  const weighted = {
    delta: bandPowers.delta,
    theta: bandPowers.theta * 1.5,
    alpha: bandPowers.alpha * 2.0,
    beta: bandPowers.beta * 3.0,
    gamma: bandPowers.gamma * 4.0,
  };

  const total =
    weighted.delta + weighted.theta + weighted.alpha + weighted.beta + weighted.gamma;

  if (total <= 0) return EMPTY;

  const bands: BrainwaveBands = {
    delta: weighted.delta / total,
    theta: weighted.theta / total,
    alpha: weighted.alpha / total,
    beta: weighted.beta / total,
    gamma: weighted.gamma / total,
  };

  for (const k of Object.keys(bandsDb) as (keyof BrainwaveBandsDb)[]) {
    bandsDb[k] = Math.max(0, Math.min(150, bandsDb[k]));
  }

  return { bands, bandsDb };
}

export function deriveBridgeIndices(bandsSmooth: BrainwaveBands): {
  relaxationIndex: number;
  meditationIndex: number;
  focusIndex: number;
} {
  const { theta, alpha, beta, gamma } = bandsSmooth;
  const relaxNum = alpha + theta;
  const relaxDen = beta + gamma + 0.001;
  const relaxationIndex = Math.min(relaxNum / relaxDen, 2) / 2;
  let meditationIndex = theta / (alpha + 0.001);
  meditationIndex = Math.min(meditationIndex, 2) / 2;
  let focusIndex = beta / (alpha + theta + 0.001);
  focusIndex = Math.min(focusIndex, 2) / 2;
  return { relaxationIndex, meditationIndex, focusIndex };
}
