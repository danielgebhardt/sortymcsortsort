import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { generate } from '../src/core/generator';
import { buildLevel, pack, paramsFor, TUTORIAL, unpack } from '../src/core/progression';
import { solve } from '../src/core/solver';
import packed from '../src/levels/levels.json';

describe('generator', () => {
  it('only produces solvable levels across many seeds and sizes', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const p = { w: 4 + (seed % 6), h: 5 + (seed % 7), density: 0.9, maxLen: 3, tangle: (seed % 10) / 9, walls: seed % 4, locks: seed % 3 };
      const level = generate(seed, p);
      expect(() => new Board(level)).not.toThrow();
      expect(solve(level).solvable, `seed ${seed}`).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const p = paramsFor(120);
    expect(generate(42, p)).toEqual(generate(42, p));
  });

  it('tutorial levels are solvable', () => {
    for (const t of TUTORIAL) expect(solve(t).solvable).toBe(true);
  });

  it('every shipped level is solvable and round-trips through pack/unpack', () => {
    expect(packed.length).toBeGreaterThanOrEqual(300);
    for (const p of packed as ReturnType<typeof pack>[]) {
      const l = unpack(p);
      expect(pack(l)).toEqual(p);
      expect(solve(l).solvable).toBe(true);
    }
  });

  it('builds endless levels past the shipped pack', () => {
    for (const n of [301, 350, 999]) expect(solve(buildLevel(n)).solvable).toBe(true);
  });
});
