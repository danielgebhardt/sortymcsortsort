import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { generate, GenParams } from '../src/core/generator';
import { buildLevel, CHAPTERS, chapterFor, pack, paramsFor, TUTORIAL, unpack } from '../src/core/progression';
import { replay, solve } from '../src/core/solver';
import packed from '../src/levels/levels.json';

describe('generator', () => {
  it('every generated level is cleared by its own solution, for all mechanics', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const p: GenParams = {
        w: 4 + (seed % 6), h: 5 + (seed % 7), density: 0.85, maxLen: 3, tangle: (seed % 10) / 9,
        walls: seed % 4, locks: seed % 3,
        sliders: seed % 3, pullback: (seed % 7) / 7, twins: (seed >> 1) % 3, bombs: (seed >> 2) % 3, bombSlack: seed % 3,
        spinners: (seed >> 3) % 3, gates: (seed >> 4) % 3,
      };
      const level = generate(seed, p);
      expect(() => new Board(level)).not.toThrow();
      expect(replay(level, level.solution!), `seed ${seed}`).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const p = paramsFor(470);
    expect(generate(42, p)).toEqual(generate(42, p));
  });

  it('tutorial levels are solvable', () => {
    for (const t of TUTORIAL) expect(solve(t).solvable).toBe(true);
  });

  it('chapters cover 600 levels in order, then repeat as endless remixes', () => {
    expect(CHAPTERS).toHaveLength(20);
    CHAPTERS.forEach((c, i) => expect(c.from).toBe(i * 30 + 1));
    expect(chapterFor(600).chapter.name).toBe('Grand Finale');
    expect(chapterFor(601).chapter.name).toMatch(/^Endless/);
  });
});

describe('shipped levels', () => {
  const levels = packed as ReturnType<typeof pack>[];

  it('there are 600', () => expect(levels.length).toBe(600));

  it('each round-trips through pack/unpack and its solution clears it', () => {
    levels.forEach((p, i) => {
      const l = unpack(p);
      expect(pack(l)).toEqual(p);
      expect(replay(l, l.solution!), `level ${i + 1}`).toBe(true);
    });
  });

  it('each chapter actually uses its mechanics', () => {
    for (const c of CHAPTERS) {
      const ls = levels.slice(c.from - 1, c.from + 29).map(unpack);
      const any = (f: (b: ReturnType<typeof unpack>['blocks'][number]) => unknown) => ls.some((l) => l.blocks.some(f));
      if (c.mix.includes('sliders')) expect(any((b) => b.slider), c.name).toBe(true);
      if (c.mix.includes('twins')) expect(any((b) => b.twin !== undefined), c.name).toBe(true);
      if (c.mix.includes('bombs')) expect(any((b) => b.fuse !== undefined), c.name).toBe(true);
      if (c.mix.includes('spinners')) expect(any((b) => b.spinner), c.name).toBe(true);
      if (c.mix.includes('gates')) expect(ls.some((l) => l.gates?.length), c.name).toBe(true);
    }
  });

  it('builds endless levels past the shipped pack', () => {
    for (const n of [601, 650, 999]) {
      const l = buildLevel(n, true);
      expect(replay(l, l.solution!)).toBe(true);
    }
  });
});
