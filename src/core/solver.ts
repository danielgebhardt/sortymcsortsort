import { Board, cellsOf, headOf } from './board';
import { Rng } from './rng';
import { Block, DELTA, Level } from './types';

export interface SolveResult {
  /** true / false, or null if the search gave up (hit its node limit). */
  solvable: boolean | null;
  /** A sequence of taps that clears the board. */
  order: number[];
  /** Levels with only plain blocks/locks/twins/gates: how many "layers" you must dig through. */
  depth: number;
  /** How many blocks can make progress right at the start. */
  initialFree: number;
}

export const copyBoard = (b: Board) => new Board(b.toLevel());

/** True when removing free blocks is always safe (no sliders, spinners or bombs). */
export function isMonotone(level: Pick<Level, 'blocks'>) {
  return !level.blocks.some((b) => b.slider || b.spinner || b.fuse !== undefined);
}

export function solve(level: Level, limit = 200_000): SolveResult {
  const board = new Board(level);
  const initialFree = countMoves(board);
  if (isMonotone(level)) {
    const p = peel(board);
    return { solvable: p.solvable, order: p.order, depth: p.depth, initialFree };
  }
  const r = search(board, limit);
  return { solvable: r.solvable, order: r.moves, depth: 0, initialFree };
}

/** Number of distinct taps that would make progress right now (twins count once). */
export function countMoves(board: Board): number {
  let n = 0;
  for (const b of board.blocks.values()) {
    if (b.twin !== undefined && b.twin < b.id) continue;
    if (board.canProgress(b)) n++;
  }
  return n;
}

/**
 * Without sliders, spinners or bombs, removing a block never makes anything worse, so greedily
 * removing every free block is always safe. If that gets stuck, there is no solution.
 */
function peel(start: Board): { solvable: boolean; order: number[]; depth: number } {
  const board = copyBoard(start);
  const order: number[] = [];
  let depth = 0;
  while (!board.cleared) {
    const free = board.freeBlocks().map((b) => b.id);
    if (free.length === 0) return { solvable: false, order, depth };
    for (const id of free) {
      if (!board.blocks.has(id)) continue; // its twin already took it
      board.tap(id);
      order.push(id);
    }
    depth++;
  }
  return { solvable: true, order, depth };
}

/** Cells on any slider's forward line (from its head to the edge). */
function sliderRays(board: Board): Set<number> {
  const rays = new Set<number>();
  for (const b of board.blocks.values()) {
    if (!b.slider) continue;
    const { dx, dy } = DELTA[b.dir];
    let [x, y] = headOf(b);
    for (;;) {
      x += dx;
      y += dy;
      if (!board.inBounds(x, y)) break;
      rays.add(y * board.w + x);
    }
  }
  return rays;
}

/**
 * Exact search over taps. Blocks only leave and sliders only move forward, so the game can't loop.
 * When there are no spinners or bombs, blocks that are free and can't affect any slider are removed
 * straight away (that can only open up options); everything else is branched on.
 */
export function search(start: Board, limit = 200_000): { solvable: boolean | null; moves: number[]; nodes: number } {
  const board = copyBoard(start);
  const failed = new Set<string>();
  const moves: number[] = [];
  let nodes = 0;
  let aborted = false;
  const timed = [...board.blocks.values()].some((b) => b.fuse !== undefined);
  const spinning = [...board.blocks.values()].some((b) => b.spinner);

  const touchesRays = (b: Block, rays: Set<number>) => {
    const unit = [b, board.partnerOf(b)].filter(Boolean) as Block[];
    for (const u of unit) {
      if (cellsOf(u).some(([x, y]) => rays.has(y * board.w + x))) return true;
      if (board.gates.some((g) => g.key === u.id && rays.has(g.y * board.w + g.x))) return true;
    }
    return false;
  };

  const key = () => {
    const parts: string[] = [];
    for (const id of [...board.blocks.keys()].sort((a, b) => a - b)) {
      const b = board.blocks.get(id)!;
      parts.push(b.slider ? `${id}@${b.x},${b.y}` : b.spinner ? `${id}${b.dir[0]}` : `${id}`);
    }
    return timed ? `${parts.join(' ')}#${moves.length}` : parts.join(' ');
  };

  const dfs = (): boolean => {
    if (board.cleared) return true;
    if (board.exploded !== null) return false;
    if (++nodes > limit) {
      aborted = true;
      return false;
    }
    const snap = board.snapshot();
    const mark = moves.length;
    if (!timed && !spinning) {
      let changed = true;
      while (changed) {
        changed = false;
        const rays = sliderRays(board);
        for (const b of [...board.blocks.values()]) {
          if (!board.blocks.has(b.id) || b.slider) continue;
          if (board.isFree(b) && !touchesRays(b, rays)) {
            board.tap(b.id);
            moves.push(b.id);
            changed = true;
          }
        }
      }
      if (board.cleared) return true;
    }

    const k = key();
    if (!failed.has(k)) {
      const exits: number[] = [];
      const slides: number[] = [];
      for (const b of board.blocks.values()) {
        if (b.twin !== undefined && b.twin < b.id && board.blocks.has(b.twin)) continue;
        if (board.isFree(b)) exits.push(b.id);
        else if (board.canProgress(b)) slides.push(b.id);
      }
      // Bombs: try freeing the most urgent ones first.
      if (timed) exits.sort((a, b) => (board.blocks.get(a)!.fuse ?? 99) - (board.blocks.get(b)!.fuse ?? 99));
      for (const id of [...exits, ...slides]) {
        const before = board.snapshot();
        board.tap(id);
        moves.push(id);
        if (dfs()) return true;
        if (aborted) return false;
        board.restore(before);
        moves.pop();
      }
      failed.add(k);
    }
    board.restore(snap);
    moves.length = mark;
    return false;
  };

  const ok = dfs();
  return { solvable: ok ? true : aborted ? null : false, moves: ok ? moves : [], nodes };
}

