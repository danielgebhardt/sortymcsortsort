import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { search, solve } from '../src/core/solver';
import type { Level } from '../src/core/types';

const lvl = (l: Partial<Level> & Pick<Level, 'blocks'>): Level => ({ w: 4, h: 4, walls: [], ...l });

describe('Board — plain blocks', () => {
  it('lets a block with a clear path exit', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 1, y: 1, len: 2, dir: 'right' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'exit', id: 0, distance: 1 });
    expect(b.cleared).toBe(true);
  });

  it('bounces a blocked block and keeps it in place', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'down' }, { id: 1, x: 0, y: 3, len: 2, dir: 'right' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', id: 0, distance: 2, hitId: 1 });
    expect(b.blocks.get(0)).toMatchObject({ x: 0, y: 0 });
  });

  it('uses the far end of a long block as its head', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 3, dir: 'down' }, { id: 1, x: 0, y: 3, len: 1, dir: 'left' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', distance: 0, hitId: 1 });
    b.tap(1);
    expect(b.tap(0)).toMatchObject({ kind: 'exit', distance: 1 });
  });

  it('treats walls as permanent obstacles', () => {
    const b = new Board(lvl({ walls: [[3, 0]], blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', hitId: 'wall', distance: 2 });
  });

  it('keeps a locked block in place until its key exits', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'up', lockedBy: 1 }, { id: 1, x: 2, y: 2, len: 1, dir: 'down' }] }));
    expect(b.tap(0)).toEqual({ kind: 'locked', id: 0 });
    b.tap(1);
    expect(b.tap(0).kind).toBe('exit');
  });

  it('rejects overlapping blocks', () => {
    expect(() => new Board(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 2, dir: 'right' }, { id: 1, x: 1, y: 0, len: 1, dir: 'up' }] }))).toThrow();
  });
});

