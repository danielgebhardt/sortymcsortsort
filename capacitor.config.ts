import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danielgebhardt.sortymcsortsort',
  appName: 'Sorty McSort Sort',
  webDir: 'dist',
  backgroundColor: '#1b1f3b',
  android: {
    allowMixedContent: false,
  },
};

export default config;
