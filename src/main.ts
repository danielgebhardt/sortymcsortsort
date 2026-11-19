import Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { PlayScene } from './scenes/PlayScene';
import { loadProgress } from './storage/progress';
import { COLORS } from './theme';
import { readSafeInsets } from './ui/layout';

async function start() {
  await loadProgress();
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#1b1f3b' }).catch(() => {});
  }

  // Render at the device's real pixel density so text and shapes stay crisp,
  // then zoom the canvas back down to CSS size.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = () => window.innerWidth;
  const cssH = () => window.innerHeight;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.NONE,
      width: cssW() * dpr,
      height: cssH() * dpr,
      zoom: 1 / dpr,
    },
    render: { antialias: true },
    scene: [MenuScene, LevelSelectScene, PlayScene],
  });
  game.registry.set('dpr', dpr);
  game.registry.set('safe', readSafeInsets());

  // Rebuild the current screen when the window size changes (rotation, split screen, desktop resize).
  let timer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      game.registry.set('safe', readSafeInsets());
      game.scale.resize(cssW() * dpr, cssH() * dpr);
      game.scale.setZoom(1 / dpr);
      for (const s of game.scene.getScenes(true)) s.scene.restart(s.sys.settings.data);
    }, 150);
  });

  // Expose for automated browser tests.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

/**
 * Web app only (GitHub Pages / Add to Home Screen): register the offline service worker and ask the
 * browser to keep our storage (saved progress) instead of evicting it. Never in the native apps,
 * and not in dev (the dev server has no sw.js).
 */
function initWebApp() {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
  navigator.storage?.persist?.().catch(() => {});
}

initWebApp();
start();
