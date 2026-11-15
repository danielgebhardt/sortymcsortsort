import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works inside the Android WebView.
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
