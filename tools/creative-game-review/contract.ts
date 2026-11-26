// Offline qualification of ONE previously reviewed, fixed generated-module-v2 fixture.
export const GAME_SOURCE = '07913b47e7291c6f6dcc42dcf196ab33becf8c1cdeeb6f71dc841466819b8c80';
export const SLOT = 'helper';
export const OWNER = 'synthetic-review-player';

export function validPosition(value:unknown):value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 90 && value <= 620;
}
