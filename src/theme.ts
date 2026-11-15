import type { Dir } from './core/types';

export const COLORS = {
  bg: 0x1b1f3b,
  board: 0x262b52,
  boardEdge: 0x323868,
  gridDot: 0x3a4178,
  wall: 0x4b5180,
  wallTop: 0x5d6497,
  text: '#ffffff',
  sub: '#aab0e0',
  primary: 0x2ec4b6,
  secondary: 0x4b5180,
  danger: 0xff5a6e,
  gold: 0xffd84d,
  heart: 0xff5a6e,
  heartEmpty: 0x3a4178,
};

/** Each arrow direction has its own colour so the board is easy to read at a glance. */
export const DIR_COLORS: Record<Dir, number> = {
  up: 0xff6b6b,
  right: 0x2ec4b6,
  down: 0xffbe3d,
  left: 0x9b7bff,
};

/** Colours used to match a key block to its locked block. */
export const LOCK_COLORS = [0xffd84d, 0x5ee0ff, 0xff7ad9];

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function shade(color: number, f: number): number {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const m = (c: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => [(a >> s) & 255, (b >> s) & 255];
  const out = [16, 8, 0].map((s) => {
    const [x, y] = ch(s);
    return Math.round(x + (y - x) * t) << s;
  });
  return out[0] | out[1] | out[2];
}
