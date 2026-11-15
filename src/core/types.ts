export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const isHorizontal = (d: Dir) => d === 'left' || d === 'right';

const CW: Record<Dir, Dir> = { up: 'right', right: 'down', down: 'left', left: 'up' };
const CCW: Record<Dir, Dir> = { up: 'left', left: 'down', down: 'right', right: 'up' };
export const turnCW = (d: Dir) => CW[d];
export const turnCCW = (d: Dir) => CCW[d];

/** A block covers `len` cells starting at (x, y), along the axis of its arrow. */
export interface Block {
  id: number;
  x: number;
  y: number;
  len: number;
  dir: Dir;
  /** Locked until the block with id `lockedBy` has exited. */
  lockedBy?: number;
  /** Slider: when blocked, moves as far as it can and stays there instead of bouncing. */
  slider?: boolean;
  /** Twin: linked to the block with this id. Tapping either one sends both — both paths must be clear. */
  twin?: number;
  /** Bomb: moves left before it explodes. Counts down after every successful move. */
  fuse?: number;
  /** Spinner (1×1 only): turns 90° clockwise every time another block leaves the board. */
  spinner?: boolean;
}

/** A barrier cell that disappears once its key block has left the board. */
export interface Gate {
  x: number;
  y: number;
  key: number;
}

export interface Level {
  w: number;
  h: number;
  blocks: Block[];
  /** Fixed cells that never move. */
  walls: Array<[number, number]>;
  gates?: Gate[];
  /** A known sequence of taps that clears the board (from the generator). */
  solution?: number[];
}

export type Hit = number | 'wall';

export type TapResult =
  | { kind: 'exit'; id: number; distance: number; partner?: { id: number; distance: number } }
  /** Bounced off something. `id` is the block that bounced (for twins, maybe the partner). */
  | { kind: 'blocked'; id: number; distance: number; hitId: Hit; tapped: number }
  /** A slider moved `distance` cells and stopped against `hitId`. */
  | { kind: 'slide'; id: number; distance: number; hitId: Hit }
  | { kind: 'locked'; id: number }
  | { kind: 'none' };
