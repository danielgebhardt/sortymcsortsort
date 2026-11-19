import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danielgebhardt.sortymcsortsort',
  appName: 'Sorty McSort Sort',
  webDir: 'dist',
  backgroundColor: '#1b1f3b',
  android: {
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#1b1f3b',
    // The game never scrolls: no rubber-band bounce while tapping blocks.
    scrollEnabled: false,
    // Full-screen web view; the game handles safe areas itself (env(safe-area-inset-*)).
    contentInset: 'never',
  },
};

export default config;
