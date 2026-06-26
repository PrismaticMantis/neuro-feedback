import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neurofeedback.brainbit.ipad',
  appName: 'BrainBit',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
