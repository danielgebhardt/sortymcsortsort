import Phaser from 'phaser';
import type { Dir } from '../core/types';

type G = Phaser.GameObjects.Graphics;

/** A chevron arrow centred at (cx, cy) pointing in `dir`, `s` = overall size. */
export function chevron(g: G, cx: number, cy: number, s: number, dir: Dir, color = 0xffffff, alpha = 1) {
  const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[dir];
  const pts = [
    [-0.28, -0.42],
    [0.22, 0],
    [-0.28, 0.42],
  ].map(([x, y]) => {
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    return new Phaser.Math.Vector2(cx + rx * s, cy + ry * s);
  });
  g.lineStyle(Math.max(2, s * 0.17), color, alpha);
  g.strokePoints(pts, false, false);
  // round-ish caps
  g.fillStyle(color, alpha);
  for (const p of pts) g.fillCircle(p.x, p.y, Math.max(1, s * 0.085));
}

export function heart(g: G, cx: number, cy: number, s: number, color: number) {
  g.fillStyle(color, 1);
  const r = s * 0.27;
  g.fillCircle(cx - r * 0.95, cy - r * 0.4, r);
  g.fillCircle(cx + r * 0.95, cy - r * 0.4, r);
  g.fillTriangle(cx - r * 1.9, cy - r * 0.15, cx + r * 1.9, cy - r * 0.15, cx, cy + s * 0.48);
}

export function star(g: G, cx: number, cy: number, s: number, color: number) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s * 0.5 : s * 0.21;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
}

export function padlock(g: G, cx: number, cy: number, s: number, color: number) {
  const bw = s * 0.62, bh = s * 0.48;
  g.lineStyle(s * 0.11, color, 1);
  g.beginPath();
  g.arc(cx, cy - bh * 0.15, s * 0.2, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillRoundedRect(cx - bw / 2, cy - bh * 0.15, bw, bh, s * 0.08);
  g.fillStyle(0x000000, 0.35);
  g.fillCircle(cx, cy + bh * 0.2, s * 0.06);
}

export function key(g: G, cx: number, cy: number, s: number, color: number) {
  g.fillStyle(color, 1);
  g.fillCircle(cx - s * 0.2, cy, s * 0.2);
  g.fillRect(cx - s * 0.05, cy - s * 0.055, s * 0.48, s * 0.11);
  g.fillRect(cx + s * 0.25, cy, s * 0.08, s * 0.16);
  g.fillRect(cx + s * 0.36, cy, s * 0.07, s * 0.12);
  g.fillStyle(0x000000, 0.35);
  g.fillCircle(cx - s * 0.2, cy, s * 0.07);
}

export function restartIcon(g: G, cx: number, cy: number, s: number, color: number) {
  g.lineStyle(s * 0.13, color, 1);
  g.beginPath();
  g.arc(cx, cy, s * 0.3, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(240), false);
  g.strokePath();
  const a = Phaser.Math.DegToRad(-60);
  const tx = cx + Math.cos(a) * s * 0.3, ty = cy + Math.sin(a) * s * 0.3;
  g.fillStyle(color, 1);
  g.fillTriangle(tx - s * 0.2, ty - s * 0.08, tx + s * 0.08, ty - s * 0.16, tx + s * 0.02, ty + s * 0.16);
}

export function bulbIcon(g: G, cx: number, cy: number, s: number, color: number) {
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy - s * 0.08, s * 0.25);
  g.fillRect(cx - s * 0.12, cy + s * 0.1, s * 0.24, s * 0.12);
  g.fillRoundedRect(cx - s * 0.1, cy + s * 0.24, s * 0.2, s * 0.08, s * 0.03);
}

export function backIcon(g: G, cx: number, cy: number, s: number, color: number) {
  chevron(g, cx + s * 0.05, cy, s * 0.8, 'left', color);
}

export function soundIcon(g: G, cx: number, cy: number, s: number, color: number, on: boolean) {
  g.fillStyle(color, 1);
  g.fillRect(cx - s * 0.35, cy - s * 0.12, s * 0.16, s * 0.24);
  g.fillTriangle(cx - s * 0.22, cy - s * 0.12, cx + s * 0.02, cy - s * 0.32, cx + s * 0.02, cy + s * 0.32);
  g.fillTriangle(cx - s * 0.22, cy + s * 0.12, cx - s * 0.22, cy - s * 0.12, cx + s * 0.02, cy + s * 0.32);
  g.lineStyle(s * 0.07, color, 1);
  if (on) {
    g.beginPath();
    g.arc(cx + s * 0.05, cy, s * 0.17, -0.9, 0.9, false);
    g.strokePath();
    g.beginPath();
    g.arc(cx + s * 0.05, cy, s * 0.31, -0.9, 0.9, false);
    g.strokePath();
  } else {
    g.lineBetween(cx + s * 0.12, cy - s * 0.14, cx + s * 0.38, cy + s * 0.14);
    g.lineBetween(cx + s * 0.38, cy - s * 0.14, cx + s * 0.12, cy + s * 0.14);
  }
}
