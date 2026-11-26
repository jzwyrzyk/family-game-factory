import type { CreationBlock, CreationProject, SceneActor } from '../creation/model';

export interface MotionPoint { x: number; y: number }
export interface DrawingMotion { stops: MotionPoint[]; stepMs: number }
export const MAX_MOTION_STOPS = 12;
export const MOTION_START: MotionPoint = { x: .5, y: .5 };
export const MOTION_SPEEDS = [350, 700, 1200] as const;

export function validateMotion(input: unknown): asserts input is DrawingMotion {
  const motion = input as DrawingMotion;
  if (!motion || typeof motion !== 'object' || Object.keys(motion).some(k => !['stops', 'stepMs'].includes(k)) ||
      !MOTION_SPEEDS.some(ms => ms === motion.stepMs) || !Array.isArray(motion.stops) ||
      motion.stops.length < 1 || motion.stops.length > MAX_MOTION_STOPS ||
      Array.from(motion.stops).some(p => !p || Object.keys(p).some(k => k !== 'x' && k !== 'y') ||
        ![p.x, p.y].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1))) {
    throw Error('Choose up to twelve spots inside the animation page.');
  }
}

/** The original picture moves as one sprite. Coordinates use the available area
 * for its center, so its entire longest edge fits even at the last stop. */
export function motionPosition(point: MotionPoint, width: number, height: number, size: number) {
  const side = Math.min(width, height, size);
  return { x: Math.round(side / 2 + point.x * (width - side)), y: Math.round(side / 2 + point.y * (height - side)) };
}

export function sampleMotion(motion: DrawingMotion, elapsedMs: number): MotionPoint {
  const progress = Math.max(0, Math.min(motion.stops.length, elapsedMs / motion.stepMs));
  const index = Math.min(motion.stops.length - 1, Math.floor(progress));
  const from = motion.stops[index - 1] ?? MOTION_START, to = motion.stops[index], t = progress - index;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function placeDrawingMotion(motion: DrawingMotion, actor: Pick<SceneActor, 'x' | 'y' | 'size'>,
    scene: Pick<CreationProject, 'width' | 'height'>, uid: () => string): CreationBlock[] {
  validateMotion(motion);
  const place = (p: MotionPoint) => motionPosition(p, scene.width, scene.height, actor.size ?? 100);
  let previous = place(MOTION_START);
  Object.assign(actor, previous);
  return motion.stops.map(point => {
    const next = place(point);
    const step: CreationBlock = { id: uid(), type: 'move', dx: next.x - previous.x,
      dy: next.y - previous.y, durationMs: motion.stepMs, origin: 'child' };
    previous = next;
    return step;
  });
}
