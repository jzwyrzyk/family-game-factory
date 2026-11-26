import type { CreationProject, SceneActor } from '../creation/model';

export interface PathPoint { x: number; y: number }
export interface DrawingMotion {
  /** Positions are fractions of the stage. The first point places the actor. */
  points: PathPoint[];
  stepMs: number;
  sprite: 'original' | 'cutout';
}
export const MAX_PATH_POINTS = 16;

export function validateMotion(input: unknown): asserts input is DrawingMotion {
  const motion = input as DrawingMotion;
  const coordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (!motion || typeof motion !== 'object' || Object.keys(motion).some(key => !['points','stepMs','sprite'].includes(key))
    || !['original','cutout'].includes(motion.sprite) || ![300,600,1000].includes(motion.stepMs)
    || !Array.isArray(motion.points) || motion.points.length < 2 || motion.points.length > MAX_PATH_POINTS
    || motion.points.some(point => !point || typeof point !== 'object' || Object.keys(point).some(key => key !== 'x' && key !== 'y')
      || !coordinate(point.x) || !coordinate(point.y))) throw Error('Choose two to sixteen stops and a speed for your path.');
}

/** Applied once, when the child adds their drawing. The resulting ordinary
 * move blocks stay editable and travel with this exact scene revision. */
export function applyArtMotion(project: CreationProject, actor: SceneActor, motion: DrawingMotion) {
  validateMotion(motion);
  if (project.programs.some(program => program.actorId === actor.id && program.trigger.type === 'start')) {
    throw Error('This character already has a start program.');
  }
  const [first, ...rest] = motion.points;
  actor.x = Math.round(first.x * project.width);
  actor.y = Math.round(first.y * project.height);
  project.programs.push({
    id: crypto.randomUUID(), actorId: actor.id, trigger: {type:'start'},
    actions: rest.map(point => ({
      id: crypto.randomUUID(), type: 'move', origin: 'child',
      x: Math.round(point.x * project.width), y: Math.round(point.y * project.height), durationMs: motion.stepMs,
    })),
  });
}