/** Legal taps on this board that would leave it unsolvable. Spends from a shared node budget. */
function trapsAt(board: Board, limit: number, budget: { nodes: number }): number {
  let traps = 0;
  for (const b of board.blocks.values()) {
    if (budget.nodes <= 0) break;
    if (b.twin !== undefined && b.twin < b.id) continue;
    if (!board.canProgress(b)) continue;
    const next = copyBoard(board);
    next.tap(b.id);
    const r = search(next, Math.min(limit, budget.nodes));
    budget.nodes -= r.nodes;
    if (r.solvable === false) traps++;
  }
  return traps;
}

/**
 * How tricky a level is: walk along a solution and, at every step, count the legal taps that
 * would ruin the board.
 */
export function countTraps(level: Level, limit = 5_000, cap = 15, totalNodes = 40_000): number {
  const solution = level.solution ?? search(new Board(level), limit * 4).moves;
  if (!solution.length) return 0;
  const budget = { nodes: totalNodes };
  const board = new Board(level);
  let traps = trapsAt(board, limit, budget);
  for (const id of solution) {
    if (traps >= cap || budget.nodes <= 0) break;
    board.tap(id);
    traps += trapsAt(board, limit, budget);
  }
  return traps;
}

/** Check a tap sequence really clears the level under the game's rules. */
export function replay(level: Level, taps: number[]): boolean {
  const board = new Board(level);
  for (const id of taps) {
    const r = board.tap(id);
    if (r.kind !== 'exit' && r.kind !== 'slide') return false;
    if (board.exploded !== null) return false;
  }
  return board.cleared;
}

/**
 * How often a player who taps any block that can move (without thinking) still wins.
 * The main difficulty measure: low = you have to plan. Deterministic for a given seed.
 */
export function randomWinRate(level: Level, runs = 120, seed = 1): number {
  const rng = new Rng(seed);
  const start = new Board(level);
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const b = copyBoard(start);
    while (!b.cleared && b.exploded === null) {
      const moves: number[] = [];
      for (const x of b.blocks.values()) {
        if (x.twin !== undefined && x.twin < x.id && b.blocks.has(x.twin)) continue;
        if (b.canProgress(x)) moves.push(x.id);
      }
      if (!moves.length) break;
      b.tap(rng.pick(moves));
    }
    if (b.cleared) wins++;
  }
  return wins / runs;
}

/**
 * True if the level can't be solved without sliding some slider partway; null if we can't tell.
 * Bomb fuses are ignored (they only ever make a level harder, so "unsolvable without slides"
 * still holds with them). Spinners make the plain version expensive to search, so those are null.
 */
export function needsSlides(level: Level, limit = 50_000): boolean | null {
  if (!level.blocks.some((b) => b.slider)) return false;
  if (level.blocks.some((b) => b.spinner)) return null;
  const plain: Level = { ...level, blocks: level.blocks.map(({ slider: _s, fuse: _f, ...b }) => b) };
  const r = solve(plain, limit).solvable;
  return r === null ? null : !r;
}
