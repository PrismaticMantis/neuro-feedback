// React hook for audio engine control

import { useState, useCallback, useEffect } from 'react';
import { audioEngine } from '../lib/audio-engine';
import type { EntrainmentType } from '../types';

export interface UseAudioReturn {
  entrainmentType: EntrainmentType;
  entrainmentEnabled: boolean;
  entrainmentVolume: number;
  isRewardPlaying: boolean;
  setEntrainmentType: (type: EntrainmentType) => void;
  setEntrainmentEnabled: (enabled: boolean) => void;
  setEntrainmentVolume: (volume: number) => void;
  startReward: () => Promise<void>;
  stopReward: () => void;
  init: () => Promise<void>;
  dispose: () => void;
}

export function useAudio(): UseAudioReturn {
  const [entrainmentType, setEntrainmentTypeState] = useState<EntrainmentType>('none');
  const [entrainmentEnabled, setEntrainmentEnabledState] = useState(false);
  const [entrainmentVolume, setEntrainmentVolumeState] = useState(0.3);
  const [isRewardPlaying, setIsRewardPlaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const init = useCallback(async () => {
    if (!isInitialized) {
      await audioEngine.init();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  const setEntrainmentType = useCallback(
    async (type: EntrainmentType) => {
      setEntrainmentTypeState(type);
      if (isInitialized && entrainmentEnabled) {
        if (type === 'none') {
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

      if (enabled && entrainmentType !== 'none') {
        await audioEngine.startEntrainment(entrainmentType);
      } else {
        audioEngine.stopEntrainment();
      }
    },
    [isInitialized, entrainmentType, init]
  );

  const setEntrainmentVolume = useCallback((volume: number) => {
    setEntrainmentVolumeState(volume);
    audioEngine.setEntrainmentVolume(volume);
  }, []);

  const startReward = useCallback(async () => {
    if (!isInitialized) {
      await init();
    }
    await audioEngine.startReward();
    setIsRewardPlaying(true);
  }, [isInitialized, init]);

  const stopReward = useCallback(() => {
    audioEngine.stopReward();
    setIsRewardPlaying(false);
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
    entrainmentType,
    entrainmentEnabled,
    entrainmentVolume,
    isRewardPlaying,
    setEntrainmentType,
    setEntrainmentEnabled,
    setEntrainmentVolume,
    startReward,
    stopReward,
    init,
    dispose,
  };
}
