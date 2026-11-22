import type { Difficulty, GameId, Manifest, Mechanics } from './types';
export const manifests: Record<GameId, Manifest> = {
  // Mining's difficulty grows through its actual levels. No decorative tuning
  // controls are offered when the game does not implement a local edit.
  mining: {version:1,id:'mining',name:'Mind Your Jems!',mechanics:[]},
  factory: {version:1,id:'factory',name:'Gem Factory',mechanics:[
    {key:'orderSize',label:'Gifts per day',type:'number',default:3,min:2,max:5,step:1},
    {key:'cutterSpeed',label:'Cutting speed',type:'number',default:1,min:0.5,max:1.5,step:0.25},
    {key:'sparkleBoost',label:'Extra sparkles',type:'boolean',default:false},
  ]},
  moon: {version:1,id:'moon',name:'Moon Donut Dash',mechanics:[
    {key:'donutGoal',label:'Donuts to collect',type:'number',default:6,min:4,max:12,step:1},
    {key:'moonGravity',label:'Moon gravity',type:'number',default:0.6,min:0.3,max:0.9,step:0.1},
    {key:'meteorRate',label:'Meteor frequency',type:'number',default:1,min:0.5,max:1.5,step:0.25},
    {key:'bouncePads',label:'Springy bounce pads',type:'boolean',default:false},
  ]},
  robot: {version:1,id:'robot',name:'Robot Route Lab',mechanics:[
    {key:'robotSpeed',label:'Robot movement speed',type:'number',default:1,min:0.5,max:2,step:0.25},
    {key:'showTrail',label:'Show my path',type:'boolean',default:true},
    {key:'portalEnabled',label:'Robot portals',type:'boolean',default:false},
  ]},
  gum: { version: 1, id: 'gum', name: 'Bubble Gum Builders', mechanics: [
    { key: 'qualityVersion', label: 'Build world (stickers / physics / original)', type: 'number', default: 2, min: 0, max: 2, step: 1 },
    { key: 'gravity', label: 'Gravity', type: 'number', default: 10, min: 4, max: 16, step: 1 },
    { key: 'thrust', label: 'Fan power', type: 'number', default: 1, min: .5, max: 1.5, step: .1 },
    { key: 'originalRules', label: 'Restored original rules', type: 'boolean', default: true },
    { key: 'gumBudget', label: 'Gum sticks', type: 'number', default: 10, min: 4, max: 20, step: 1 },
    { key: 'jointStrength', label: 'Joint strength', type: 'number', default: 1, min: .5, max: 2, step: .25 },
    { key: 'highlightMatches', label: 'Matching pieces glow', type: 'boolean', default: false },
    { key: 'extraDecoys', label: 'Extra silly pieces', type: 'number', default: 0, min: 0, max: 6, step: 1 },
  ] },
  hill: { version: 1, id: 'hill', name: 'Junkyard Rally', mechanics: [
    { key: 'enginePower', label: 'Motor power', type: 'number', default: 1, min: .5, max: 2, step: .1 },
    { key: 'suspension', label: 'Spring stiffness', type: 'number', default: 4, min: 2, max: 8, step: .5 },
    { key: 'wheelSize', label: 'Wheel size', type: 'number', default: .52, min: .35, max: .8, step: .01 },
    { key: 'chassisMass', label: 'Body weight', type: 'number', default: 1, min: .5, max: 2, step: .1 },
    { key: 'grip', label: 'Tire grip', type: 'number', default: 1, min: .5, max: 1.5, step: .1 },
  ] },
  buckets: { version: 1, id: 'buckets', name: 'Splash or Pass', mechanics: [
    { key: 'originalRules', label: 'Restored original rules', type: 'boolean', default: true },
    { key: 'bucketCount', label: 'Number of buckets', type: 'number', default: 3, min: 2, max: 5, step: 1 },
    { key: 'revealSafe', label: 'Show the safe bucket', type: 'boolean', default: false },
    { key: 'splashMs', label: 'Splash time', type: 'number', default: 1900, min: 400, max: 3000, step: 100 },
  ] },
  dragon: { version: 1, id: 'dragon', name: 'Dragon & Meatballs', mechanics: [
    { key: 'originalRules', label: 'Restored original rules', type: 'boolean', default: true },
    { key: 'groundResilience', label: 'Island resilience', type: 'number', default: 100, min: 46, max: 230, step: 1 },
    { key: 'fireballCadence', label: 'Fireball cadence', type: 'number', default: 1, min: .5, max: 2, step: .25 },
    { key: 'shieldRadius', label: 'Shield timing window', type: 'number', default: 72, min: 40, max: 100, step: 1 },
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
    const added=['originalRules','gumBudget','jointStrength','groundResilience','fireballCadence','shieldRadius','qualityVersion','gravity','thrust'];
    // Missing qualityVersion identifies a saved older revision; never silently replace its engine.
    const v = input[m.key] ?? (added.includes(m.key) ? (m.key==='originalRules'?false:m.key==='qualityVersion'?0:m.default) : undefined);
    if (m.type === 'boolean') { if (typeof v !== 'boolean') throw Error(`Choose on or off for ${m.label}.`); }
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < m.min! || v > m.max! || Math.abs((v - m.min!) / m.step! - Math.round((v - m.min!) / m.step!)) > 1e-6) throw Error(`${m.label} is outside its allowed range.`);
    result[m.key] = v as number | boolean;
  }
  return result;
}
export function defaults(game: GameId, difficulty: Difficulty = 'classic'): Mechanics {
  const config = Object.fromEntries(manifests[game].mechanics.map(m => [m.key, m.default]));
  if (game === 'mining') return validateConfig(game,config);
  if (game === 'factory') {
    if (difficulty === 'gentle') Object.assign(config,{orderSize:2,cutterSpeed:0.75});
    if (difficulty === 'stretch') Object.assign(config,{orderSize:5,cutterSpeed:1.25});
    return validateConfig(game,config);
  }
  if (game === 'moon' || game === 'robot') {
    if (difficulty === 'gentle') Object.assign(config,game==='moon'?{donutGoal:4,meteorRate:0.5}:{robotSpeed:0.75,showTrail:true});
    if (difficulty === 'stretch') Object.assign(config,game==='moon'?{donutGoal:9,meteorRate:1.5}:{robotSpeed:1.5,showTrail:false});
    return validateConfig(game,config);
  }
  if (difficulty === 'gentle') Object.assign(config, game === 'gum' ? { highlightMatches: true, jointStrength: 1.5, gravity: 8 } : game === 'buckets' ? { revealSafe: true } : game === 'hill' ? { enginePower: .8, grip: 1.2 } : { hearts: 7, breathSpeed: 0.65, fireballCadence: .75, shieldRadius: 82 });
  if (difficulty === 'stretch') Object.assign(config, game === 'gum' ? { extraDecoys: 2, jointStrength: .75 } : game === 'buckets' ? { bucketCount: 4 } : game === 'hill' ? { enginePower: 1.3, grip: .8 } : { hearts: 3, breathSpeed: 1.4, fireballCadence: 1.25, shieldRadius: 62 });
  // Preset breath speed retains the original 0.65; editable values use steps of 0.05.
  return validateConfig(game, config);
}
export function diff(game: GameId, before: Mechanics, after: Mechanics) {
  return manifests[game].mechanics.filter(m => before[m.key] !== after[m.key]).map(m => ({ key: m.key, label: m.label, before: before[m.key], after: after[m.key] }));
}
/** Show the controls that actually affect this saved engine, never compatibility flags. */
export function playableMechanics(game: GameId, config: Mechanics) {
  const keys = game === 'gum' ? (config.qualityVersion === 2 ? ['extraDecoys'] : config.qualityVersion === 1 ? ['gumBudget','jointStrength','gravity','thrust']
    : config.originalRules ? ['gumBudget','jointStrength'] : ['highlightMatches','extraDecoys'])
    : game === 'dragon' ? (config.originalRules ? ['groundResilience','fireballCadence','shieldRadius'] : ['hearts','breathSpeed']) : null;
  return manifests[game].mechanics.filter(m => keys ? keys.includes(m.key) : m.key !== 'originalRules');
}
