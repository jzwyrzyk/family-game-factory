import type { CreationBlock, CreationProject } from './model';
import { parsePrivateArtId } from './model';

export const MAX_PATH_STEPS = 24;
export type MotionStep = {dx: number; dy: number; durationMs: number};
export type MotionPath = {name: string; steps: MotionStep[]; count: number};
export type PathPoint = {x: number; y: number};

/** Coordinates belong to the stage, never to the original picture or its cutout. */
export function pathFromPoints(name: string, points: readonly PathPoint[], speed: number): MotionPath {
  if (points.length < 2 || points.length > MAX_PATH_STEPS + 1 || !Number.isFinite(speed) || speed <= 0)
    throw Error('Draw a short path first.');
  const steps = points.slice(1).map((point, index) => {
    const dx = Math.round(point.x) - Math.round(points[index].x);
    const dy = Math.round(point.y) - Math.round(points[index].y);
    const durationMs = Math.min(10000, Math.max(10, Math.round(Math.hypot(dx, dy) / speed * 100) * 10));
    return {dx, dy, durationMs};
  }).filter(step => step.dx || step.dy);
  if (!steps.length) throw Error('Add a different spot to your path.');
  return {name: name.trim().slice(0, 40) || 'My path', steps, count: 1};
}

/** A use is a value copy. Editing or removing the source scene cannot retarget it. */
export function pathBlock(path: MotionPath): Extract<CreationBlock, {type:'repeat'}> {
  return {type:'repeat', id:crypto.randomUUID(), origin:'child', count:path.count, pathName:path.name,
    actions:path.steps.map(step => ({...step, type:'move', origin:'child', id:crypto.randomUUID()}))};
}

/** Only child-authored movement groups are reusable here. If an editor adds scene-
 * specific variables, events, absolute destinations or story blocks, keep those
 * in their original program; copying a subset would misrepresent the movement. */
export function reusablePaths(scene: CreationProject): MotionPath[] {
  const results: MotionPath[] = [];
  function visit(blocks: CreationBlock[]) {
    for (const block of blocks) {
      if (block.type === 'if') { visit(block.then); visit(block.else || []); }
      if (block.type !== 'repeat') continue;
      if (block.pathName && block.origin === 'child' && block.count > 0 &&
          block.actions.length && block.actions.length <= MAX_PATH_STEPS) {
        const steps: MotionStep[] = [];
        for (const action of block.actions) {
          if (action.type !== 'move' || action.origin !== 'child' || action.x !== undefined || action.y !== undefined) break;
          steps.push({dx:action.dx ?? 0, dy:action.dy ?? 0, durationMs:action.durationMs ?? 500});
        }
        if (steps.length === block.actions.length) results.push({name:block.pathName, count:block.count, steps});
      }
      visit(block.actions);
    }
  }
  for (const program of scene.programs) {
    if (scene.actors.some(actor => actor.id === program.actorId && parsePrivateArtId(actor.assetId))) visit(program.actions);
  }
  return results;
}
