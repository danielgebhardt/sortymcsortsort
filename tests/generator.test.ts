import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { generate, GenParams } from '../src/core/generator';
import { createHash } from 'node:crypto';
import { buildLevel, CHAPTERS, chapterFor, pack, paramsFor, TUTORIAL, unpack, winCeiling } from '../src/core/progression';
import { needsSlides, randomWinRate, replay, solve } from '../src/core/solver';
import packed from '../src/levels/levels.json';

describe('generator', () => {
  it('every generated level is cleared by its own solution, for all mechanics', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const p: GenParams = {
        w: 4 + (seed % 6), h: 5 + (seed % 7), density: 0.85, maxLen: 3, tangle: (seed % 10) / 9,
        walls: seed % 4, locks: seed % 3,
        sliders: seed % 3, pullback: (seed % 7) / 7, twins: (seed >> 1) % 3, bombs: (seed >> 2) % 3, bombSlack: seed % 3,
        spinners: (seed >> 3) % 3, gates: (seed >> 4) % 3, forced: seed % 2,
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

const FROZEN_HASH = 'ffafee3f5db2f59e2434775d94fc61cebc2641317baf96efffa0030225cf8c98';

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

  // Levels players have already finished must never change. When more levels ship, move this
  // pin forward (FROZEN in scripts/generate-parallel.sh and the count + hash here).
  it('levels 1–30 are frozen', () => {
    const hash = createHash('sha256').update(JSON.stringify(levels.slice(0, 30))).digest('hex');
    expect(hash).toBe(FROZEN_HASH);
  });

  it('from level 31 on, random tapping usually loses', () => {
    let over = 0;
    for (let n = 31; n <= 600; n++) {
      if (randomWinRate(unpack(levels[n - 1]), 60, n) > winCeiling(n) + 0.1) over++;
    }
    expect(over).toBeLessThanOrEqual(Math.floor(570 * 0.05));
  }, 120_000);

  it('sliders usually have to be slid', () => {
    let withSliders = 0, needed = 0;
    for (let n = 31; n <= 600; n++) {
      const l = unpack(levels[n - 1]);
      if (chapterFor(n).i < 2 || !l.blocks.some((b) => b.slider)) continue;
      const ns = needsSlides(l, 20_000);
      if (ns === null) continue; // spinner levels: can't check cheaply
      withSliders++;
      if (ns) needed++;
    }
    expect(needed / withSliders).toBeGreaterThanOrEqual(0.75);
  }, 300_000);

  it('builds endless levels past the shipped pack', () => {
    for (const n of [601, 650, 999]) {
      const l = buildLevel(n, true);
      expect(replay(l, l.solution!)).toBe(true);
    }
  });
});
