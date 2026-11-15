import { generateWithStats, GenParams, NO_SPECIALS } from './generator';
import { Board } from './board';
import { countMoves, countTraps, isMonotone, solve } from './solver';
import { Block, DIRS, Dir, Level } from './types';

/** Number of levels that ship precomputed in levels.json. Beyond this, levels are generated on the fly. */
export const PACKED_LEVELS = 600;

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

export type Mechanic = 'sliders' | 'twins' | 'bombs' | 'spinners' | 'gates' | 'locks';

export interface Chapter {
  /** First level of the chapter. */
  from: number;
  name: string;
  /** Mechanics featured in this chapter (on top of walls, and the odd lock). */
  mix: Mechanic[];
  /** Shown on the chapter's first level. */
  tip?: string;
}

export const CHAPTER_LEN = 30;

export const CHAPTERS: Chapter[] = [
  { from: 1, name: 'Warm Up', mix: [] },
  { from: 31, name: 'Sliders', mix: ['sliders'], tip: 'Double-arrow blocks are SLIDERS: they slide\nas far as they can and stay there. Slide too\nearly and you can trap others. Undo helps!' },
  { from: 61, name: 'Twins', mix: ['twins'], tip: 'Linked TWINS leave together. Tap either one —\nboth paths must be clear at the same time.' },
  { from: 91, name: 'Bombs', mix: ['bombs'], tip: 'BOMBS count down with every move.\nDig them out before they reach zero!' },
  { from: 121, name: 'Spinners', mix: ['spinners'], tip: 'SPINNERS turn a quarter clockwise every\ntime another block leaves. Time it right!' },
  { from: 151, name: 'Gates', mix: ['gates'], tip: 'GATES block the way until the block with\nthe matching key badge leaves the board.' },
  { from: 181, name: 'Slip & Pair', mix: ['sliders', 'twins'] },
  { from: 211, name: 'Locked & Loaded', mix: ['bombs', 'gates', 'locks'] },
  { from: 241, name: 'Spin Cycle', mix: ['spinners', 'sliders'] },
  { from: 271, name: 'Double Trouble', mix: ['twins', 'bombs'] },
  { from: 301, name: 'Gatekeepers', mix: ['gates', 'spinners', 'locks'] },
  { from: 331, name: 'Short Fuse', mix: ['sliders', 'bombs'] },
  { from: 361, name: 'Whirligig', mix: ['twins', 'spinners', 'locks'] },
  { from: 391, name: 'Traffic Jam', mix: ['gates', 'sliders', 'twins'] },
  { from: 421, name: 'Powder Keg', mix: ['bombs', 'spinners', 'gates'] },
  { from: 451, name: 'Rush Hour', mix: ['sliders', 'twins', 'bombs'] },
  { from: 481, name: 'Clockwork', mix: ['spinners', 'gates', 'twins', 'locks'] },
  { from: 511, name: 'Minefield', mix: ['sliders', 'bombs', 'gates', 'locks'] },
  { from: 541, name: 'Everything', mix: ['sliders', 'twins', 'bombs', 'spinners', 'gates'] },
  { from: 571, name: 'Grand Finale', mix: ['sliders', 'twins', 'bombs', 'spinners', 'gates', 'locks'] },
];

/** Chapter for level n. Past the last chapter, the remix chapters repeat (endless mode). */
export function chapterFor(n: number): { chapter: Chapter; index: number; i: number } {
  const lastFrom = CHAPTERS[CHAPTERS.length - 1].from;
  if (n < lastFrom + CHAPTER_LEN) {
    let index = CHAPTERS.length - 1;
    while (CHAPTERS[index].from > n) index--;
    return { chapter: CHAPTERS[index], index, i: n - CHAPTERS[index].from };
  }
  const remix = CHAPTERS.slice(6);
  const k = Math.floor((n - (lastFrom + CHAPTER_LEN)) / CHAPTER_LEN);
  const index = 6 + (k % remix.length);
  const from = lastFrom + CHAPTER_LEN + k * CHAPTER_LEN;
  return { chapter: { ...CHAPTERS[index], from, name: `Endless · ${CHAPTERS[index].name}`, tip: undefined }, index: CHAPTERS.length + k, i: n - from };
}

