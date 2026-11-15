import { buildLevel, PACKED_LEVELS, unpack, PackedLevel } from '../core/progression';
import type { Level } from '../core/types';
import packed from './levels.json';

const levels = packed as PackedLevel[];

/** Level n (1-based). Levels past the shipped pack are generated on demand. */
export function getLevel(n: number): Level {
  if (n <= levels.length) return unpack(levels[n - 1]);
  return buildLevel(n);
}

export const SHIPPED_LEVELS = Math.max(levels.length, PACKED_LEVELS);

/** First level that introduces each mechanic — used to show a one-time tip. */
export const FIRST_WALL_LEVEL = levels.findIndex((l) => (l.wl?.length ?? 0) > 0) + 1;
export const FIRST_LOCK_LEVEL = levels.findIndex((l) => l.b.some((b) => b.length > 4)) + 1;
