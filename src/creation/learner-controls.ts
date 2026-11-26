import type { CreationBlock } from './model';

export const FIRST_STEPS_ACTIONS = new Set<CreationBlock['type']>(['move', 'jump', 'say', 'dance', 'wait', 'repeat']);
export type MoveDirection = 'right' | 'left' | 'up' | 'down';
type MoveBlock = Extract<CreationBlock, { type: 'move' }>;

/** A simple view is available only when it describes the exact saved movement.
 * Absolute/diagonal paths keep their values and open in the fuller controls. */
export function simpleMove(block: MoveBlock): { direction: MoveDirection; steps: number } | null {
  if (block.x !== undefined || block.y !== undefined) return null;
  const dx = block.dx ?? 0, dy = block.dy ?? 0;
  if (dx && dy) return null;
  return dy ? { direction: dy < 0 ? 'up' : 'down', steps: Math.abs(dy) }
    : { direction: dx < 0 ? 'left' : 'right', steps: Math.abs(dx) };
}

export function directionMove(direction: MoveDirection, steps: number): { dx: number; dy: number } {
  return { dx: direction === 'right' ? steps : direction === 'left' ? -steps : 0,
    dy: direction === 'down' ? steps : direction === 'up' ? -steps : 0 };
}

export function firstStepsSummary(block: CreationBlock): string {
  switch (block.type) {
    case 'move': {
      const move = simpleMove(block);
      return move ? `${move.steps} steps ${move.direction}` : 'A saved path';
    }
    case 'say': return `“${block.text}”`;
    case 'jump': return block.height < 50 ? 'A little hop' : block.height > 90 ? 'A big hop' : 'A happy hop';
    case 'repeat': return block.pathName || `${block.count} times`;
    case 'wait': return `${block.durationMs / 1000} seconds`;
    case 'dance': return 'Do a little dance';
    case 'show': return 'Appear in the scene';
    case 'hide': return 'Hide from the scene';
    case 'if': return block.condition.type === 'variable' ? `Check ${block.condition.variable}` : 'Choose what happens';
    case 'emit': return `Send ${block.name}`;
    case 'set': return `${block.variable} = ${block.value}`;
    case 'change': return `${block.variable} ${block.amount < 0 ? '−' : '+'} ${Math.abs(block.amount)}`;
  }
}
