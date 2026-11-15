import { Board, cellsOf, headOf } from './board';
import { Rng } from './rng';
import { demoteUselessSliders, replay } from './solver';
import { Block, DELTA, DIRS, Dir, Gate, Level, isHorizontal, turnCCW } from './types';

export interface GenParams {
  w: number;
  h: number;
  /** Target fraction of cells covered by blocks (0..1). */
  density: number;
  /** Longest block, in cells. */
  maxLen: number;
  /** 0..1 — how strongly to prefer placements that sit in front of other blocks (harder). */
  tangle: number;
  walls: number;
  locks: number;
  /** Number of slider blocks. */
  sliders: number;
  /** 0..1 — chance, after each placement, of pulling a slider back so it must be slid partway later. */
  pullback: number;
  /** Number of twin pairs. */
  twins: number;
  /** Number of bombs. */
  bombs: number;
  /** Spare moves on each bomb's fuse beyond the fastest possible. */
  bombSlack: number;
  /** Number of spinners. */
  spinners: number;
  /** Number of gates. */
  gates: number;
  /** Number of built-in forced slides (see `forcedSlideTemplate`). Needs sliders. */
  forced?: number;
}

export const NO_SPECIALS = { sliders: 0, pullback: 0, twins: 0, bombs: 0, bombSlack: 0, spinners: 0, gates: 0, locks: 0, forced: 0 };

export interface GenResult {
  level: Level;
  /** How many necessary partial slides were built in. */
  pullbacks: number;
}

interface Candidate {
  block: Block;
  /** Length of its path to the edge. 0 = sitting on the edge pointing out: always free, never interesting. */
  ray: number;
  /** Roughly how many existing blocks this placement would sit in front of. */
  blocks: number;
  /** Placements that set up slider puzzles (see `sliderHotspots`). */
  bonus: number;
}

/**
 * Builds a level backwards, as a list of steps the player will later perform in reverse:
 *
 * - Place a block (or a twin pair) whose path to the edge is clear right now. Blocks placed later
 *   are removed earlier, so they are allowed to sit in its way. Each placement is a "block leaves"
 *   event in the real game, so spinners already on the board turn back a quarter (they'll turn
 *   forward again when it leaves).
 * - Optionally drop a gate keyed to the block just placed: in the real game the gate is there
 *   until that block leaves.
 * - Pull a slider back along its line. Only allowed when something sits directly in front of it,
 *   so in the real game tapping it slides forward and stops exactly where it was.
 *
 * Playing the steps in reverse always clears the board — the level ships with that solution.
 */
export function generate(seed: number, p: GenParams): Level {
  return generateWithStats(seed, p).level;
}

