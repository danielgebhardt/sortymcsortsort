import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { solve } from '../src/core/solver';
import type { Level } from '../src/core/types';

const lvl = (l: Partial<Level> & Pick<Level, 'blocks'>): Level => ({ w: 4, h: 4, walls: [], ...l });

describe('Board', () => {
  it('lets a block with a clear path exit', () => {
    const b = new Board(lvl({ blocks: [{ id: 0, x: 1, y: 1, len: 2, dir: 'right' }] }));
    expect(b.tap(0)).toEqual({ kind: 'exit', id: 0, distance: 1 });
    expect(b.cleared).toBe(true);
  });

  it('stops a block at the first obstacle and keeps it on the board', () => {
    const b = new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'down' },
        { id: 1, x: 0, y: 3, len: 2, dir: 'right' },
      ],
    }));
    expect(b.tap(0)).toEqual({ kind: 'blocked', id: 0, distance: 2, hitId: 1 });
    expect(b.blocks.has(0)).toBe(true);
  });

  it('uses the far end of a long block as its head', () => {
    const b = new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 3, dir: 'down' },
        { id: 1, x: 0, y: 3, len: 1, dir: 'left' },
      ],
    }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', distance: 0, hitId: 1 });
    b.tap(1);
    expect(b.tap(0)).toMatchObject({ kind: 'exit', distance: 1 });
  });

  it('treats walls as permanent obstacles', () => {
    const b = new Board(lvl({ walls: [[3, 0]], blocks: [{ id: 0, x: 0, y: 0, len: 1, dir: 'right' }] }));
    expect(b.tap(0)).toMatchObject({ kind: 'blocked', hitId: 'wall', distance: 2 });
  });

  it('keeps a locked block in place until its key exits', () => {
    const b = new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'up', lockedBy: 1 },
        { id: 1, x: 2, y: 2, len: 1, dir: 'down' },
      ],
    }));
    expect(b.tap(0)).toEqual({ kind: 'locked', id: 0 });
    b.tap(1);
    expect(b.tap(0).kind).toBe('exit');
  });

  it('rejects overlapping blocks', () => {
    expect(() => new Board(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 2, dir: 'right' },
        { id: 1, x: 1, y: 0, len: 1, dir: 'up' },
      ],
    }))).toThrow();
  });
});

describe('solve', () => {
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
    expect(r.rounds.length).toBe(3);
  });

  it('detects a deadlock (two blocks facing each other)', () => {
    const r = solve(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'right' },
        { id: 1, x: 1, y: 0, len: 1, dir: 'left' },
      ],
    }));
    expect(r.solvable).toBe(false);
  });

  it('detects a lock cycle', () => {
    const r = solve(lvl({
      blocks: [
        { id: 0, x: 0, y: 0, len: 1, dir: 'up', lockedBy: 1 },
        { id: 1, x: 3, y: 3, len: 1, dir: 'down', lockedBy: 0 },
      ],
    }));
    expect(r.solvable).toBe(false);
  });
});
