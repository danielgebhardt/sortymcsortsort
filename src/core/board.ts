import { Block, DELTA, Gate, Hit, Level, TapResult, isHorizontal, turnCW } from './types';

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
const GATE = -2;
const EMPTY = 0;

export interface MoveEffects {
  /** Spinners turned (because a block left). */
  spun: boolean;
  /** A bomb ran out of moves. */
  exploded: number | null;
  /** Gates that opened (their key left). */
  opened: Gate[];
}

export interface BoardState {
  blocks: Block[];
  gates: Gate[];
}

/** Mutable game state for one level. Pure logic, no rendering. */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly blocks = new Map<number, Block>();
  /** Set when a bomb's fuse hits zero — the level is lost. */
  exploded: number | null = null;
  /** Gates still closed. */
  gates: Gate[] = [];
  /** cell value: 0 empty, -1 wall, otherwise blockId + 1 */
  private grid: Int32Array;

  constructor(level: Pick<Level, 'w' | 'h' | 'blocks' | 'walls' | 'gates'>) {
    this.w = level.w;
    this.h = level.h;
    this.grid = new Int32Array(level.w * level.h);
    for (const [x, y] of level.walls) this.grid[y * this.w + x] = WALL;
    for (const g of level.gates ?? []) this.addGate(g);
    for (const b of level.blocks) this.add({ ...b });
  }

  addGate(g: Gate) {
    this.gates.push({ ...g });
    this.grid[g.y * this.w + g.x] = GATE;
  }

  /** Open every gate whose key is no longer on the board. */
  private openGates(): Gate[] {
    const opened = this.gates.filter((g) => !this.blocks.has(g.key));
    if (opened.length) {
      for (const g of opened) this.grid[g.y * this.w + g.x] = EMPTY;
      this.gates = this.gates.filter((g) => this.blocks.has(g.key));
    }
    return opened;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Returns blockId, 'wall' (walls and closed gates), or null for empty. */
  at(x: number, y: number): Hit | null {
    const v = this.grid[y * this.w + x];
    if (v === EMPTY) return null;
    if (v < 0) return 'wall';
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

  partnerOf(b: Block): Block | undefined {
    return b.twin !== undefined ? this.blocks.get(b.twin) : undefined;
  }

  /**
   * Walk from the block's head toward the edge.
   * Returns how many free cells it can travel and what (if anything) stops it.
   */
  probe(b: Block): { distance: number; hit: Hit | null } {
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

  /** Could this block leave the board right now (twins: together with its partner)? */
  isFree(b: Block): boolean {
    if (this.isLocked(b) || this.probe(b).hit !== null) return false;
    const p = this.partnerOf(b);
    return !p || (!this.isLocked(p) && this.probe(p).hit === null);
  }

  /** Would tapping this block do anything useful (leave, or slide)? */
  canProgress(b: Block): boolean {
    if (this.isFree(b)) return true;
    if (!b.slider || this.isLocked(b)) return false;
    return this.probe(b).distance > 0;
  }

  freeBlocks(): Block[] {
    return [...this.blocks.values()].filter((b) => this.isFree(b));
  }

  get cleared() {
    return this.blocks.size === 0;
  }

  /** Move a block `steps` cells in its arrow direction (no checks — callers probe first). */
  shift(id: number, steps: number) {
    const b = this.blocks.get(id)!;
    const { dx, dy } = DELTA[b.dir];
    this.remove(id);
    this.add({ ...b, x: b.x + dx * steps, y: b.y + dy * steps });
  }

  /** Apply a player tap. */
  tap(id: number): TapResult & { effects?: MoveEffects } {
    const b = this.blocks.get(id);
    if (!b || this.exploded !== null) return { kind: 'none' };
    if (this.isLocked(b)) return { kind: 'locked', id };
    const partner = this.partnerOf(b);
    if (partner && this.isLocked(partner)) return { kind: 'locked', id: partner.id };

    const { distance, hit } = this.probe(b);
    if (hit === null) {
      if (partner) {
        const pp = this.probe(partner);
        if (pp.hit !== null) return { kind: 'blocked', id: partner.id, distance: pp.distance, hitId: pp.hit, tapped: id };
        this.remove(id);
        this.remove(partner.id);
        return { kind: 'exit', id, distance, partner: { id: partner.id, distance: pp.distance }, effects: this.afterMove(true) };
      }
      this.remove(id);
      return { kind: 'exit', id, distance, effects: this.afterMove(true) };
    }
    if (b.slider && distance > 0) {
      this.shift(id, distance);
      return { kind: 'slide', id, distance, hitId: hit, effects: this.afterMove(false) };
    }
    return { kind: 'blocked', id, distance, hitId: hit, tapped: id };
  }

  /** Gates open, spinners turn when something leaves; bombs tick on every successful move. */
  private afterMove(left: boolean): MoveEffects {
    const opened = left ? this.openGates() : [];
    let spun = false;
    for (const b of this.blocks.values()) {
      if (left && b.spinner) {
        b.dir = turnCW(b.dir);
        spun = true;
      }
      if (b.fuse !== undefined) {
        b.fuse -= 1;
        if (b.fuse <= 0 && this.exploded === null) this.exploded = b.id;
      }
    }
    return { spun, exploded: this.exploded, opened };
  }

  /** True if some tap would make progress. */
  hasMove(): boolean {
    for (const b of this.blocks.values()) if (this.canProgress(b)) return true;
    return false;
  }

  snapshot(): BoardState {
    return { blocks: [...this.blocks.values()].map((b) => ({ ...b })), gates: this.gates.map((g) => ({ ...g })) };
  }

  restore(state: BoardState) {
    for (const id of [...this.blocks.keys()]) this.remove(id);
    for (const g of this.gates) this.grid[g.y * this.w + g.x] = EMPTY;
    this.gates = [];
    for (const g of state.gates) this.addGate(g);
    for (const b of state.blocks) this.add({ ...b });
    this.exploded = null;
  }

  /** A full copy of the current state as a level. */
  toLevel(): Level {
    const s = this.snapshot();
    return { w: this.w, h: this.h, blocks: s.blocks, walls: this.wallList(), gates: s.gates };
  }

  wallList(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.grid[y * this.w + x] === WALL) out.push([x, y]);
    return out;
  }
}
