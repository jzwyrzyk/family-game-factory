import type { Difficulty, GameId, Manifest, Mechanics } from './types';
export const manifests: Record<GameId, Manifest> = {
  gum: { version: 1, id: 'gum', name: 'Bubble Gum Builders', mechanics: [
    { key: 'highlightMatches', label: 'Matching pieces glow', type: 'boolean', default: false },
    { key: 'extraDecoys', label: 'Extra silly pieces', type: 'number', default: 0, min: 0, max: 6, step: 1 },
  ] },
  buckets: { version: 1, id: 'buckets', name: 'Splash or Pass', mechanics: [
    { key: 'bucketCount', label: 'Number of buckets', type: 'number', default: 3, min: 2, max: 5, step: 1 },
    { key: 'revealSafe', label: 'Show the safe bucket', type: 'boolean', default: false },
    { key: 'splashMs', label: 'Splash time', type: 'number', default: 1900, min: 400, max: 3000, step: 100 },
  ] },
  dragon: { version: 1, id: 'dragon', name: 'Dragon & Meatballs', mechanics: [
    { key: 'hearts', label: 'Starting hearts', type: 'number', default: 4, min: 1, max: 10, step: 1 },
    { key: 'breathSpeed', label: 'Dragon breath speed', type: 'number', default: 1, min: 0.5, max: 2, step: 0.05 },
  ] },
};
export function isGameId(value: unknown): value is GameId { return typeof value === 'string' && Object.hasOwn(manifests, value); }
export function validateConfig(game: GameId, value: unknown): Mechanics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Mechanics must be an object.');
  const input = value as Record<string, unknown>, result: Mechanics = {};
  if (Object.keys(input).some(key => !manifests[game].mechanics.some(m => m.key === key))) throw Error('Unknown mechanic.');
  for (const m of manifests[game].mechanics) {
    const v = input[m.key];
    if (m.type === 'boolean') { if (typeof v !== 'boolean') throw Error(`Choose on or off for ${m.label}.`); }
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < m.min! || v > m.max! || Math.abs((v - m.min!) / m.step! - Math.round((v - m.min!) / m.step!)) > 1e-6) throw Error(`${m.label} is outside its allowed range.`);
    result[m.key] = v as number | boolean;
  }
  return result;
}
export function defaults(game: GameId, difficulty: Difficulty = 'classic'): Mechanics {
  const config = Object.fromEntries(manifests[game].mechanics.map(m => [m.key, m.default]));
  if (difficulty === 'gentle') Object.assign(config, game === 'gum' ? { highlightMatches: true } : game === 'buckets' ? { revealSafe: true } : { hearts: 7, breathSpeed: 0.65 });
  if (difficulty === 'stretch') Object.assign(config, game === 'gum' ? { extraDecoys: 2 } : game === 'buckets' ? { bucketCount: 4 } : { hearts: 3, breathSpeed: 1.4 });
  // Preset breath speed retains the original 0.65; editable values use steps of 0.05.
  return validateConfig(game, config);
}
export function diff(game: GameId, before: Mechanics, after: Mechanics) {
  return manifests[game].mechanics.filter(m => before[m.key] !== after[m.key]).map(m => ({ key: m.key, label: m.label, before: before[m.key], after: after[m.key] }));
}
