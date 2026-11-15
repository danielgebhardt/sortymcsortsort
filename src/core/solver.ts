import { Board } from './board';
import { Level } from './types';

export interface SolveResult {
  solvable: boolean;
  /** Blocks removed in each round; all blocks in a round were free at once. */
  rounds: number[][];
  /** A valid order of taps that clears the board. */
  order: number[];
  /** How many blocks can be tapped right at the start. */
  initialFree: number;
}

/**
 * Removing a block never blocks anything else, so greedily removing any free block
 * is always safe. If greedy peeling gets stuck, the level has no solution.
 */
export function solve(level: Level): SolveResult {
  const board = new Board(level);
  const rounds: number[][] = [];
  const order: number[] = [];
  let initialFree = -1;
  while (!board.cleared) {
    const free = board.freeBlocks().map((b) => b.id);
    if (initialFree < 0) initialFree = free.length;
    if (free.length === 0) return { solvable: false, rounds, order, initialFree };
    for (const id of free) board.remove(id);
    rounds.push(free);
    order.push(...free);
  }
  return { solvable: true, rounds, order, initialFree: Math.max(initialFree, 0) };
}
