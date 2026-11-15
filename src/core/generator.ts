import { Board, cellsOf } from './board';
import { Rng } from './rng';
import { solve } from './solver';
import { Block, DIRS, Level } from './types';

export interface GenParams {
  w: number;
  h: number;
  /** Target fraction of cells covered by blocks (0..1). */
  density: number;
  /** Longest block, in cells. */
  maxLen: number;
  /** 0..1 — how strongly to prefer placements that block other blocks (harder). */
  tangle: number;
  walls: number;
  locks: number;
}

interface Candidate {
  block: Block;
  /** Roughly how many existing blocks this placement would sit in front of. */
  blocks: number;
}

/**
 * Builds a level backwards: blocks are placed in reverse order of removal.
 * Each new block must have a clear path to the edge *at the moment it is placed*;
 * blocks placed later are removed earlier, so they may sit in its way.
 * That makes every generated level solvable by construction.
 */
export function generate(seed: number, p: GenParams): Level {
  const rng = new Rng(seed);
  const walls = placeWalls(rng, p);
  const board = new Board({ w: p.w, h: p.h, blocks: [], walls });
  const target = Math.floor(p.w * p.h * p.density) - walls.length;
  let covered = 0;
  let nextId = 0;
  const placed: Block[] = [];

  // For each cell, how many placed blocks have it in their exit path.
  const pathCount = new Int32Array(p.w * p.h);

  while (covered < target) {
    const cands = candidates(board, p.maxLen, nextId, pathCount);
    if (cands.length === 0) break;
    const c = choose(rng, cands, p.tangle);
    board.add(c.block);
    for (const cell of pathCells(board, c.block)) pathCount[cell]++;
    placed.push(c.block);
    covered += c.block.len;
    nextId++;
  }

  // Removal order is reverse of placement (higher id = removed earlier).
  const blocks = placed.map((b) => ({ ...b }));
  addLocks(rng, blocks, p.locks, p.w, p.h, walls);
  return normalize({ w: p.w, h: p.h, blocks, walls });
}

function placeWalls(rng: Rng, p: GenParams): Array<[number, number]> {
  const walls: Array<[number, number]> = [];
  const seen = new Set<string>();
  // Keep walls off the outer ring so the board edge stays readable.
  let guard = 0;
  while (walls.length < p.walls && guard++ < 500) {
    const x = rng.int(1, p.w - 2);
    const y = rng.int(1, p.h - 2);
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    walls.push([x, y]);
  }
  return walls;
}

function candidates(board: Board, maxLen: number, id: number, pathCount: Int32Array): Candidate[] {
  const out: Candidate[] = [];
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      if (board.at(x, y) !== null) continue;
      for (let len = 1; len <= maxLen; len++) {
        for (const dir of DIRS) {
          // A 1-cell block may point anywhere; longer blocks point along their length.
          const block: Block = { id, x, y, len, dir };
          if (!board.canPlace(block)) continue;
          if (board.probe(block).hit !== null) continue;
          let blocks = 0;
          for (const [cx, cy] of cellsOf(block)) blocks += pathCount[cy * board.w + cx];
          out.push({ block, blocks });
        }
      }
    }
  }
  return out;
}

function pathCells(board: Board, b: Block): number[] {
  const out: number[] = [];
  const cells = cellsOf(b);
  let [x, y] = b.dir === 'right' || b.dir === 'down' ? cells[cells.length - 1] : cells[0];
  const dx = b.dir === 'left' ? -1 : b.dir === 'right' ? 1 : 0;
  const dy = b.dir === 'up' ? -1 : b.dir === 'down' ? 1 : 0;
  for (;;) {
    x += dx;
    y += dy;
    if (!board.inBounds(x, y)) return out;
    out.push(y * board.w + x);
  }
}

function choose(rng: Rng, cands: Candidate[], tangle: number): Candidate {
  // Weight: favour 2-long blocks (they read best), and blocking placements when tangle is high.
  let total = 0;
  const weights = cands.map((c) => {
    const lenW = c.block.len === 2 ? 1.6 : c.block.len === 1 ? 0.55 : 1;
    const w = lenW * (1 + tangle * 3 * c.blocks) * (c.blocks === 0 ? 1 - tangle * 0.8 : 1);
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i];
  }
  return cands[cands.length - 1];
}

/**
 * Locks: block L stays locked until key block K has exited.
 * K must be placed after L (so it is removed earlier) — keeps the level solvable.
 * Prefer L blocks that would otherwise be free early, and K blocks that are buried.
 */
function addLocks(rng: Rng, blocks: Block[], count: number, w: number, h: number, walls: Array<[number, number]>) {
  if (count <= 0 || blocks.length < 6) return;
  const used = new Set<number>();
  for (let n = 0; n < count; n++) {
    const base = solve({ w, h, blocks, walls });
    const roundOf = new Map<number, number>();
    base.rounds.forEach((r, i) => r.forEach((id) => roundOf.set(id, i)));
    const lockable = blocks.filter((b) => !used.has(b.id) && b.lockedBy === undefined && (roundOf.get(b.id) ?? 0) <= 1);
    rng.shuffle(lockable);
    let done = false;
    for (const L of lockable) {
      const keys = blocks.filter((k) => k.id > L.id && !used.has(k.id) && (roundOf.get(k.id) ?? 0) >= 1);
      if (keys.length === 0) continue;
      const K = rng.pick(keys);
      L.lockedBy = K.id;
      if (solve({ w, h, blocks, walls }).solvable) {
        used.add(L.id);
        used.add(K.id);
        done = true;
        break;
      }
      delete L.lockedBy;
    }
    if (!done) return;
  }
}

/** Renumber ids 0..n-1 in reading order so saved data and visuals are stable. */
function normalize(level: Level): Level {
  const sorted = [...level.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const remap = new Map(sorted.map((b, i) => [b.id, i]));
  return {
    ...level,
    blocks: sorted.map((b) => ({
      ...b,
      id: remap.get(b.id)!,
      ...(b.lockedBy !== undefined ? { lockedBy: remap.get(b.lockedBy)! } : {}),
    })),
  };
}
