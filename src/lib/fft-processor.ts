// FFT Processor for brainwave band power extraction
// Based on Cooley-Tukey algorithm

export const FFT_SIZE = 256;
export const SAMPLE_RATE = 256; // Muse samples at 256 Hz

export class FFTProcessor {
  private size: number;
  private real: Float32Array;
  private imag: Float32Array;
  private cosTable: Float32Array;
  private sinTable: Float32Array;
  private window: Float32Array;

  constructor(size: number = FFT_SIZE) {
    this.size = size;
    this.real = new Float32Array(size);
    this.imag = new Float32Array(size);

    // Pre-compute twiddle factors
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos((2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((2 * Math.PI * i) / size);
    }

    // Hann window for smoothing
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }

  /**
   * Compute FFT and return magnitude spectrum
   */
  compute(samples: number[]): Float32Array {
    const n = this.size;

    // Apply window and copy to real array
    for (let i = 0; i < n; i++) {
      this.real[i] = (samples[i] || 0) * this.window[i];
      this.imag[i] = 0;
    }

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        [this.real[i], this.real[j]] = [this.real[j], this.real[i]];
        [this.imag[i], this.imag[j]] = [this.imag[j], this.imag[i]];
      }
      let k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }

    // Cooley-Tukey FFT
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let jj = 0, kk = 0; jj < halfSize; jj++, kk += step) {
          const tReal =
            this.real[i + jj + halfSize] * this.cosTable[kk] +
            this.imag[i + jj + halfSize] * this.sinTable[kk];
          const tImag =
            this.imag[i + jj + halfSize] * this.cosTable[kk] -
            this.real[i + jj + halfSize] * this.sinTable[kk];
          this.real[i + jj + halfSize] = this.real[i + jj] - tReal;
          this.imag[i + jj + halfSize] = this.imag[i + jj] - tImag;
          this.real[i + jj] += tReal;
          this.imag[i + jj] += tImag;
        }
      }
    }

    // Compute magnitude spectrum (only first half is useful)
    const magnitudes = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      magnitudes[i] = Math.sqrt(
        this.real[i] * this.real[i] + this.imag[i] * this.imag[i]
      );
    }

    return magnitudes;
  }

  /**
   * Get power in a frequency band
   */
  getBandPower(magnitudes: Float32Array, lowFreq: number, highFreq: number): number {
    const freqResolution = SAMPLE_RATE / this.size;
    // Start at bin 1 minimum to exclude DC component (bin 0)
    const lowBin = Math.max(1, Math.floor(lowFreq / freqResolution));
    const highBin = Math.ceil(highFreq / freqResolution);

    let sum = 0;
    let count = 0;
    for (let i = lowBin; i <= highBin && i < magnitudes.length; i++) {
      sum += magnitudes[i] * magnitudes[i]; // Power = magnitude^2
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Simple high-pass filter to remove DC drift
   */
  highPassFilter(samples: number[], cutoff: number = 1.0): number[] {
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = rc / (rc + dt);

    const filtered: number[] = new Array(samples.length);
    filtered[0] = 0;
    for (let i = 1; i < samples.length; i++) {
      filtered[i] = alpha * (filtered[i - 1] + samples[i] - samples[i - 1]);
    }
    return filtered;
  }
}
