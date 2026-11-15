import { buildLevel, chapterFor, INTRO, PACKED_LEVELS, unpack, PackedLevel } from '../core/progression';
import type { Level } from '../core/types';
import packed from './levels.json';

const levels = packed as PackedLevel[];
const cache = new Map<number, Level>();

/** Level n (1-based). Levels past the shipped pack are generated on demand. */
export function getLevel(n: number): Level {
  if (n <= levels.length) return unpack(levels[n - 1]);
  if (!cache.has(n)) cache.set(n, buildLevel(n, true));
  return cache.get(n)!;
}

export const SHIPPED_LEVELS = Math.max(levels.length, PACKED_LEVELS);

/** A one-time tip for this level, if it introduces something. */
export function tipFor(n: number): string {
  if (n === INTRO.walls) return 'Stone walls never move —\nplan around them.';
  if (n === INTRO.locks) return 'Locked blocks open once their\nmatching key block slides out.';
  const { chapter, i } = chapterFor(n);
  return i === 0 && chapter.tip ? chapter.tip : '';
}

export { chapterFor };
