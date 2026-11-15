import { generate, GenParams } from './generator';
import { solve } from './solver';
import { Block, DIRS, Dir, Level } from './types';

/** Number of levels that ship precomputed in levels.json. Beyond this, levels are generated on the fly. */
export const PACKED_LEVELS = 300;

/** Hand-made intro levels that teach the rules. */
export const TUTORIAL: Level[] = [
  // 1: everything is free — learn "tap to send it out"
  {
    w: 3, h: 4, walls: [],
    blocks: [
      { id: 0, x: 0, y: 0, len: 2, dir: 'up' },
      { id: 1, x: 1, y: 1, len: 2, dir: 'right' },
      { id: 2, x: 0, y: 3, len: 3, dir: 'left' },
    ],
  },
  // 2: one block is in another's way — learn order matters
  {
    w: 4, h: 4, walls: [],
    blocks: [
      { id: 0, x: 0, y: 1, len: 2, dir: 'right' },
      { id: 1, x: 2, y: 0, len: 3, dir: 'down' },
      { id: 2, x: 3, y: 2, len: 2, dir: 'down' },
      { id: 3, x: 0, y: 3, len: 2, dir: 'left' },
    ],
  },
  // 3: a short chain
  {
    w: 4, h: 5, walls: [],
    blocks: [
      { id: 0, x: 0, y: 0, len: 2, dir: 'down' },
      { id: 1, x: 1, y: 0, len: 3, dir: 'right' },
      { id: 2, x: 1, y: 1, len: 2, dir: 'up' },
      { id: 3, x: 2, y: 2, len: 2, dir: 'left' },
      { id: 4, x: 0, y: 3, len: 2, dir: 'right' },
      { id: 5, x: 2, y: 3, len: 2, dir: 'up' },
      { id: 6, x: 3, y: 3, len: 2, dir: 'down' },
      { id: 7, x: 0, y: 4, len: 2, dir: 'right' },
    ],
  },
];

/** Index (after the tutorial) at which each board size starts. */
const BAND_STARTS = [0, 22, 55, 95, 140, 190];

/** Difficulty curve. `n` is the 1-based level number. */
export function paramsFor(n: number): GenParams {
  const i = Math.max(0, n - TUTORIAL.length - 1);
  // Board grows a column at each band, from 4 x 5 up to 9 x 12. Early bands are shorter.
  let band = BAND_STARTS.length - 1;
  while (BAND_STARTS[band] > i) band--;
  const w = 4 + band;
  const h = Math.min(12, Math.round(w * 1.34));
  // Within a band, difficulty climbs (the last band keeps a 50-level cycle).
  const bandLen = (BAND_STARTS[band + 1] ?? BAND_STARTS[band] + 50) - BAND_STARTS[band];
  const t = ((i - BAND_STARTS[band]) % bandLen) / Math.max(1, bandLen - 1);
  // Every 5th level is a breather, every 10th a spike.
  const breather = n % 5 === 0 && n % 10 !== 0;
  const spike = n % 10 === 0;
  const late = Math.min(1, i / 250);
  let density = 0.6 + 0.25 * t + 0.08 * late;
  let tangle = 0.25 + 0.5 * t + 0.25 * late;
  if (breather) { density -= 0.12; tangle -= 0.25; }
  if (spike) { density += 0.05; tangle += 0.2; }
  return {
    w,
    h,
    density: clamp(density, 0.45, 0.95),
    tangle: clamp(tangle, 0, 1),
    maxLen: n < 20 ? 2 : w >= 7 ? 4 : 3,
    walls: n > 30 ? Math.round(w * h * 0.03 * (0.5 + t)) : 0,
    locks: n > 60 ? Math.min(3, 1 + Math.floor((n - 61) / 60)) * (breather ? 0 : 1) : 0,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Seed for level n. Constant so a level number always means the same puzzle. */
export const seedFor = (n: number) => (n * 2654435761) ^ 0x5eed;

/** Make a level, trying a few seeds and keeping the one that best fits the difficulty target. */
export function buildLevel(n: number): Level {
  if (n <= TUTORIAL.length) return TUTORIAL[n - 1];
  const p = paramsFor(n);
  let best: Level | null = null;
  let bestScore = -Infinity;
  const tries = 4;
  for (let k = 0; k < tries; k++) {
    const lvl = generate(seedFor(n) + k * 7919, p);
    const s = solve(lvl);
    if (!s.solvable) continue; // shouldn't happen, but never ship one
    // Prefer deeper chains and fewer free blocks at the start, scaled by tangle.
    const score = s.rounds.length * (0.5 + p.tangle) - s.initialFree * 0.15 * p.tangle + lvl.blocks.length * 0.05;
    if (score > bestScore) { best = lvl; bestScore = score; }
  }
  if (!best) throw new Error(`could not build level ${n}`);
  return best;
}

// ---- compact encoding for levels.json -------------------------------------------------

/** [x, y, len, dirIndex, lockedBy?] */
type PackedBlock = [number, number, number, number] | [number, number, number, number, number];
export interface PackedLevel { w: number; h: number; b: PackedBlock[]; wl?: Array<[number, number]> }

export function pack(l: Level): PackedLevel {
  const out: PackedLevel = {
    w: l.w,
    h: l.h,
    b: l.blocks.map((b) => {
      const base: [number, number, number, number] = [b.x, b.y, b.len, DIRS.indexOf(b.dir)];
      return b.lockedBy !== undefined ? [...base, b.lockedBy] : base;
    }),
  };
  if (l.walls.length) out.wl = l.walls;
  return out;
}

export function unpack(p: PackedLevel): Level {
  const blocks: Block[] = p.b.map(([x, y, len, d, lock], id) => ({
    id, x, y, len, dir: DIRS[d] as Dir,
    ...(lock !== undefined ? { lockedBy: lock } : {}),
  }));
  return { w: p.w, h: p.h, blocks, walls: p.wl ?? [] };
}
