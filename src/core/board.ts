import { Block, DELTA, Level, TapResult, isHorizontal } from './types';

export function cellsOf(b: Block): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const horiz = isHorizontal(b.dir);
  for (let i = 0; i < b.len; i++) out.push(horiz ? [b.x + i, b.y] : [b.x, b.y + i]);
  return out;
}

/** The cell at the front of the block, in the direction it moves. */
export function headOf(b: Block): [number, number] {
  const cells = cellsOf(b);
  return b.dir === 'right' || b.dir === 'down' ? cells[cells.length - 1] : cells[0];
}

const WALL = -1;
const EMPTY = 0;

/** Mutable game state for one level. Pure logic, no rendering. */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly blocks = new Map<number, Block>();
  /** cell value: 0 empty, -1 wall, otherwise blockId + 1 */
  private grid: Int32Array;

  constructor(level: Level) {
    this.w = level.w;
    this.h = level.h;
    this.grid = new Int32Array(level.w * level.h);
    for (const [x, y] of level.walls) this.grid[y * this.w + x] = WALL;
    for (const b of level.blocks) this.add({ ...b });
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Returns blockId, 'wall', or null for empty. */
  at(x: number, y: number): number | 'wall' | null {
    const v = this.grid[y * this.w + x];
    if (v === EMPTY) return null;
    if (v === WALL) return 'wall';
    return v - 1;
  }

  canPlace(b: Block): boolean {
    return cellsOf(b).every(([x, y]) => this.inBounds(x, y) && this.grid[y * this.w + x] === EMPTY);
  }

  add(b: Block) {
    if (!this.canPlace(b)) throw new Error(`Block ${b.id} overlaps or is out of bounds`);
    this.blocks.set(b.id, b);
    for (const [x, y] of cellsOf(b)) this.grid[y * this.w + x] = b.id + 1;
  }

  remove(id: number) {
    const b = this.blocks.get(id);
    if (!b) return;
    for (const [x, y] of cellsOf(b)) this.grid[y * this.w + x] = EMPTY;
    this.blocks.delete(id);
  }

  isLocked(b: Block) {
    return b.lockedBy !== undefined && this.blocks.has(b.lockedBy);
  }

  /**
   * Walk from the block's head toward the edge.
   * Returns how many free cells it can travel and what (if anything) stops it.
   */
  probe(b: Block): { distance: number; hit: number | 'wall' | null } {
    const { dx, dy } = DELTA[b.dir];
    let [x, y] = headOf(b);
    let distance = 0;
    for (;;) {
      x += dx;
      y += dy;
      if (!this.inBounds(x, y)) return { distance, hit: null };
      const occ = this.at(x, y);
      if (occ !== null) return { distance, hit: occ };
      distance++;
    }
  }

  isFree(b: Block) {
    return !this.isLocked(b) && this.probe(b).hit === null;
  }

  freeBlocks(): Block[] {
    return [...this.blocks.values()].filter((b) => this.isFree(b));
  }

  get cleared() {
    return this.blocks.size === 0;
  }

  /** Apply a player tap. Exiting blocks are removed from the board. */
  tap(id: number): TapResult {
    const b = this.blocks.get(id);
    if (!b) return { kind: 'none' };
    if (this.isLocked(b)) return { kind: 'locked', id };
    const { distance, hit } = this.probe(b);
    if (hit === null) {
      this.remove(id);
      return { kind: 'exit', id, distance };
    }
    return { kind: 'blocked', id, distance, hitId: hit };
  }
}
