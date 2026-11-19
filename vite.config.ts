import { defineConfig } from 'vite';
import { webApp } from './scripts/lib/webapp.ts';

export default defineConfig({
  // Relative paths so the same build works in the Android/iOS WebViews and on GitHub Pages
  // (https://<owner>.github.io/<repo>/).
  base: './',
  // Installable offline web app: manifest, icons and service worker (see scripts/lib/webapp.ts).
  plugins: [webApp()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
