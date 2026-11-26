/* Actual IndexedDB/image-codec storage contracts, synthetic art only, no services. */
const assert = require('node:assert/strict');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');
(async () => {
 const bundled = await build({ stdin: { contents: `export * from './src/assets/private-drawings'; export * from './src/drawing/store'; export * from './src/drawing/library'; export * from './src/drawing/transfer'; export * from './src/rewards/write-guard';
   export {saveSketchPng, readSketch} from './src/drawing/sketch';
   export {creativeAssetChoices} from './src/assets/creative-catalog';
   export {createStarterProject, validateGeneratedCreationManifest} from './src/creation/projects';
   export {placeBackdrop} from './src/creation/world-tools';
   export {CreationStore} from './src/creation/storage';
   export {placeDrawingMotion} from './src/drawing/motion';
   export {exportSceneArt, importSceneArt, resolvePrivateArt} from './src/creation/private-art';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'art', platform: 'browser' });
 const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/test.js' ? bundled.outputFiles[0].text : '<!doctype html><html><body><script src="/test.js"></script></body></html>'); }).listen(0, '127.0.0.1');
 await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
 let browser;
 try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = [], posts = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async () => {
   const report = [], check = (condition, label) => { if (!condition) throw Error(label); report.push(label); };
   const rejects = async (action, label) => { let rejected = false; try { await action(); } catch { rejected = true; } check(rejected, label); };
   let owner = 'player1'; window.FG = { store: { current: () => ({ id: owner }) } };
   const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
   const ctx = canvas.getContext('2d'); ctx.fillStyle = '#8b5cf6'; ctx.fillRect(10, 10, 90, 40); ctx.fillStyle = '#123'; ctx.fillRect(15, 45, 20, 20); ctx.fillRect(75, 45, 20, 20);
   const file = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
   const originalBytes = await file.arrayBuffer();
   const open=indexedDB.open.bind(indexedDB);let legacyProbes=0;indexedDB.open=(...args)=>{if(args[0]==='family-drawing-rigs-v1')legacyProbes++;return open(...args);};
   const original = await art.saveDrawing(owner, 'Synthetic moon car', file);
   check(legacyProbes===0&&!(await indexedDB.databases()).some(row=>row.name==='family-drawing-rigs-v1'),'absent legacy database discovery never attempts creation');indexedDB.open=open;
   check(original.sha256 === await art.drawingHash(originalBytes) && original.bytes.byteLength === originalBytes.byteLength, 'original bytes and fingerprint preserved');
   const assembly = { schemaVersion: 1, sourceId: original.id, sourceSha256: original.sha256, kind: 'car', revision: 1, notes: '', pieces: [
    { id: 'body', name: 'Body', role: 'body', region: { x: .1, y: .1, w: .8, h: .5, shape: 'rect' }, parentId: null, physical: true },
    { id: 'left', name: 'Left wheel', role: 'wheel', region: { x: .1, y: .55, w: .2, h: .3, shape: 'ellipse' }, parentId: 'body', physical: true },
    { id: 'right', name: 'Right wheel', role: 'wheel', region: { x: .7, y: .55, w: .2, h: .3, shape: 'ellipse' }, parentId: 'body', physical: true }
   ] };
   await art.saveDrawingDraft(owner, assembly);
   check((await art.loadDrawingDraft(owner, original.id)).assembly.pieces.length === 3 && (await art.listRigs(owner)).length === 0, 'draft recovery does not save or select a version');
   await rejects(() => art.saveRig(owner, assembly, ''), 'invalid parent identity cannot create a malformed saved history');
   const first = await art.saveRig(owner, assembly);
   check(await art.loadDrawingDraft(owner, original.id) === null, 'explicit version save clears its matching draft');
   const changed = structuredClone(assembly); changed.revision = 2; changed.pieces[1].region.w = .25;
   const second = await art.saveRig(owner, changed, first.id);
   check((await art.rigById(owner, first.id)).assembly.pieces[1].region.w === .2 && second.parentId === first.id, 'new movement version preserves prior immutable geometry');
   await art.selectRig(owner, first.id); check((await art.activeRig(owner)).id === first.id, 'explicit active-car choice remains pinned');
   await art.updateDrawing(owner, original.id, { name: 'My renamed car', category: 'vehicle', archived: true });
   check((await art.drawing(owner, original.id)).archived && (await art.rigById(owner, first.id)).id === first.id, 'archiving and naming preserve saved version lookup');
   await art.registerArtUsage(owner, { targetId: 'scene-one', targetKind: 'scene', drawingId: original.id, rigId: first.id });
   await rejects(() => art.deleteArtwork(owner, original.id), 'cannot erase art used by a scene');
   check((await art.artUsages(owner, original.id)).length === 1, 'usage is stored separately from image identity');
   const draftForBackup = structuredClone(changed); draftForBackup.notes = 'Backup draft'; await art.saveDrawingDraft(owner, draftForBackup, second.id);
   const bundle = await art.exportArtBundle(owner);
   check(!JSON.stringify(bundle).includes('player1') && bundle.drawings.length === 1 && bundle.rigs.length === 2, 'portable bundle includes exact originals and all versions without source owner');
   await art.updateDrawing(owner, original.id, { name:'A newer local name' });
   const newerDraft = structuredClone(draftForBackup); newerDraft.notes = 'Newer local draft'; await art.saveDrawingDraft(owner, newerDraft, second.id);
   const restored = await art.restoreArtBundle(owner, bundle);
   check(restored.drawings[0].id === original.id && (await art.drawings(owner)).length === 1 && (await art.listRigs(owner)).length === 2, 'repeat restore reuses identical IDs without duplicates');
   check((await art.drawing(owner, original.id)).name === 'A newer local name' && (await art.loadDrawingDraft(owner, original.id)).assembly.notes === 'Newer local draft', 'restore preserves current metadata and newer draft');
   const conflicting = structuredClone(bundle); conflicting.rigs[0].assembly.notes = 'Conflicting geometry identity'; conflicting.drawings.push({...conflicting.drawings[0], id:'unused-restore-original'});
   await rejects(() => art.restoreArtBundle(owner, conflicting), 'conflicting immutable version rejects the entire restore');
   check((await art.drawings(owner)).length === 1, 'restore conflict does not add earlier valid images');
   owner = 'player2';
   await rejects(() => art.restoreArtBundle(owner, bundle), 'restore cannot reuse another profile’s image identity');
   await rejects(() => art.drawing(owner, original.id), 'cross-profile original lookup denied');
   await rejects(() => art.rigById(owner, first.id), 'cross-profile version lookup denied');
   const imported = await art.importArtBundle(owner, JSON.stringify(bundle));
   check(imported.drawings[0].owner === owner && imported.drawings[0].id !== original.id && imported.drawings[0].sha256 === original.sha256, 'import remaps owner and identifiers while preserving image hash');
   check(imported.rigs.find(rig => rig.id === imported.rigIds[second.id]).parentId === imported.rigIds[first.id] && imported.rigs.every(rig => rig.assembly.sourceId === imported.drawingIds[original.id]), 'import remaps all source and history references');
   check(await art.activeRig(owner) === null, 'import does not silently choose a car');
   const before = (await art.drawings(owner)).length;
   const corrupt = structuredClone(bundle); corrupt.drawings[0].sha256 = 'a'.repeat(64);
   await rejects(() => art.importArtBundle(owner, corrupt), 'corrupt fingerprint rejected');
   const cycle = structuredClone(bundle); cycle.rigs[0].parentId = cycle.rigs[1].id; cycle.rigs[1].parentId = cycle.rigs[0].id;
   await rejects(() => art.importArtBundle(owner, cycle), 'cyclic movement history rejected');
   const foreign = structuredClone(bundle); foreign.rigs[0].owner = 'player1';
   await rejects(() => art.importArtBundle(owner, foreign), 'foreign or unknown import fields rejected');
   const reserved = structuredClone(bundle); reserved.drawings[0].id = '__proto__';
   await rejects(() => art.importArtBundle(owner, reserved), 'reserved object-key identities rejected');
   check((await art.drawings(owner)).length === before, 'rejected bundles leave no partial import');
   await rejects(() => art.saveDrawing('player1', 'Stale owner', file), 'stale profile writes rejected');
   await rejects(() => art.saveDrawing(owner, 'Closed editor', file, undefined, () => false), 'closed view guard prevents image write');
   art.setRewardSourceMaintenance(true);
   await rejects(() => art.saveRig(owner, imported.rigs[0].assembly), 'maintenance and backup lock blocks art writes');
   art.setRewardSourceMaintenance(false);
   await rejects(() => art.saveDrawing(owner, 'Wrong bytes', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' })), 'disguised active content rejected');
   const giant = originalBytes.slice(0); new DataView(giant).setUint32(16, 90000);
   await rejects(() => art.saveDrawing(owner, 'Oversized dimensions', new Blob([giant], { type: 'image/png' })), 'oversized dimensions rejected before decode');
   localStorage.setItem('family-game-factory-creation-v1', JSON.stringify({ projects: [{id:'restored-scene', owner}], revisions: [{projectId:'restored-scene', scene:{actors:[{assetId:'art:image:'+imported.drawings[0].id+':'+imported.drawings[0].sha256}]}}], drafts:[] }));
   await rejects(() => art.deleteArtwork(owner, imported.drawings[0].id), 'restored scene history protects original without a usage receipt');
   check((await art.artUsages(owner, imported.drawings[0].id)).length === 1, 'usage listing derives restored scene references without an index row');
   localStorage.removeItem('family-game-factory-creation-v1');
   localStorage.setItem('family-game-factory-workspace-v2', JSON.stringify({ projects: [{id:'restored-game', owner}], revisions: [{projectId:'restored-game', drawingRigId:imported.rigs[0].id}] }));
   await rejects(() => art.deleteArtwork(owner, imported.drawings[0].id), 'restored native game history protects rig without a usage receipt');
   localStorage.removeItem('family-game-factory-workspace-v2');
   const importedBackup = await art.exportArtBundle(owner);
   await art.deleteArtwork(owner, imported.drawings[0].id);
   check((await art.drawings(owner)).length === 0 && (await art.listRigs(owner)).length === 0 && (await art.drawings('player1')).length === 1, 'explicit erase removes unused versions without changing another profile');
   const recovered = await art.restoreArtBundle(owner, importedBackup);
   check(recovered.drawings[0].id === imported.drawings[0].id && recovered.rigs.some(rig=>rig.id === imported.rigs[0].id) && (await art.loadDrawingDraft(owner, imported.drawings[0].id)).assembly.notes === 'Backup draft', 'restore into an empty profile reconnects original image, movement and draft identities');
   await art.deleteArtwork(owner, recovered.drawings[0].id);
   owner = 'player1';
   const counts = await art.withArtTransaction(['drawings'], 'readwrite', async tx => {
    for (let i = 0; i < art.ART_LIMITS.drawingsPerOwner - 2; i++) {const fixture={ ...original, id: 'quota-fixture-' + i, name: 'Synthetic quota fixture' };tx.objectStore('drawings').add(fixture);art.saveDrawingMetadata(tx,fixture);}
   });
   const concurrent = await Promise.allSettled([art.saveDrawing(owner, 'Last slot', file), art.saveDrawing(owner, 'Racing slot', file)]);
   check(concurrent.filter(result => result.status === 'fulfilled').length === 1 && (await art.drawings(owner)).length === art.ART_LIMITS.drawingsPerOwner, 'concurrent image saves cannot exceed transactional quota');
   await rejects(() => art.importArtBundle(owner, bundle), 'whole art import rejected when any capacity would overflow');
   check((await art.listRigs(owner)).length === 2 && (await art.drawings(owner)).length === art.ART_LIMITS.drawingsPerOwner, 'capacity rejection adds no image or rig records');
   await art.withArtTransaction(['rigs'], 'readwrite', tx => {
    for (let i = 0; i < art.ART_LIMITS.rigsPerOwner - 3; i++) tx.objectStore('rigs').add({ ...first, id: 'rig-quota-fixture-' + i });
   });
   const rigRace = await Promise.allSettled([art.saveRig(owner, assembly), art.saveRig(owner, assembly)]);
   check(rigRace.filter(result => result.status === 'fulfilled').length === 1 && (await art.listRigs(owner)).length === art.ART_LIMITS.rigsPerOwner, 'concurrent rig saves cannot exceed transactional quota');
   owner = 'player2';
   const stale = await art.saveDrawing(owner, 'Failed save receipt fixture', file);
   await art.registerArtUsage(owner, {targetKind:'scene',targetId:'failed-scene-save',drawingId:stale.id});
   await rejects(()=>art.deleteArtwork(owner,stale.id), 'missing workspace cannot disprove a protective usage receipt');
   localStorage.setItem('family-game-factory-creation-v1', JSON.stringify({projects:[],revisions:[],drafts:[]}));
   check((await art.artUsages(owner, stale.id)).length === 0, 'valid source workspace disproves obsolete scene index rows');
   await art.deleteArtwork(owner,stale.id); localStorage.removeItem('family-game-factory-creation-v1');
   const source = await art.saveDrawing(owner, 'Source with derivative', file), derivative = await art.saveDrawing(owner, 'Separate crop', file, source.id);
   await rejects(() => art.deleteArtwork(owner, source.id), 'original cannot be erased while a derivative depends on it');
   await art.deleteArtwork(owner, derivative.id); await art.deleteArtwork(owner, source.id);
   check((await art.drawings(owner)).length === 0, 'unused derivative then original can be explicitly erased');
   // One explicitly kept picture is a backdrop and an animated prop in the
   // same scene. Later picture/rig revisions and unkept edits stay private.
   canvas.width = 900; canvas.height = 560;
   ctx.fillStyle = '#202b39'; ctx.fillRect(49, 49, 3, 3);
   const sketch = {transparent: true, strokes: [{ink: 0, size: 3, points: [{x: 50, y: 50}]}]};
   const raster = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
   const originalFile = await art.saveSketchPng(raster, sketch);
   const kept = await art.saveDrawing(owner, 'My moon rock', originalFile);
   const childVersion = await art.saveDrawing(owner, 'Cutout', raster, kept.id);
   await art.updateDrawing(owner, kept.id, {semanticIdentity: 'Rock'});
   const movement = {stops: [{x: .15, y: .6}, {x: .8, y: .25}], stepMs: 700};
   const movingRock = {...assembly, sourceId: childVersion.id, sourceSha256: childVersion.sha256, motion: movement};
   const pin = await art.saveRig(owner, movingRock);
   const picks = await art.creativeAssetChoices(owner, () => true);
   const picture = picks.find(choice => choice.drawingId === childVersion.id && !choice.rigId);
   const version = picks.find(choice => choice.rigId === pin.id);
   check([picture, version].every(choice => choice.identityId === kept.id && choice.semanticIdentity === 'Rock'),
     'picture and animation share the stable original identity');
   const scene = art.createStarterProject('blank', 'My rock adventure');
   scene.background = 'world-moon-v1';
   const actor = scene.actors[0];
   actor.assetId = version.assetId;
   scene.programs[0].actions = art.placeDrawingMotion(movement, actor, scene, () => crypto.randomUUID());
   art.placeBackdrop(scene, picture);
   const scenes = new art.CreationStore(localStorage, () => owner);
   const entry = scenes.create(owner, scene);
   scenes.keep(entry.id, owner, entry.headId);
   const laterMotion = {...movingRock, revision: 2, motion: {stops: [{x: 1, y: 1}], stepMs: 350}};
   await art.saveRig(owner, laterMotion, pin.id);
   await art.saveDrawingDraft(owner, {...laterMotion, notes: 'Private unfinished design'});
   await art.saveDrawing(owner, 'Later image revision', raster, childVersion.id);
   await art.updateDrawing(owner, childVersion.id, {archived: true});
   const retained = scenes.load(entry.id, owner);
   check(retained.project.keptId === entry.headId && retained.scene.background === 'world-moon-v1' &&
     retained.scene.actors[0].assetId === version.assetId && retained.scene.actors[1].layer === 'backdrop' &&
     retained.scene.actors[1].assetId === picture.assetId,
     'kept world, backdrop and animation survive archive and later revisions');
   check((await art.artUsages(owner, childVersion.id)).some(use => use.targetId === entry.id),
     'stored world history protects the archived background and animation');
   await rejects(() => art.validateGeneratedCreationManifest(retained.scene), 'generated manifest rejects local private pins');
   const portable = await art.exportSceneArt(owner, retained.scene);
   check(portable.art.drawings.length === 2 && portable.art.rigs.length === 1 && portable.art.rigs[0].id === pin.id &&
     !portable.art.drafts?.length, 'portable scene includes exact selected art and its ancestry without newer designs or drafts');
   owner = 'new-explorer';
   check(!(await art.creativeAssetChoices(owner, () => true)).length, 'another explorer starts with a separate catalog');
   await rejects(() => art.resolvePrivateArt(owner, picture.assetId), 'foreign background pixels remain private');
   const copied = await art.importSceneArt(owner, portable);
   const copiedImages = await art.drawings(owner);
   const copiedRoot = copiedImages.find(image => !image.sourceId);
   const copiedArt = await art.resolvePrivateArt(owner, copied.actors[0].assetId);
   check(copiedRoot.id !== kept.id && copiedRoot.sha256 === await art.drawingHash(await originalFile.arrayBuffer()) &&
     JSON.stringify(art.readSketch(copiedRoot.bytes)) === JSON.stringify(sketch) &&
     copied.actors[1].layer === 'backdrop' && copied.actors[1].assetId !== picture.assetId &&
     JSON.stringify(copiedArt.motion) === JSON.stringify(movement),
     'explicit import remaps backdrop and animation pins while preserving original bytes, editable marks and movement');
   return report;
  });
  assert.deepEqual(errors, []); assert.deepEqual(posts, []);
  for (const result of results) console.log('PASS ' + result);
  const migrationPage = await browser.newPage();
  await migrationPage.goto(`http://127.0.0.1:${server.address().port}/`);
  const migrationResult = await migrationPage.evaluate(async () => {
   const request = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const complete = tx => new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;canvas.getContext('2d').fillRect(0,0,64,48);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),bytes=await blob.arrayBuffer(),sha256=await art.drawingHash(bytes);
   const opening=indexedDB.open('family-private-drawings-v1',1);opening.onupgradeneeded=()=>opening.result.createObjectStore('drawings',{keyPath:'id'});
   const db=await request(opening),tx=db.transaction('drawings','readwrite'),saved=complete(tx);
   tx.objectStore('drawings').put({id:'legacy-original',owner:'player1',name:'Synthetic legacy car',mime:'image/png',bytes,sha256,createdAt:'2026-11-17T12:00:00.000Z'});await saved;db.close();
   const assembly={schemaVersion:1,sourceId:'legacy-original',sourceSha256:sha256,kind:'car',revision:1,notes:'',pieces:[{id:'body',name:'Body',role:'body',region:{x:.1,y:.1,w:.8,h:.5,shape:'rect'},parentId:null,physical:true},{id:'left',name:'Left',role:'wheel',region:{x:.1,y:.6,w:.2,h:.3,shape:'ellipse'},parentId:'body',physical:true},{id:'right',name:'Right',role:'wheel',region:{x:.7,y:.6,w:.2,h:.3,shape:'ellipse'},parentId:'body',physical:true}]};
   const legacyOpen=indexedDB.open('family-drawing-rigs-v1',1);legacyOpen.onupgradeneeded=()=>{legacyOpen.result.createObjectStore('rigs',{keyPath:'id'});legacyOpen.result.createObjectStore('active',{keyPath:'owner'});};
   const legacy=await request(legacyOpen),legacyTx=legacy.transaction(['rigs','active'],'readwrite'),legacySaved=complete(legacyTx);
   const parent={id:'z-parent',owner:'player1',parentId:null,assembly,savedAt:'2026-11-17T12:01:00.000Z'};
   legacyTx.objectStore('rigs').put(parent);legacyTx.objectStore('rigs').put({...parent,id:'a-child',parentId:parent.id});legacyTx.objectStore('rigs').put({...parent,id:'bad-source',assembly:{...assembly,sourceId:'absent'}});legacyTx.objectStore('active').put({owner:'player1',id:'a-child'});await legacySaved;legacy.close();
   const originals=await art.drawings('player1'),rigs=await art.listRigs('player1'),active=await art.activeRig('player1');
   if(originals.length!==1||originals[0].sha256!==sha256||rigs.length!==2||active.id!=='a-child'||(await art.rigById('player1','a-child')).parentId!=='z-parent')throw Error('Legacy migration lost pixels, valid history or active choice');
   if((await art.listRigs('player1')).length!==2)throw Error('Legacy migration duplicated versions');
   const retained=await request(indexedDB.open('family-drawing-rigs-v1',1));const oldRecords=await request(retained.transaction('rigs').objectStore('rigs').getAll());retained.close();if(oldRecords.length!==3)throw Error('Migration altered legacy recovery evidence');
   return 'legacy image database upgrades with parent-first valid rigs, exact pixels and selected car; invalid originals retained for recovery';
  });
  console.log('PASS '+migrationResult); await migrationPage.close();
  const probePage=await browser.newPage();await probePage.goto(`http://127.0.0.1:${server.address().port}/`);
  await probePage.evaluate(async()=>{
   const open=indexedDB.open.bind(indexedDB),inventory=indexedDB.databases.bind(indexedDB);let probes=0;indexedDB.open=(...args)=>{if(args[0]==='family-drawing-rigs-v1')probes++;return open(...args);};
   Object.defineProperty(indexedDB,'databases',{configurable:true,value:async()=>{throw Error('Synthetic inventory failure');}});
   let failure;try{await art.artDatabase();}catch(error){failure=error;}if(failure?.message!=='Synthetic inventory failure'||probes)throw Error('Inventory failure was treated as absence');
   Object.defineProperty(indexedDB,'databases',{configurable:true,value:undefined});const db=await art.artDatabase();db.close();if(probes!==1)throw Error('Unsupported inventory lost safe legacy probe fallback');
   Object.defineProperty(indexedDB,'databases',{configurable:true,value:inventory});
  });await probePage.close();console.log('PASS inventory errors remain visible and unsupported inventory retains legacy fallback');
  console.log(`PASS ${results.length + 2} private art storage contracts; zero network POSTs`);
 } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
