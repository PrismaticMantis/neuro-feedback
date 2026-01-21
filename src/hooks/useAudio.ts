// React hook for audio engine control

import { useState, useCallback, useEffect } from 'react';
import { audioEngine, BINAURAL_PRESETS } from '../lib/audio-engine';
import type {
  EntrainmentType,
  BinauralPresetName,
} from '../types';
import type { CoherenceState, CoherenceMetrics } from '../lib/audio-engine';

export interface UseAudioReturn {
  entrainmentType: EntrainmentType; // Kept for internal state but not exposed in UI
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  binauralPreset: BinauralPresetName;
  binauralBeatFreq: number; // Kept for internal state
  binauralCarrierFreq: number; // Kept for internal state
  isRewardPlaying: boolean; // Kept for backward compatibility (always false)
  coherenceState: CoherenceState;
  coherenceMetrics: CoherenceMetrics;
  setEntrainmentEnabled: (enabled: boolean) => void;
  setEntrainmentVolume: (volume: number) => void;
  setBinauralPreset: (preset: BinauralPresetName) => void;
  startReward: () => Promise<void>; // Kept for backward compatibility (no-op)
  stopReward: () => void; // Kept for backward compatibility (no-op)
  init: () => Promise<void>;
  dispose: () => void;
}

// Export presets for use in components
export { BINAURAL_PRESETS };

export function useAudio(): UseAudioReturn {
  const [entrainmentType, setEntrainmentTypeState] = useState<EntrainmentType>('binaural');
  const [entrainmentEnabled, setEntrainmentEnabledState] = useState(false);
  const [entrainmentVolume, setEntrainmentVolumeState] = useState(0.3);
  const [binauralPreset, setBinauralPresetState] = useState<BinauralPresetName>('alpha');
  const [binauralBeatFreq, setBinauralBeatFreqState] = useState(10);
  // Initialize with tritone-down frequency (~141.42 Hz from 200 Hz)
  const [binauralCarrierFreq, setBinauralCarrierFreqState] = useState(BINAURAL_PRESETS.alpha.carrierFrequency);
  const [coherenceState, setCoherenceState] = useState<CoherenceState>('baseline');
  const [coherenceMetrics, setCoherenceMetrics] = useState<CoherenceMetrics>({
    totalCoherentSeconds: 0,
    longestCoherentStreakSeconds: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  const init = useCallback(async () => {
    if (!isInitialized) {
      await audioEngine.init();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Update coherence state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCoherenceState(audioEngine.getCoherenceState());
      setCoherenceMetrics(audioEngine.getCoherenceMetrics());
    }, 100); // Update 10 times per second

    return () => clearInterval(interval);
  }, []);

  const setEntrainmentType = useCallback(
    async (type: EntrainmentType) => {
      setEntrainmentTypeState(type);
      if (isInitialized && entrainmentEnabled) {
        if (type === 'none' || type === 'isochronic') {
          audioEngine.stopEntrainment();
        } else {
          await audioEngine.startEntrainment(type);
        }
      }
    },
    [isInitialized, entrainmentEnabled]
  );

  const setEntrainmentEnabled = useCallback(
    async (enabled: boolean) => {
      setEntrainmentEnabledState(enabled);
      if (!isInitialized) {
        await init();
      }

      if (enabled) {
        // Always use binaural when enabled
        setEntrainmentTypeState('binaural');
        // Ensure alpha preset is selected by default if no valid preset
        if (!binauralPreset || binauralPreset === 'custom' || !['delta', 'theta', 'alpha', 'beta'].includes(binauralPreset)) {
          setBinauralPresetState('alpha');
          audioEngine.applyBinauralPreset('alpha');
        }
        await audioEngine.startEntrainment('binaural');
      } else {
        audioEngine.stopEntrainment();
      }
    },
    [isInitialized, entrainmentType, binauralPreset, init]
  );

  const setEntrainmentVolume = useCallback((volume: number) => {
    setEntrainmentVolumeState(volume);
    audioEngine.setEntrainmentVolume(volume);
  }, []);

  const setBinauralPreset = useCallback((preset: BinauralPresetName) => {
    // Only allow preset selection (no custom)
    if (preset === 'custom' || !['delta', 'theta', 'alpha', 'beta'].includes(preset)) return;
    
    setBinauralPresetState(preset);
    const presetConfig = BINAURAL_PRESETS[preset];
    setBinauralBeatFreqState(presetConfig.beatFrequency);
    setBinauralCarrierFreqState(presetConfig.carrierFrequency);
    audioEngine.applyBinauralPreset(preset);
    
    // Ensure binaural is active if entrainment is enabled
    if (entrainmentEnabled) {
      if (entrainmentType !== 'binaural') {
        setEntrainmentTypeState('binaural');
      }
      audioEngine.startEntrainment('binaural');
    }
  }, [entrainmentEnabled, entrainmentType]);

  // Custom frequency setter removed - only presets are used
  // This method kept for backward compatibility but does nothing
  const setBinauralBeatFreq = useCallback((freq: number) => {
    // Disabled - only presets are available
    setBinauralBeatFreqState(freq);
  }, []);

  const setBinauralCarrierFreq = useCallback((freq: number) => {
    setBinauralCarrierFreqState(freq);
    audioEngine.setBinauralCarrierFreq(freq);
  }, []);

  // Reward methods kept for backward compatibility (no-ops)
  const startReward = useCallback(async () => {
    // Disabled - use coherence crossfade instead
    await audioEngine.startReward();
  }, []);

  const stopReward = useCallback(() => {
    // Disabled - use coherence crossfade instead
    audioEngine.stopReward();
  }, []);

  const dispose = useCallback(() => {
    audioEngine.dispose();
    setIsInitialized(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioEngine.dispose();
    };
  }, []);

  return {
    entrainmentType, // Internal state only
    entrainmentEnabled,
    entrainmentVolume,
    binauralPreset,
    binauralBeatFreq, // Internal state only
    binauralCarrierFreq, // Internal state only
    isRewardPlaying: false, // Always false - oscillator rewards disabled
    coherenceState,
    coherenceMetrics,
    setEntrainmentEnabled,
    setEntrainmentVolume,
    setBinauralPreset,
    startReward,
    stopReward,
    init,
    dispose,
  };
}
