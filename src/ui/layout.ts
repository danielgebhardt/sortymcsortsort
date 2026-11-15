import Phaser from 'phaser';

/** Screen metrics for laying out a scene. All values are in canvas pixels. */
export interface Layout {
  W: number;
  H: number;
  /** One "unit" ≈ 1% of usable width on a phone. Size everything in units. */
  u: number;
  dpr: number;
  safe: { top: number; right: number; bottom: number; left: number };
}

export function layout(scene: Phaser.Scene): Layout {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const dpr = (scene.registry.get('dpr') as number) ?? 1;
  const safe = (scene.registry.get('safe') as Layout['safe']) ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const u = Math.min(W, H * 0.6) / 100;
  return { W, H, u, dpr, safe: { top: safe.top * dpr, right: safe.right * dpr, bottom: safe.bottom * dpr, left: safe.left * dpr } };
}

export function readSafeInsets() {
  const el = document.getElementById('safe-probe');
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(el);
  const n = (v: string) => parseFloat(v) || 0;
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}
