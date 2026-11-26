import {type ArtChoice} from './private-art';
import {createStarterProject, parsePrivateArtId} from './projects';
import {type CreationBlock, type CreationProject} from './model';

/** The trusted host builds editable rules. A picture's name, category and pixels
 * never choose a rule or leave this device. Every new game has its own history. */
export function createArtAdventure(choice: ArtChoice, kind: 'scene' | 'picture-hunt'): CreationProject {
  const pin = parsePrivateArtId(choice.assetId);
  if (!pin || pin.id !== (choice.rigId || choice.drawingId) || pin.kind !== (choice.rigId ? 'rig' : 'image')) {
    throw Error('Choose a saved picture from My Art.');
  }
  const hunt = kind === 'picture-hunt';
  const project = createStarterProject('blank', (hunt ? 'Find ' + choice.label : choice.label + ' adventure').slice(0, 60));
  const actorId = crypto.randomUUID();
  project.actors = [{id: actorId, name: choice.label, assetId: choice.assetId,
    x: hunt ? 195 : 400, y: hunt ? 175 : 280, size: hunt ? 106 : 180, ...(hunt ? {role: 'collectible' as const} : {})}];
  project.provenance = {createdBy: 'child', sourceKind: 'art', sourceProjectId: choice.drawingId,
    sourceRevisionId: choice.rigId || pin.sha256};
  if (hunt) {
    project.variables = {found: 0};
    const say = (text: string): CreationBlock => ({id: crypto.randomUUID(), origin: 'starter', type: 'say', text, durationMs: 2200});
    const move = (x: number, y: number): CreationBlock => ({id: crypto.randomUUID(), origin: 'starter', type: 'move', x, y, durationMs: 0});
    project.programs = [
      {id: crypto.randomUUID(), actorId, trigger: {type: 'start'}, actions: [say('Find me three times!')]},
      {id: crypto.randomUUID(), actorId, trigger: {type: 'tap'}, actions: [{
        id: crypto.randomUUID(), origin: 'starter', type: 'if',
        condition: {type: 'variable', variable: 'found', operator: 'lt', value: 3}, then: [
          {id: crypto.randomUUID(), origin: 'starter', type: 'change', variable: 'found', amount: 1},
          {id: crypto.randomUUID(), origin: 'starter', type: 'if', condition: {type: 'variable', variable: 'found', operator: 'eq', value: 1},
            then: [move(595, 300), say('Found me! Two to go.')], else: [
              {id: crypto.randomUUID(), origin: 'starter', type: 'if', condition: {type: 'variable', variable: 'found', operator: 'eq', value: 2},
                then: [move(340, 245), say('One more!')], else: [say('You found all three!')]}
            ]}
        ]}
      ]}
    ];
  } else {
    project.programs = [
      {id: crypto.randomUUID(), actorId, trigger: {type: 'start'}, actions: [{id: crypto.randomUUID(), type: 'jump', height: 60, durationMs: 800, origin: 'starter'}]},
      {id: crypto.randomUUID(), actorId, trigger: {type: 'tap'}, actions: [{id: crypto.randomUUID(), type: 'jump', height: 80, durationMs: 650, origin: 'starter'}]},
    ];
  }
  return project;
}
