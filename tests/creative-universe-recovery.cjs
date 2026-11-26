// Two synthetic profiles, real browser image codecs and a fresh recovery destination.
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {build} = require('esbuild');
const {chromium} = require('playwright');

async function collect() {
  const modules = [
    'assets/private-drawings', 'drawing/crayon-source', 'drawing/creative-assets', 'drawing/library', 'drawing/store', 'drawing/transfer',
    'creation/private-art', 'creation/art-game', 'creation/projects', 'creation/storage',
    'creation/engine', 'creation/motion-path', 'rewards/write-guard', 'rewards/service',
    'storage/complete-backup',
  ];
  const contents = "import './src/legacy/store.js';\n" +
    modules.map(name => `export * from './src/${name}';`).join('\n');
  const built = await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,write:false,
    format:'iife',globalName:'creative',platform:'browser',define:{'import.meta.env.MODE':'"storage-preview"'}});
  const server = createServer((req, res) => {
    const script = req.url === '/app.js';
    res.setHeader('Content-Type', script ? 'text/javascript' : 'text/html');
    res.end(script ? built.outputFiles[0].text : '<!doctype html><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
    const origin = 'http://127.0.0.1:' + server.address().port;
    const page = await browser.newPage();
    const outgoing = [];
    const observe = request => { if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') outgoing.push(request.url()); };
    page.on('request', observe);
    await page.goto(origin);
    const saved = await page.evaluate(async () => {
      const a = window.creative, reports = [];
      function check(value, message) { if (!value) throw Error(message); reports.push(message); }
      async function rejected(fn, expected, label) {
        try { await fn(); } catch (e) { if (!expected.test(e.message)) throw e; reports.push(label); return; }
        throw Error(label);
      }
      await a.installRewardWriteGuard();
      const owner = FG.store.current().id, other = FG.store.familyProfiles().find(p => p.id !== owner).id;
      FG.store.changeProfile({name:'Synthetic maker'}); FG.studio = {flushDraft(){}}; FG.creation = {flush(){}};
      const store = new a.CreationStore(localStorage, () => FG.store.current().id);
      const shapes = [
        ['My Rock','rock','prop','obstacle',[[6,23],[15,8],[33,11],[43,25],[32,34],[10,32],[6,23]]],
        ['Puddle Friend','dragon','character','npc',[[8,7],[16,14],[29,8],[45,16],[38,34],[15,33],[8,7]]],
        ['Moon Buggy','buggy','vehicle','vehicle',[[5,21],[13,10],[31,10],[40,20],[46,21],[43,31],[5,31],[5,21]]],
        ['Castle Valley','castle','world','background',[[3,35],[3,13],[9,18],[15,9],[21,17],[29,8],[35,16],[44,12],[44,35],[3,35]]],
      ];
      const records = [];
      for (const [index, [name, semantic, category, role, outline]] of shapes.entries()) {
        const canvas = document.createElement('canvas');
        canvas.width = a.paperWidth; canvas.height = a.paperHeight;
        const ctx = canvas.getContext('2d');
        const strokes = [{color:a.crayons[index],size:18,points:outline.map(([x,y])=>({x:x*17,y:y*14}))}];
        const encode = async () => {
          a.renderStrokes(ctx,strokes,true);
          const png = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
          return a.includeCrayonSource(png,{transparent:true,strokes});
        };
        const file = await encode(), original = await a.saveDrawing(owner,name,file);
        await a.updateDrawing(owner, original.id, {category,semantic});
        const first = (await a.listCreativeAssets(owner)).find(item => item.drawingId === original.id);
        check(first.creativeId === original.id && first.category === category && first.semantic === semantic, name + ' has a stable categorized identity');

        const world = a.createStarterProject('blank', name + ' stage');
        world.world = {backdrop: category === 'world' ? first.assetId : 'world:jem-gardens:v1',fit:'contain',
          decorations:category === 'world' ? [] : [{id:'own-piece',assetId:first.assetId,name,x:26,y:58,size:25,plane:'front'}]};
        const setting = store.create(owner,world);
        await rejected(() => a.deleteArtwork(owner, original.id), /still uses|prepared game|saved version/i, name + ' retained original cannot be erased');

        const episode = a.createArtAdventure(first, 'scene');
        episode.actors[0].role = role;
        const motion = a.pathFromPoints('Along the trail', [{x:16,y:14},{x:31,y:7},{x:38,y:23}], 180);
        episode.programs = [{id:'trail',actorId:episode.actors[0].id,trigger:{type:'start'},actions:[a.pathBlock(motion)]}];
        const originalScene = store.create(owner,episode); store.keep(originalScene.id,owner);
        const hunt = a.createArtAdventure(first,'picture-hunt');
        const game = store.create(owner,hunt); store.keep(game.id,owner);
        const actor = hunt.actors[0];
        const play = a.runScene(hunt,{durationMs:1000,inputs:[0,200,400].map(timeMs=>({timeMs,type:'tap',actorId:actor.id}))});
        check(play.variables.found === 3 && actor.assetId === episode.actors[0].assetId, name + ' uses one picture in a working collectible game and distinct scene role');
        const movement = a.runScene(episode,{durationMs:1000});
        check(movement.actors[0].x === episode.actors[0].x + 22 && movement.actors[0].y === episode.actors[0].y + 9, name + ' follows its authored path');

        const uses = await a.artUsages(owner,original.id);
        check([originalScene.id,game.id,setting.id].every(id=>uses.some(use=>use.targetId===id)),name + ' usage inventory includes its game, world and animation');
        strokes.push({color:a.crayons[4],size:16,points:[{x:320,y:220},{x:365,y:240}]});
        const version = await a.saveDrawing(owner,name,await encode(),original.id);
        const second = (await a.listCreativeAssets(owner)).find(item=>item.drawingId === version.id);
        check(second.creativeId === first.creativeId && second.assetId !== first.assetId && version.sourceSha256 === original.sha256, name + ' new revision retains original lineage');
        const pinned = store.load(originalScene.id,owner);
        check(pinned.scene.actors[0].assetId === first.assetId && store.load(game.id,owner).scene.actors[0].assetId === first.assetId, name + ' saved game and animation stay pinned');
        pinned.scene.actors[0].assetId = second.assetId;
        store.save(originalScene.id,owner,pinned.scene,originalScene.headId);
        check(store.keptRevision(originalScene.id,owner).scene.actors[0].assetId === first.assetId, name + ' explicit update keeps earlier version recoverable');
        await a.updateDrawing(owner,original.id,{archived:true});
        check(!(await a.listCreativeAssets(owner)).some(item=>item.assetId===first.assetId) && (await a.resolvePrivateArt(owner,first.assetId)).drawingId === original.id, name + ' archive hides the picker item while adventures resolve it');
        const sprite = (await a.resolvePrivateArt(owner,first.assetId)).image;
        const pixels = sprite.getContext('2d').getImageData(0,0,sprite.width,sprite.height).data;
        check(pixels[3] === 0 && pixels.some((channel,i)=>i%4===3 && channel===255), name + ' preserves its transparent shape on reuse');
        records.push({id:original.id,sha256:original.sha256,exact:btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))),semantic,
          category,pin:first.assetId,newPin:second.assetId,scene:originalScene.id,game:game.id,world:setting.id});
      }
      FG.store.choose(other);
      check(!(await a.listCreativeAssets(other)).length, 'second profile sees its own empty collection');
      await rejected(()=>a.resolvePrivateArt(other,records[0].pin),/profile/, 'another profile cannot resolve a known private pin');
      await rejected(()=>a.resolvePrivateArt(owner,records[0].pin),/player|profile/, 'a stale owner cannot resolve pixels by supplying the former profile id');
      await rejected(()=>a.listCreativeAssets(owner),/player changed/i,'stale owner cannot open a picker');
      FG.store.choose(owner);
      const rewards = a.installRewards();
      const archive = await a.captureCompleteRecovery(rewards);
      const snapshot = await a.decodeCompleteBackup(archive,archive.manifest.scope);
      for (const rec of records) {
        const stored = snapshot.art.find(e=>e.owner===owner).bundle.drawings.find(d=>d.id===rec.id);
        check(stored.data===rec.exact && stored.semantic===rec.semantic && stored.archived,rec.semantic + ' exact bytes and identity reach complete backup');
      }
      const duplicateOwner = structuredClone(snapshot);
      const originalRock = snapshot.art.find(e=>e.owner===owner).bundle.drawings.find(d=>d.id===records[0].id);
      duplicateOwner.art.find(e=>e.owner===other).bundle.drawings.push(originalRock);
      await rejected(()=>a.checkCompleteArtwork(duplicateOwner),/more than one player/, 'duplicate owner for immutable art invalidates recovery before publication');
      const wrong = structuredClone(snapshot);
      const scenes = a.completeSources(wrong).creations.find(e=>e.owner===owner).workspace;
      // Change a backdrop only; all actor bindings stay intact.
      const worldId = records.at(-1).world;
      const originalWorld = scenes.revisions.find(r=>r.projectId===worldId);
      const wrongScene = wrong.progress.factoryCreation.revisions.find(r=>r.id===originalWorld.id) ??
        wrong.creations.find(e=>e.owner===owner).workspace.revisions.find(r=>r.id===originalWorld.id);
      wrongScene.scene.world.backdrop = 'art:image:missing-world:'+'0'.repeat(64);
      await rejected(()=>a.checkCompleteArtwork(wrong),/missing its original picture/, 'missing backdrop invalidates the complete recovery point');
      wrong.art.find(e=>e.owner===other).bundle.drawings.push({...originalRock,id:'foreign-rock'});
      wrongScene.scene.world.backdrop = 'art:image:foreign-rock:'+originalRock.sha256;
      await rejected(()=>a.checkCompleteArtwork(wrong),/missing its original picture/,'identical bytes from a sibling cannot satisfy a world pin');
      return {archive,owner,records,reports};
    });
    await page.close();

    const target = await browser.newPage();
    target.on('request',observe); await target.goto(origin);
    const restored = await target.evaluate(async ({archive,owner,records}) => {
      const a = window.creative;
      await a.installRewardWriteGuard();
      FG.studio = {flushDraft(){}}; FG.creation = {flush(){}};
      await a.restoreCompleteRecovery(a.installRewards(),archive);
      const store = new a.CreationStore(localStorage);
      const reports = [];
      for (const item of records) {
        const original = await a.drawing(owner,item.id);
        if (btoa(String.fromCharCode(...new Uint8Array(original.bytes)))!==item.exact ||
            original.sha256!==item.sha256 || !original.archived || original.category!==item.category ||
            original.semantic!==item.semantic) throw Error('Restored artwork differs: '+item.semantic);
        const editable = await a.verifiedCrayonSource(original.bytes);
        if (editable?.strokes.length!==1 || !editable.transparent) throw Error('Editable drawing lost on restore');
        const scene = store.load(item.scene,owner).scene, game = store.load(item.game,owner).scene;
        const setting = store.load(item.world,owner).scene;
        if (scene.actors[0].assetId!==item.newPin || store.keptRevision(item.scene,owner).scene.actors[0].assetId!==item.pin ||
            game.actors[0].assetId!==item.pin || !a.privateArtReferences(setting).includes(item.pin) ||
            a.reusablePaths(scene)[0]?.name!=='Along the trail') throw Error('Restored use differs: '+item.semantic);
        reports.push(item.semantic+' restores exact bytes, archived original, kept/head scene, game, world and named path on fresh device');
      }
      return reports;
    }, saved);
    assert.deepEqual(outgoing,[]);
    console.log([...saved.reports,...restored,'No outbound service requests'].join('\n'));
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
collect().catch(error=>{console.error(error);process.exitCode=1;});
