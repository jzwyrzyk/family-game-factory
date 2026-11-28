import type {SceneWorldId} from '../creation/movement-worlds';
import {WORLD_PLATES} from '../creation/movement-worlds';

export const MOTION_LABELS = {
  jump: 'Jump', bounce: 'Bounce', spin: 'Spin', dance: 'Dance',
  left: 'Left', right: 'Right', float: 'Float', shake: 'Shake', path: 'Path',
} as const;
export type MotionMove = keyof typeof MOTION_LABELS;
export interface MotionPoint { x: number; y: number }
export interface DrawingMotion {
  move: MotionMove;
  durationMs: number;
  world: SceneWorldId;
  sprite: 'original' | 'cutout';
  points?: MotionPoint[];
}
export const MAX_PATH_POINTS = 32;

export function validateDrawingMotion(value: unknown): DrawingMotion {
  const motion = value as DrawingMotion;
  if (!motion || typeof motion !== 'object' || Array.isArray(motion)
    || Object.keys(motion).some(key => !['move','durationMs','world','sprite','points'].includes(key))
    || !Object.hasOwn(MOTION_LABELS, motion.move)
    || typeof motion.world !== 'string' || !Object.hasOwn(WORLD_PLATES,motion.world)
    || !['original','cutout'].includes(motion.sprite)
    || !Number.isInteger(motion.durationMs) || motion.durationMs < 400 || motion.durationMs > 8000) {
    throw Error('Choose a supported animation and pace.');
  }
  if (motion.move !== 'path') {
    if (motion.points !== undefined) throw Error('Only a path can have saved spots.');
    return motion;
  }
  if (!Array.isArray(motion.points) || motion.points.length < 2 || motion.points.length > MAX_PATH_POINTS
    || Array.from(motion.points).some(p => !p || typeof p !== 'object' || Array.isArray(p)
      || Object.keys(p).some(key => key !== 'x' && key !== 'y')
      || ![p.x,p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1))
    || !motion.points.some(p => p.x !== motion.points![0].x || p.y !== motion.points![0].y)) {
    throw Error('Add two different spots for your drawing to follow.');
  }
  return motion;
}

/** Position uses stage fractions. Rotation is in degrees about the sprite center.
 * Preview and trusted playback sample the same deterministic movement. */
export function motionPose(motion: DrawingMotion, phase: number) {
  const t = Math.min(1,Math.max(0,phase)), wave = Math.sin(2 * Math.PI * t);
  let x = .5, y = .56, rotation = 0;
  switch (motion.move) {
    case 'jump': y -= .34 * 4*t*(1-t); break;
    case 'bounce': y -= .33 * Math.abs(Math.sin(2*Math.PI*t)) * (1-.45*t); break;
    case 'spin': rotation = t*360; break;
    case 'dance': x += .14*wave; y -= .09*Math.abs(wave); rotation = 20*Math.sin(4*Math.PI*t); break;
    case 'left': x = .78-.56*t; break;
    case 'right': x = .22+.56*t; break;
    case 'float': x += .14*wave; y -= .19*(1-Math.cos(2*Math.PI*t))/2; break;
    case 'shake': rotation = 12*Math.sin(8*Math.PI*t); x += .04*Math.sin(8*Math.PI*t); break;
    case 'path': {
      const points = motion.points || [];
      if (!points.length) break;
      const step = t*(points.length-1), start = Math.floor(step);
      const a = points[start], b = points[Math.min(points.length-1,start+1)];
      x = a.x+(b.x-a.x)*(step-start); y = a.y+(b.y-a.y)*(step-start);
      break;
    }
  }
  return {x,y,rotation};
}