/** Levels where walls and locks first appear (each gets a one-time tip). */
export const INTRO = { walls: 12, locks: 20 };

const SIZES: Array<[number, number]> = [[4, 5], [5, 6], [5, 7], [6, 8], [7, 9], [7, 10], [8, 11], [9, 12]];

/** Difficulty curve. `n` is the 1-based level number. */
export function paramsFor(n: number): GenParams {
  const { chapter, index: ci, i } = chapterFor(n);
  const t = i / (CHAPTER_LEN - 1);
  const intro = ci > 0 && i < 2; // first two levels of a chapter teach its idea
  const breather = !intro && i % 10 === 4;
  const spike = i % 10 === 9;

  let size: number;
  if (ci === 0) size = n < 9 ? 0 : n < 15 ? 1 : n < 23 ? 2 : 3;
  else {
    const base = Math.min(6, 3 + Math.floor((ci - 1) / 2));
    size = intro ? base - 1 : Math.min(7, base + Math.floor(t * 2.99));
  }
  const [w, h] = SIZES[size];
  const area = w * h;

  // Warm Up ramps from gentle to properly tangled; later chapters start tangled and stay that way.
  let density = ci === 0 ? 0.66 + 0.2 * t : 0.74 + 0.14 * t + 0.03 * Math.min(1, ci / 12);
  let tangle = ci === 0 ? 0.55 + 0.45 * t : 0.8 + 0.2 * t;
  if (intro) { density = 0.62; tangle = 0.6; }
  if (breather) { density -= 0.1; tangle -= 0.25; }
  if (spike) { density += 0.04; tangle = 1; }

  const has = (m: Mechanic) => chapter.mix.includes(m);
  const remix = chapter.mix.length > 1;
  // How many of a featured mechanic: 1 on intro levels, climbing through the chapter.
  const amount = (max: number) => {
    if (intro) return 1;
    let k = 1 + Math.round(t * (max - 1));
    if (remix) k = Math.max(1, Math.round(k * 0.75));
    if (breather) k = Math.max(1, k - 1);
    if (spike) k += 1;
    return k;
  };

  return {
    w,
    h,
    density: clamp(density, 0.5, 0.95),
    tangle: clamp(tangle, 0, 1),
    maxLen: n < 12 ? 2 : w >= 7 ? 4 : 3,
    walls: n < INTRO.walls ? 0 : n === INTRO.walls ? 2 : intro ? 0 : Math.round(area * (has('gates') ? 0.015 : 0.02 + 0.03 * t)),
    locks: n < INTRO.locks || intro ? 0 : (breather ? 0 : 1) + (has('locks') ? Math.round(t * 2) : 0),
    sliders: has('sliders') ? amount(4) : 0,
    pullback: has('sliders') ? (intro ? 1 : clamp(0.35 + 0.4 * t, 0, 0.8)) : 0,
    twins: has('twins') ? amount(3) : 0,
    bombs: has('bombs') ? amount(3) : 0,
    bombSlack: intro ? 4 : remix ? 2 : Math.max(0, 2 - Math.round(t * 2)),
    spinners: has('spinners') ? amount(4) : 0,
    gates: has('gates') ? amount(4) : 0,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Seed for level n. Constant so a level number always means the same puzzle. */
export const seedFor = (n: number) => (n * 2654435761) ^ 0x5eed;

export interface LevelStats {
  blocks: number;
  /** Chain depth (levels without sliders, spinners or bombs). */
  depth: number;
  initialFree: number;
  pullbacks: number;
  traps: number;
}

/**
 * Make a level: try several seeds and keep the hardest one for this spot in the curve.
 * `fast` is used for endless levels generated on the phone.
 */
export function buildLevel(n: number, fast = false): Level {
  return buildLevelWithStats(n, fast).level;
}

export function buildLevelWithStats(n: number, fast = false): { level: Level; stats: LevelStats } {
  if (n <= TUTORIAL.length) {
    const level = TUTORIAL[n - 1];
    const s = solve(level);
    return { level: { ...level, solution: s.order }, stats: { blocks: level.blocks.length, depth: s.depth, initialFree: s.initialFree, pullbacks: 0, traps: 0 } };
  }
  const p = paramsFor(n);
  const { i } = chapterFor(n);
  const easy = (i % 10 === 4) || n < 8;
  const tries = fast ? 3 : easy ? 4 : 14;
  let best: { level: Level; stats: LevelStats } | null = null;
  let bestScore = -Infinity;
  for (let k = 0; k < tries; k++) {
    let gen;
    try {
      gen = generateWithStats(seedFor(n) + k * 7919, p);
    } catch {
      continue;
    }
    const { level, pullbacks } = gen;
    if (p.sliders > 0 && i < 2 && pullbacks === 0 && k < tries - 1) continue; // slider intros must teach the partial slide
    // The generator already proved the level by replaying its solution; these are just ratings.
    const initialFree = countMoves(new Board(level));
    const depth = isMonotone(level) ? solve(level).depth : 0;
    const hasSliders = level.blocks.some((b) => b.slider);
    const traps = hasSliders && !fast && level.blocks.length <= 45 ? countTraps(level, 1_500, 12, 25_000) : 0;
    const stats = { blocks: level.blocks.length, depth, initialFree, pullbacks, traps };
    // Harder = deeper chains, fewer free blocks at the start, more forced slides and traps.
    const score = stats.depth * 1.2 - (stats.initialFree / stats.blocks) * 12 + pullbacks * 2 + Math.min(traps, 12) * 1.2 + stats.blocks * 0.1;
    if (score > bestScore) { best = { level, stats }; bestScore = score; }
  }
  if (!best) {
    // Fall back to a plain level of the same size rather than failing.
    const level = generateWithStats(seedFor(n), { ...p, ...NO_SPECIALS }).level;
    const s = solve(level);
    return { level, stats: { blocks: level.blocks.length, depth: s.depth, initialFree: s.initialFree, pullbacks: 0, traps: 0 } };
  }
  return best;
}

// ---- compact encoding for levels.json -------------------------------------------------

interface PackedExtra { l?: number; s?: 1; t?: number; f?: number; r?: 1 }
/** [x, y, len, dirIndex, extras?] — extras: l = locked by, s = slider, t = twin, f = fuse, r = spinner */
type PackedBlock = [number, number, number, number] | [number, number, number, number, PackedExtra];
export interface PackedLevel {
  w: number;
  h: number;
  b: PackedBlock[];
  /** walls */
  wl?: Array<[number, number]>;
  /** gates: [x, y, key] */
  g?: Array<[number, number, number]>;
  /** known solution */
  s?: number[];
}

export function pack(l: Level): PackedLevel {
  const out: PackedLevel = {
    w: l.w,
    h: l.h,
    b: l.blocks.map((b) => {
      const base: [number, number, number, number] = [b.x, b.y, b.len, DIRS.indexOf(b.dir)];
      const e: PackedExtra = {};
      if (b.lockedBy !== undefined) e.l = b.lockedBy;
      if (b.slider) e.s = 1;
      if (b.twin !== undefined) e.t = b.twin;
      if (b.fuse !== undefined) e.f = b.fuse;
      if (b.spinner) e.r = 1;
      return Object.keys(e).length ? [...base, e] : base;
    }),
  };
  if (l.walls.length) out.wl = l.walls;
  if (l.gates?.length) out.g = l.gates.map((g) => [g.x, g.y, g.key]);
  if (l.solution) out.s = l.solution;
  return out;
}

export function unpack(p: PackedLevel): Level {
  const blocks: Block[] = p.b.map(([x, y, len, d, e], id) => {
    const b: Block = { id, x, y, len, dir: DIRS[d] as Dir };
    if (e?.l !== undefined) b.lockedBy = e.l;
    if (e?.s) b.slider = true;
    if (e?.t !== undefined) b.twin = e.t;
    if (e?.f !== undefined) b.fuse = e.f;
    if (e?.r) b.spinner = true;
    return b;
  });
  return { w: p.w, h: p.h, blocks, walls: p.wl ?? [], gates: (p.g ?? []).map(([x, y, key]) => ({ x, y, key })), ...(p.s ? { solution: p.s } : {}) };
}
