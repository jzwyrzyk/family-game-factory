import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SceneEngine} from '../src/creation/engine';
import {createArtAdventure} from '../src/creation/art-game';
import {SCENE_ROLES, validateCreationProject} from '../src/creation/model';
import {validateGeneratedCreationManifest} from '../src/creation/projects';

const reference = 'art:image:picture:' + '2'.repeat(64);
const selection = {label:'My stone',drawingId:'picture',assetId:reference,detail:'Original'};
test('picture hunt rules, source version, three input consequences and restart', () => {
  const project = createArtAdventure(selection,'picture-hunt');
  assert.equal(project.actors[0].assetId,reference);
  assert.equal(project.actors[0].role,'collectible');
  const engine = new SceneEngine(project), actor = project.actors[0];
  engine.start();
  for (const [found,x,y,speech] of [[1,595,300,'Found me! Two to go.'],[2,340,245,'One more!'],[3,340,245,'You found all three!']] as const) {
    const result = engine.tap(actor.id);
    assert.deepEqual([result.variables.found,result.actors[0].x,result.actors[0].y,result.actors[0].speech],[found,x,y,speech]);
  }
  assert.equal(engine.tap(actor.id).variables.found,3);
  assert.equal(engine.start().variables.found,0);
  assert.equal(project.provenance?.sourceRevisionId,'2'.repeat(64));
  assert.throws(()=>validateGeneratedCreationManifest(project),/artwork/);
  assert.throws(()=>createArtAdventure({...selection,drawingId:'wrong'},'picture-hunt'),/saved picture/);
});
test('context roles never infer mechanics, including saved projects without roles', () => {
  const project = createArtAdventure(selection,'scene');
  for (const role of [...SCENE_ROLES,undefined]) {
    project.actors[0].role = role;
    const engine = new SceneEngine(project);
    engine.start(); engine.advance(100);
    assert.ok(engine.snapshot().actors[0].jumpOffset < 0);
    assert.equal(engine.project.actors[0].assetId,reference);
  }
  assert.throws(()=>validateCreationProject({...project,actors:[{...project.actors[0],role:'magic-physics'}]}),/role/);
});