describe('Board — special blocks', () => {
  it('sliders move as far as they can and stay', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right', slider: true }, { id: 1, x: 3, y: 0, len: 1, dir: 'down' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'slide', distance: 2, hitId: 1 });
    expect(b.blocks.get(0)).toMatchObject({ x: 2, y: 0 });
    // pressed up against block 1 now: tapping again is a bounce
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', distance: 0 });
  });

  it('twins leave together, and only when both are clear', () => {
    const b = new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'up', twin: 1 },
        { id: 1, x: 3, y: 1, len: 1, dir: 'down', twin: 0 },
        { id: 2, x: 3, y: 3, len: 1, dir: 'left' },
      ],
    }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', id: 1, tapped: 0, hitId: 2 });
    expect(b.blocks.size).toBe(3);
    b.tap(2);
    expect(b.tap(0)).toMatchObject({ kind: 'exit', id: 0, partner: { id: 1 } });
    expect(b.cleared).toBe(true);
  });

  it('bombs tick on every successful move and explode at zero', () => {
    const b = new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 3, len: 1, dir: 'right', fuse: 2 },
        { id: 1, x: 3, y: 3, len: 1, dir: 'up' },
        { id: 2, x: 1, y: 0, len: 1, dir: 'up' },
        { id: 3, x: 2, y: 0, len: 1, dir: 'up' },
      ],
    }));
    b.tap(0); // bounce — doesn't tick
    expect(b.blocks.get(0)!.fuse).toBe(2);
    b.tap(2);
    expect(b.blocks.get(0)!.fuse).toBe(1);
    const r = b.tap(3);
    expect(r).toMatchObject({ kind: 'exit', effects: { exploded: 0 } });
    expect(b.tap(1).kind).toBe('none'); // game over
  });

  it('spinners turn clockwise each time another block leaves', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 1, y: 1, len: 1, dir: 'up', spinner: true }, { id: 1, x: 3, y: 3, len: 1, dir: 'down' }] }));
    const r = b.tap(1);
    expect(r).toMatchObject({ kind: 'exit', effects: { spun: true } });
    expect(b.blocks.get(0)!.dir).toBe('right');
  });

  it('gates block until their key leaves', () => {
    const b = new Board(lvl({ gates: [{ x: 2, y: 0, key: 1 }], blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right' }, { id: 1, x: 3, y: 3, len: 1, dir: 'down' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', hitId: 'wall', distance: 1 });
    expect(b.tap(1)).toMatchObject({ kind: 'exit', effects: { opened: [{ x: 2, y: 0, key: 1 }] } });
    expect(b.tap(0).kind).toBe('exit');
  });

  it('snapshot/restore round-trips everything (for undo)', () => {
    const b = new Board(lvl({ gates: [{ x: 2, y: 0, key: 1 }], blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right', fuse: 3 }, { id: 1, x: 3, y: 3, len: 1, dir: 'down' }] }));
    const s = b.snapshot();
    b.tap(1);
    b.restore(s);
    expect(b.gates).toHaveLength(1);
    expect(b.blocks.get(0)!.fuse).toBe(3);
    expect(b.tap(0)).toMatchObject({ kind: 'blocked' });
  });
});

describe('solver', () => {
  it('finds an order through a chain', () => {
    const r = solve(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'right' },
        { id: 1, x: 1, y: 0, len: 1, dir: 'down' },
        { id: 2, x: 1, y: 2, len: 2, dir: 'right' },
      ],
    }));
    expect(r.solvable).toBe(true);
    expect(r.order).toEqual([2, 1, 0]);
    expect(r.depth).toBe(3);
  });

  it('detects a deadlock (two blocks facing each other)', () => {
    expect(solve(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right' }, { id: 1, x: 1, y: 0, len: 1, dir: 'left' }] })).solvable).toBe(false);
  });

  it('detects a lock cycle', () => {
    const r = solve(lvl({ blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'up', lockedBy: 1 }, { id: 1, x: 3, y: 3, len: 1, dir: 'down', lockedBy: 0 }] }));
    expect(r.solvable).toBe(false);
  });

  // S slides right into the gap at (1,1) too early → it blocks N, which O is waiting on, and S waits on O.
  const trap: Level = {
    w: 3, h: 3, walls: [],
    blocks: [
      { id: 0, x: 0, y: 1, len: 1, dir: 'right', slider: true }, // S
      { id: 1, x: 2, y: 1, len: 1, dir: 'down' }, // O
      { id: 2, x: 2, y: 2, len: 1, dir: 'left' }, // waits on N
      { id: 3, x: 1, y: 2, len: 1, dir: 'up' }, // N, exits through the gap
    ],
  };

  it('solves a slider puzzle and recognises the trap move', () => {
    expect(search(new Board(trap)).solvable).toBe(true);
    const b = new Board(trap);
    expect(b.tap(0)).toMatchObject({ kind: 'slide', distance: 1 });
    expect(search(b).solvable).toBe(false);
  });

  it('finds a solution that needs a partial slide', () => {
    // N waits on S, S waits on O, O waits on M, M waits on N — a cycle, unless S slides one step first.
    const blocks = [
      { id: 0, x: 0, y: 1, len: 1, dir: 'right' as const, slider: true }, // S
      { id: 1, x: 2, y: 1, len: 1, dir: 'up' as const }, // O
      { id: 2, x: 2, y: 0, len: 1, dir: 'left' as const }, // M
      { id: 3, x: 0, y: 0, len: 1, dir: 'down' as const }, // N
    ];
    const asPlain: Level = { w: 3, h: 3, walls: [], blocks: blocks.map(({ slider: _s, ...b }) => b) };
    expect(solve(asPlain).solvable).toBe(false);
    const r = search(new Board({ w: 3, h: 3, walls: [], blocks }));
    expect(r.solvable).toBe(true);
    expect(r.moves[0]).toBe(0); // the slide comes first
  });
});
