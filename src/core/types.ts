export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const isHorizontal = (d: Dir) => d === 'left' || d === 'right';

/** A block covers `len` cells starting at (x, y), along the axis of its arrow. */
export interface Block {
  id: number;
  x: number;
  y: number;
  len: number;
  dir: Dir;
  /** If set, this block is locked until the block with id `lockedBy` has exited. */
  lockedBy?: number;
}

export interface Level {
  w: number;
  h: number;
  blocks: Block[];
  /** Fixed cells that never move. */
  walls: Array<[number, number]>;
}

export type TapResult =
  | { kind: 'exit'; id: number; distance: number }
  | { kind: 'blocked'; id: number; distance: number; hitId: number | 'wall' }
  | { kind: 'locked'; id: number }
  | { kind: 'none' };