export function generateWithStats(seed: number, p: GenParams): GenResult {
  const rng = new Rng(seed);
  const walls = placeWalls(rng, p);
  const board = new Board({ w: p.w, h: p.h, blocks: [], walls });
  const target = Math.floor(p.w * p.h * p.density) - walls.length;
  const expected = Math.max(1, target / 2.1);
  let covered = 0;
  let nextId = 0;
  let pullbacks = 0;
  const left = { sliders: p.sliders, twins: p.twins, spinners: p.spinners, gates: p.gates, forced: p.forced ?? 0 };
  /** Forward-order taps, built back to front. */
  const steps: number[] = [];
  const gates: Gate[] = [];
  const pathCount = new Int32Array(p.w * p.h);
  const addPath = (b: Block, sign: 1 | -1) => {
    for (const c of pathCells(board, b)) pathCount[c] += sign;
  };
  // Specials are spread over the first ~75% of placements, so they end up in the middle of the solution.
  const want = (n: number) => n > 0 && rng.next() < n / Math.max(1, expected * 0.75 - nextId);

  const place = (b: Block) => {
    board.add(b);
    addPath(b, 1);
    covered += b.len;
  };

  while (covered < target) {
    let cands = candidates(board, p.maxLen, nextId, pathCount);
    if (cands.length === 0) break;
    const spinnersBefore = [...board.blocks.values()].filter((b) => b.spinner);

    if (left.forced > 0 && want(left.forced)) {
      const f = forcedSlideTemplate(board, rng, nextId);
      if (f) {
        // Three placements (each a "block leaves" event), then the pull-back.
        for (const b of f.blocks) {
          for (const sp of board.blocks.values()) if (sp.spinner) sp.dir = turnCCW(sp.dir);
          place(b);
          steps.push(b.id);
          nextId++;
        }
        const { dx, dy } = DELTA[f.slider.dir];
        addPath(f.slider, -1);
        board.remove(f.slider.id);
        const moved = { ...f.slider, x: f.slider.x - dx * f.back, y: f.slider.y - dy * f.back };
        board.add(moved);
        addPath(moved, 1);
        steps.push(f.slider.id);
        pullbacks++;
        left.forced--;
        continue;
      }
    }

    let placed: Block[] = [];
    if (want(left.spinners) && cands.some((c) => c.block.len === 1)) {
      cands = cands.filter((c) => c.block.len === 1);
      const c = choose(rng, cands, p.tangle);
      c.block.spinner = true;
      left.spinners--;
      placed = [c.block];
    } else if (want(left.twins)) {
      const a = choose(rng, cands, p.tangle).block;
      place(a);
      const aPath = new Set(pathCells(board, a));
      const others = candidates(board, Math.min(p.maxLen, 3), nextId + 1, pathCount).filter((c) => {
        const [ax, ay] = cellsOf(a)[0];
        const [bx, by] = cellsOf(c.block)[0];
        // far enough apart to read as a pair, and not in each other's way
        return Math.abs(ax - bx) + Math.abs(ay - by) >= 3 && !cellsOf(c.block).some(([x, y]) => aPath.has(y * board.w + x));
      });
      if (others.length) {
        const b = choose(rng, others, p.tangle).block;
        a.twin = b.id;
        b.twin = a.id;
        left.twins--;
        placed = [a, b];
      } else {
        placed = [a];
      }
      covered -= a.len; // placed again below
      board.remove(a.id);
      addPath(a, -1);
    } else {
      // When a slider is set up for it, often deliberately place the block that makes a trap
      // (bonus 6) or a necessary slide (bonus 2.5) instead of leaving it to chance.
      if (p.sliders > 0) {
        const traps = cands.filter((c) => c.bonus >= 6);
        const setups = cands.filter((c) => c.bonus >= 2.5);
        if (traps.length && rng.next() < 0.45) cands = traps;
        else if (setups.length && rng.next() < 0.75) cands = setups;
      }
      const c = choose(rng, cands, p.tangle);
      // A slider on the edge pointing out could never slide partway — don't waste one there.
      if (c.ray > 0 && want(left.sliders) && c.block.len <= 3) {
        c.block.slider = true;
        left.sliders--;
      }
      placed = [c.block];
    }
    for (const b of placed) place(b);
    nextId += placed.length;
    steps.push(placed[0].id);
    // This placement is a "block leaves" event in the real game: spinners turn back a quarter.
    for (const s of spinnersBefore) s.dir = turnCCW(s.dir);

    if (left.gates > 0 && placed.length === 1 && !placed[0].slider && want(left.gates)) {
      const g = placeGate(board, rng, pathCount, placed[0].id);
      if (g) {
        gates.push(g);
        board.addGate(g);
        left.gates--;
      }
    }

    if (p.sliders > 0 && rng.next() < p.pullback) {
      const pb = tryPullback(board, rng, pathCount, addPath);
      if (pb) {
        steps.push(pb.id);
        if (pb.forced) pullbacks++;
      }
    }
  }

  const blocks = board.snapshot().blocks;
  const level: Level = { w: p.w, h: p.h, blocks, walls, gates, solution: steps.slice().reverse() };
  addLocks(rng, level, p.locks);
  addBombs(rng, level, p.bombs, p.bombSlack);
  demoteUselessSliders(level);
  const out = normalize(level);
  if (!replay(out, out.solution!)) throw Object.assign(new Error(`generator produced a level its own solution can't clear (seed ${seed})`), { level: out });
  return { level: out, pullbacks };
}

/**
 * A gate goes on an empty cell that as many existing blocks as possible need to pass through —
 * but never in its own key's path (the key has to leave while the gate is still closed).
 */
function placeGate(board: Board, rng: Rng, pathCount: Int32Array, key: number): Gate | null {
  const keyPath = new Set(pathCells(board, board.blocks.get(key)!));
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      if (board.at(x, y) !== null || keyPath.has(y * board.w + x)) continue;
      const score = pathCount[y * board.w + x] + rng.next() * 0.9;
      if (pathCount[y * board.w + x] >= 1 && (!best || score > best.score)) best = { x, y, score };
    }
  }
  return best ? { x: best.x, y: best.y, key } : null;
}

