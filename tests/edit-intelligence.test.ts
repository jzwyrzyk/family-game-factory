import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archetypeById} from '../src/archetypes/catalog';
import {makeNativeEditManifest} from '../src/edit-intelligence/native-manifest';
import {planEdit, validatePreviewAgainstCurrent, type LocalEditPreview} from '../src/edit-intelligence/router';
import {defaults} from '../src/runtime/manifests';
import type {GameId} from '../src/runtime/types';

test('archetypes remain canonical; first platformer is not a fictitious installed engine',()=>{
  assert.ok(archetypeById.has('platformer'));
  const moon = makeNativeEditManifest('moon', defaults('moon'), 'rev-1');
  assert.deepEqual(moon.archetypeIds, ['endless-runner']);
  assert.ok(!moon.archetypeIds.includes('platformer'));
  assert.equal(moon.supportsPortableModuleInsertion, false);
  assert.equal(moon.properties.length, 4);
  assert.ok(moon.properties.some(p => p.key === 'bouncePads' && p.conceptId === 'bounce'));
});

test('all six native games produce actual engine-only edit contracts',()=>{
  const games: GameId[] = ['moon','robot','gum','hill','buckets','dragon'];
  for (const game of games) {
    const cfg=defaults(game);
    const manifest=makeNativeEditManifest(game,cfg,'rev-1');
    assert.equal(manifest.game,game);
    assert.ok(manifest.properties.length>0,game);
    assert.ok(manifest.properties.every(p=>p.operation==='validated-native-config'));
    assert.ok(manifest.properties.every(p=>Object.hasOwn(cfg,p.key)));
    assert.ok(!manifest.properties.some(p=>p.key==='originalRules'||p.key==='qualityVersion'));
  }
  assert.throws(()=>makeNativeEditManifest('hill',{...defaults('hill'),wheelSize:99},'rev-1'));
  assert.throws(()=>makeNativeEditManifest('hill',defaults('hill'),'unsafe/id'));
});

test('saved sticker, physics and original game forms expose only real applicable settings',()=>{
  const sticker=makeNativeEditManifest('gum',defaults('gum'),'rev-sticker');
  assert.deepEqual(sticker.properties.map(p=>p.key),['extraDecoys']);
  assert.deepEqual(sticker.archetypeIds,['drag-creation']);
  const physical=makeNativeEditManifest('gum',{...defaults('gum'),qualityVersion:1},'rev-physics');
  assert.ok(physical.properties.some(p=>p.key==='gravity'));
  assert.deepEqual(physical.archetypeIds,['physical-construction']);
  const original=makeNativeEditManifest('gum',{...defaults('gum'),qualityVersion:0},'rev-old');
  assert.deepEqual(original.archetypeIds,[]);
  assert.ok(!original.properties.some(p=>p.key==='gravity'));
  const oldDragon=makeNativeEditManifest('dragon',defaults('dragon'),'rev-old');
  assert.ok(!oldDragon.properties.some(p=>p.key==='hearts'));
  assert.ok(oldDragon.properties.some(p=>p.key==='shieldRadius'));
  const newDragon=makeNativeEditManifest('dragon',{...defaults('dragon'),originalRules:false},'rev-new');
  assert.ok(newDragon.properties.some(p=>p.key==='hearts'));
  assert.ok(!newDragon.properties.some(p=>p.key==='shieldRadius'));
});

test('a real local edit yields an immutable preview, NEVER automatic Keep',()=>{
  const config=defaults('hill');
  const decision=planEdit({kind:'native',game:'hill',revisionId:'rev-1',config},'Make motor stronger');
  assert.equal(decision.route,'native-config-preview');
  if(decision.route!=='native-config-preview')return;
  assert.equal(decision.persisted,false);
  assert.equal(decision.verified,'schema-and-local-interpreter');
  assert.equal(config.enginePower,1);
  assert.ok(decision.after.enginePower>config.enginePower);
  assert.deepEqual(decision.changes.map(x=>x.key),['enginePower']);
  const applied=validatePreviewAgainstCurrent(decision,{game:'hill',revisionId:'rev-1',config});
  assert.equal(applied.enginePower,decision.after.enginePower);
  assert.throws(()=>validatePreviewAgainstCurrent(decision,{game:'hill',revisionId:'rev-2',config}),/STALE/);
  assert.throws(()=>validatePreviewAgainstCurrent(decision,{game:'hill',revisionId:'rev-1',config:{...config,grip:0.8}}),/STALE/);
});

test('local compound edits are atomic; any unsupported clause leaves every value unchanged',()=>{
  const config=defaults('moon');
  const good=planEdit({kind:'native',game:'moon',revisionId:'rev-1',config},'Add bounce pads and make meteors faster');
  assert.equal(good.route,'native-config-preview');
  if(good.route==='native-config-preview')assert.deepEqual(good.changes.map(c=>c.key),['meteorRate','bouncePads']);
  const unsupported=planEdit({kind:'native',game:'moon',revisionId:'rev-1',config},'Add bounce pads and transform this game into 3D');
  assert.equal(unsupported.route,'generation-required');
  assert.equal(unsupported.persisted,false);
  assert.equal(config.bouncePads,false);
});

test('a new combat behavior is not misreported as an instant parameter edit',()=>{
  const config=defaults('dragon');
  const decision=planEdit({kind:'native',game:'dragon',revisionId:'rev-1',config},'Replace my bow with a magic mirror that reflects fireballs');
  assert.equal(decision.route,'generation-required');
  assert.equal(decision.persisted,false);
  const already=planEdit({kind:'native',game:'moon',revisionId:'rev-1',config:{...defaults('moon'),bouncePads:true}},'Add bounce pads');
  assert.equal(already.route,'unchanged');
});

test('no unsupported or invalid local edit becomes a paid job',()=>{
  const config=defaults('hill');
  const outOfBounds=planEdit({kind:'native',game:'hill',revisionId:'rev-1',config:{...config,enginePower:2}},'Make motor stronger');
  assert.equal(outOfBounds.route,'review-required');
  const generated=planEdit({kind:'generated',artifactKind:'generated-module-v2',revisionId:'rev-1'},'Make the alien fly faster');
  assert.equal(generated.route,'generation-required');
  assert.equal(generated.queued,false);
  assert.throws(()=>planEdit({kind:'generated',artifactKind:'invalid' as any,revisionId:'rev-1'},'Make it better'));
  assert.throws(()=>planEdit({kind:'native',game:'moon',revisionId:'rev-1',config:defaults('moon')},'  '));
});

test('a forged preview cannot bypass source-backed local interpretation or revision validation',()=>{
  const config=defaults('moon');
  const decision=planEdit({kind:'native',game:'moon',revisionId:'rev-1',config},'Make moon gravity lower');
  assert.equal(decision.route,'native-config-preview');
  if(decision.route!=='native-config-preview')return;
  const forged={...decision,after:{...decision.after,donutGoal:12}} as LocalEditPreview;
  assert.throws(()=>validatePreviewAgainstCurrent(forged,{game:'moon',revisionId:'rev-1',config}),/REVALIDATION_FAILED/);
  const fabricated={...decision,originalRequest:'Give me a brand new unexplained dragon mechanic'} as LocalEditPreview;
  assert.throws(()=>validatePreviewAgainstCurrent(fabricated,{game:'moon',revisionId:'rev-1',config}),/REVALIDATION_FAILED/);
});