/**
 * Cells that make sliders interesting:
 * - `ahead`: right in front of a slider. A block here lets the slider be pulled back (a forced slide).
 * - `stop`: further along a slider's line with empty cells before it. A block here leaves a gap the
 *   slider can move into.
 * - `gap` / `chain`: the empty cells between a slider and the block that stops it, and the exit paths
 *   of that stopper and everything it waits on. A new block sitting in `chain` whose own path crosses
 *   `gap` is a trap: slide too early and nothing can ever move again.
 */
function sliderHotspots(board: Board) {
  const ahead = new Set<number>();
  const stop = new Set<number>();
  /** Empty cells between a slider and its stopper — keep them open, they're what makes traps possible. */
  const gaps = new Set<number>();
  /** A block in `chain` whose own path crosses `gap` makes a trap (gap ahead) or a forced slide (gap behind). */
  const traps: Array<{ gap: Set<number>; chain: Set<number>; weight: number }> = [];
  const occ = (c: number) => board.at(c % board.w, Math.floor(c / board.w));
  for (const b of board.blocks.values()) {
    if (!b.slider) continue;
    const ray = pathCells(board, b);
    const firstHit = ray.findIndex((c) => occ(c) !== null);
    if (firstHit === -1) {
      if (ray.length > 0) ahead.add(ray[0]);
      for (let i = 1; i < ray.length; i++) stop.add(ray[i]);
      continue;
    }
    const hitCell = ray[firstHit];
    const o = occ(hitCell);
    const stopper = typeof o === 'number' ? o : board.gates.find((g) => g.y * board.w + g.x === hitCell)?.key;
    if (stopper === undefined) continue;
    const chain = waitChainPaths(board, stopper, b.id);
    if (firstHit > 0) {
      // Gap in front: slide too early and whoever exits through the gap is sealed in.
      for (const c of ray.slice(0, firstHit)) gaps.add(c);
      traps.push({ gap: new Set(ray.slice(0, firstHit)), chain, weight: 6 });
    } else {
      // Pressed against its stopper: the empty cells behind it are where a pull-back would land.
      // A block that the stopper waits on, whose path runs through there, makes that slide necessary.
      const { dx, dy } = DELTA[b.dir];
      const behind = new Set<number>();
      const tail = cellsOf(b)[b.dir === 'right' || b.dir === 'down' ? 0 : b.len - 1];
      let [x, y] = tail;
      for (let k = 0; k < 3; k++) {
        x -= dx;
        y -= dy;
        if (!board.inBounds(x, y) || board.at(x, y) !== null) break;
        behind.add(y * board.w + x);
      }
      if (behind.size) traps.push({ gap: behind, chain, weight: 2.5 });
    }
  }
  return { ahead, stop, gaps, traps };
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Build a guaranteed forced slide around an existing slider S (shown pointing right):
 *
 *   - O goes right in front of S, pointing across S's line (S will wait on O).
 *   - M goes somewhere on O's path, pointing back past S (O waits on M).
 *   - N goes on M's path, in line with a cell just behind S, pointing across S's line (M waits on N).
 *   - S is pulled back over that cell (N waits on S).
 *
 * That's a cycle — unless S slides forward first, which uncovers N's exit. Returns the three new
 * blocks (in placement order) and how far to pull S back, or null if no layout fits.
 */
function forcedSlideTemplate(board: Board, rng: Rng, id: number): { blocks: Block[]; slider: Block; back: number } | null {
  const sliders = rng.shuffle([...board.blocks.values()].filter((b) => b.slider));
  for (const S of sliders) {
    const { dx, dy } = DELTA[S.dir];
    const [hx, hy] = headOf(S);
    const ax = hx + dx, ay = hy + dy;
    if (!board.inBounds(ax, ay) || board.at(ax, ay) !== null) continue;
    const cells = cellsOf(S);
    const [tx, ty] = S.dir === 'right' || S.dir === 'down' ? cells[0] : cells[cells.length - 1];
    const behind: Array<[number, number]> = [];
    for (let t = 1; t <= 3; t++) {
      const bx = tx - dx * t, by = ty - dy * t;
      if (!board.inBounds(bx, by) || board.at(bx, by) !== null) break;
      behind.push([bx, by]);
    }
    if (!behind.length) continue;
    const horiz = isHorizontal(S.dir);
    const across: Dir[] = horiz ? ['up', 'down'] : ['left', 'right'];
    for (const od of rng.shuffle([...across])) {
      const O: Block = { id, x: ax, y: ay, len: 1, dir: od };
      if (board.probe(O).hit !== null) continue;
      board.add(O);
      for (const mc of rng.shuffle(pathCells(board, O))) {
        const M: Block = { id: id + 1, x: mc % board.w, y: Math.floor(mc / board.w), len: 1, dir: OPPOSITE[S.dir] };
        if (!board.canPlace(M) || board.probe(M).hit !== null) continue;
        board.add(M);
        const mPath = new Set(pathCells(board, M));
        for (const [t, [bx, by]] of rng.shuffle(behind.map((c, i) => [i + 1, c] as [number, [number, number]]))) {
          const nx = horiz ? bx : M.x;
          const ny = horiz ? M.y : by;
          if (!mPath.has(ny * board.w + nx)) continue;
          const nd: Dir = horiz ? (ny < by ? 'down' : 'up') : nx < bx ? 'right' : 'left';
          const N: Block = { id: id + 2, x: nx, y: ny, len: 1, dir: nd };
          if (!board.canPlace(N) || board.probe(N).hit !== null) continue;
          if (!pathCells(board, N).includes(by * board.w + bx)) continue;
          board.remove(M.id);
          board.remove(O.id);
          return { blocks: [O, M, N], slider: S, back: t };
        }
        board.remove(M.id);
      }
      board.remove(O.id);
    }
  }
  return null;
}

/** Cells on the exit paths of `first` and of everything it waits on (blocks in those paths, gate keys). */
function waitChainPaths(board: Board, first: number, skip: number): Set<number> {
  const cells = new Set<number>();
  const seen = new Set<number>([first]);
  const queue = [first];
  while (queue.length) {
    const m = board.blocks.get(queue.pop()!);
    if (!m) continue;
    for (const c of pathCells(board, m)) {
      cells.add(c);
      const x = c % board.w, y = Math.floor(c / board.w);
      const o = board.at(x, y);
      const next = typeof o === 'number' ? o : o === 'wall' ? board.gates.find((g) => g.x === x && g.y === y)?.key : undefined;
      if (next !== undefined && next !== skip && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return cells;
}

/**
 * Pull one slider back along its line (see `generate`). The best pull-backs are *necessary*: the
 * slider lands on the path of a block that its own stopper is waiting on. Then the slider can't
 * leave whole (its stopper is still there) and that block can't leave past it, so the only way
 * through is to slide it partway first. Unnecessary pull-backs are only taken occasionally.
 */
function tryPullback(board: Board, rng: Rng, pathCount: Int32Array, addPath: (b: Block, s: 1 | -1) => void): { id: number; forced: boolean } | null {
  let best: { b: Block; steps: number; score: number; forced: boolean } | null = null;
  for (const b of board.blocks.values()) {
    if (!b.slider) continue;
    const probe = board.probe(b);
    if (probe.hit === null || probe.distance > 0) continue; // must be pressed right up against something
    const [hx, hy] = headOf(b);
    const { dx, dy } = DELTA[b.dir];
    const ax = hx + dx, ay = hy + dy;
    const stopper = probe.hit === 'wall' ? board.gates.find((g) => g.x === ax && g.y === ay)?.key : probe.hit;
    const chain = stopper === undefined ? new Set<number>() : waitChainPaths(board, stopper, b.id);
    const old = new Set(cellsOf(b).map(([x, y]) => y * board.w + x));
    for (let steps = 1; steps <= 4; steps++) {
      const moved: Block = { ...b, x: b.x - dx * steps, y: b.y - dy * steps };
      const cells = cellsOf(moved);
      const ok = cells.every(([x, y]) => board.inBounds(x, y) && (board.at(x, y) === null || board.at(x, y) === b.id));
      if (!ok) break;
      let necessary = 0;
      let other = 0;
      for (const [x, y] of cells) {
        const c = y * board.w + x;
        if (old.has(c)) continue;
        if (chain.has(c)) necessary++;
        other += pathCount[c];
      }
      const score = necessary * 4 + other * 0.5 + rng.next() * 0.3;
      if (!best || score > best.score) best = { b, steps, score, forced: necessary > 0 };
    }
  }
  if (!best || (!best.forced && rng.next() > 0.25)) return null;
  const { b, steps } = best;
  const { dx, dy } = DELTA[b.dir];
  addPath(b, -1);
  board.remove(b.id);
  const moved = { ...b, x: b.x - dx * steps, y: b.y - dy * steps };
  board.add(moved);
  addPath(moved, 1);
  return { id: b.id, forced: best.forced };
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
  const hot = sliderHotspots(board);
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      if (board.at(x, y) !== null) continue;
      for (let len = 1; len <= maxLen; len++) {
        for (const dir of DIRS) {
          const block: Block = { id, x, y, len, dir };
          if (!board.canPlace(block)) continue;
          if (board.probe(block).hit !== null) continue;
          let blocks = 0;
          let bonus = 0;
          const own = cellsOf(block).map(([cx, cy]) => cy * board.w + cx);
          let fillsGap = false;
          for (const c of own) {
            blocks += pathCount[c];
            if (hot.stop.has(c)) bonus = Math.max(bonus, 1.5);
            else if (hot.ahead.has(c)) bonus = Math.max(bonus, 1);
            if (hot.gaps.has(c)) fillsGap = true;
          }
          if (hot.traps.length) {
            const path = pathCells(board, block);
            let best = 0;
            for (const t of hot.traps) {
              if (t.weight > best && own.some((c) => t.chain.has(c)) && path.some((c) => t.gap.has(c))) best = t.weight;
            }
            bonus += best;
          }
          out.push({ block, ray: board.probe(block).distance, blocks, bonus: fillsGap ? -1 : bonus });
        }
      }
    }
  }
  return out;
}

function pathCells(board: Board, b: Block): number[] {
  const out: number[] = [];
  let [x, y] = headOf(b);
  const { dx, dy } = DELTA[b.dir];
  for (;;) {
    x += dx;
    y += dy;
    if (!board.inBounds(x, y)) return out;
    out.push(y * board.w + x);
  }
}

function choose(rng: Rng, cands: Candidate[], tangle: number): Candidate {
  // Favour 2-long blocks (they read best), and — when tangle is high — placements that
  // sit in front of other blocks, which makes longer chains and fewer free blocks at the start.
  let total = 0;
  const weights = cands.map((c) => {
    const lenW = c.block.len === 2 ? 1.6 : c.block.len === 1 ? 0.5 : 1;
    let w = c.blocks > 0 ? lenW * (1 + tangle * 5 * c.blocks) : lenW * Math.max(0.03, 1 - tangle * 0.97);
    w *= c.bonus < 0 ? 0.05 : 1 + 4 * c.bonus;
    // Long paths are easy for later blocks to cover; blocks already on the edge pointing out stay free forever.
    w *= c.ray === 0 ? Math.max(0.05, 1 - tangle) : 1 + tangle * 0.15 * c.ray;
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

const plain = (b: Block) => !b.slider && !b.spinner && b.twin === undefined && b.fuse === undefined && b.lockedBy === undefined;

/**
 * Locks: block L stays locked until key block K has left. Valid when K leaves before L in the
 * known solution. Prefer L blocks that are free at the start, and keys that are buried.
 */
function addLocks(rng: Rng, level: Level, count: number) {
  if (count <= 0 || level.blocks.length < 6) return;
  const pos = new Map(level.solution!.map((id, i) => [id, i]));
  const exitPos = (id: number) => {
    // a block's last tap is when it leaves (sliders may be tapped earlier to slide)
    let last = -1;
    level.solution!.forEach((t, i) => {
      if (t === id) last = i;
    });
    const b = level.blocks.find((x) => x.id === id)!;
    if (b.twin !== undefined && last === -1) return exitPos(b.twin);
    return last === -1 ? (pos.get(id) ?? Infinity) : last;
  };
  const board = new Board(level);
  const used = new Set<number>();
  for (let n = 0; n < count; n++) {
    const lockable = rng.shuffle(level.blocks.filter((b) => plain(b) && !used.has(b.id) && board.isFree(b)));
    const fallback = rng.shuffle(level.blocks.filter((b) => plain(b) && !used.has(b.id)));
    const L = lockable[0] ?? fallback[0];
    if (!L) return;
    const keys = level.blocks.filter((k) => k.id !== L.id && !used.has(k.id) && exitPos(k.id) < exitPos(L.id) && !board.isFree(k));
    if (!keys.length) return;
    // Prefer the key that leaves latest before L — it's the deepest dig.
    keys.sort((a, b) => exitPos(b.id) - exitPos(a.id));
    const K = keys[Math.min(keys.length - 1, rng.int(0, 2))];
    L.lockedBy = K.id;
    used.add(L.id);
    used.add(K.id);
  }
}

/**
 * Bombs: pick buried blocks and give each a fuse just long enough. When the level allows it, the
 * solution is re-ordered to dig each bomb out as fast as possible first, so the fuses are tight.
 */
function addBombs(rng: Rng, level: Level, count: number, slack: number) {
  if (count <= 0) return;
  const reorderable = !level.blocks.some((b) => b.slider || b.spinner);
  const start = new Board(level);
  const pool = level.blocks.filter((b) => plain(b) && !level.blocks.some((o) => o.lockedBy === b.id) && !start.isFree(b));
  if (!pool.length) return;
  let targets: Block[];
  if (reorderable) {
    // We'll dig these out first, so pick the deepest (most blockers in the way).
    const depthOf = (b: Block) => blockersOf(start, b).size;
    pool.sort((a, b) => depthOf(b) - depthOf(a));
    targets = rng.shuffle(pool.slice(0, Math.max(count, Math.ceil(pool.length * 0.3)))).slice(0, count);
    targets.sort((a, b) => depthOf(a) - depthOf(b));
  } else {
    // Sliders/spinners: the order can't be shuffled safely, so pick bombs that already leave early
    // in the known solution — their fuses come out short.
    const leaves = (b: Block) => level.solution!.lastIndexOf(b.id);
    pool.sort((a, b) => leaves(a) - leaves(b));
    targets = rng.shuffle(pool.slice(0, Math.max(count, Math.ceil(pool.length * 0.35)))).slice(0, count);
  }

  let solution = level.solution!;
  if (reorderable) {
    const board = new Board(level);
    const order: number[] = [];
    const tapFree = (pick: (free: Block[]) => Block | undefined) => {
      const free = board.freeBlocks();
      const b = pick(free) ?? free[0];
      if (!b) throw new Error('stuck while ordering bombs');
      board.tap(b.id);
      order.push(b.id);
    };
    for (const t of targets) {
      while (board.blocks.has(t.id)) {
        const need = blockersOf(board, t);
        tapFree((free) => free.find((b) => b.id === t.id) ?? free.find((b) => need.has(b.id)));
      }
    }
    while (!board.cleared) tapFree(() => undefined);
    solution = order;
  }
  level.solution = solution;
  for (const t of targets) {
    const leavesAt = solution.lastIndexOf(t.id) + 1;
    const b = level.blocks.find((x) => x.id === t.id)!;
    b.fuse = leavesAt + slack;
  }
}

/** Every block that must leave before `t` can (things in its path, their blockers, lock keys…). */
function blockersOf(board: Board, t: Block): Set<number> {
  const out = new Set<number>();
  const queue: Block[] = [t];
  while (queue.length) {
    const b = queue.pop()!;
    const deps: number[] = [];
    let [x, y] = headOf(b);
    const { dx, dy } = DELTA[b.dir];
    for (;;) {
      x += dx;
      y += dy;
      if (!board.inBounds(x, y)) break;
      const o = board.at(x, y);
      if (typeof o === 'number') deps.push(o);
      else if (o === 'wall') {
        const g = board.gates.find((g) => g.x === x && g.y === y);
        if (g) deps.push(g.key);
      }
    }
    if (b.lockedBy !== undefined && board.blocks.has(b.lockedBy)) deps.push(b.lockedBy);
    if (b.twin !== undefined && board.blocks.has(b.twin)) deps.push(b.twin);
    for (const d of deps) {
      if (d === t.id || out.has(d)) continue;
      out.add(d);
      queue.push(board.blocks.get(d)!);
    }
  }
  return out;
}

/** Renumber ids 0..n-1 in reading order so saved data and visuals are stable. */
function normalize(level: Level): Level {
  const sorted = [...level.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const remap = new Map(sorted.map((b, i) => [b.id, i]));
  const r = (id: number) => remap.get(id)!;
  return {
    ...level,
    blocks: sorted.map((b) => ({
      ...b,
      id: r(b.id),
      ...(b.lockedBy !== undefined ? { lockedBy: r(b.lockedBy) } : {}),
      ...(b.twin !== undefined ? { twin: r(b.twin) } : {}),
    })),
    gates: (level.gates ?? []).map((g) => ({ ...g, key: r(g.key) })),
    solution: level.solution?.map(r),
  };
}
