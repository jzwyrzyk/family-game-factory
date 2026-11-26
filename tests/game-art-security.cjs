// Defensive boundary tests on isolated synthetic browser origins and real IndexedDB.
const {chromium}=require('playwright');
const {build}=require('esbuild');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const bundled=await build({stdin:{contents:`
 export * from './src/game-art/bindings';
 export * from './src/game-art/resolve';
 export * from './src/assets/private-drawings';
 export * from './src/drawing/transfer';
 export * from './src/studio/notebook';
 export * from './src/drawing/library';
 export * from './src/storage/complete-backup';
 export * from './server/sandbox/frame-v2';
 `,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'J',define:{'import.meta.env.MODE':'"test"'}});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext(),p=await ctx.newPage();
  await ctx.route('https://*.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Scoped synthetic review</title>'}));
  await p.goto('https://one.test/');await p.addScriptTag({content:bundled.outputFiles[0].text});
  const {session,source,checks}=await p.evaluate(async base64=>{
    const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
    const reject=async(fn,label)=>{let caught=false;try{await fn();}catch{caught=true;}check(caught,label);};
    let owner='player1';window.FG={store:{current:()=>({id:owner})}};
    const file=new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'});
    const source=await J.saveDrawing(owner,'My rock',file);
    const pin={logicalId:source.id,originalSha256:source.sha256,drawingId:source.id,sha256:source.sha256,role:'collectible',name:'My rock',intent:'Add one point'};
    const book=new J.StudioNotebook(localStorage);const session=book.create(owner,'new','Pebble path');
    const plan=J.emptyArtPlan();J.selectGameArt(plan,pin);const test=J.saveArtTest(plan,'1'.repeat(64),null);plan.kept=test.id;
    book.update(session.id,owner,s=>s.gameArt=plan);
    const scope={origin:location.origin,owner,game:session.id,version:test.id};
    let allowed=true;
    const active=()=>allowed?{owner,game:session.id,plan:book.get(session.id,'player1').gameArt}:null;
    const resolve=(changes={})=>J.resolveArtTest({...scope,...changes},active);
    const blob=async out=>await J.drawingHash(out.assets[0].bytes);
    const first=await resolve();check(await blob(first)===pin.sha256,'Exact original bytes reach renderer');
    check(JSON.stringify(Object.keys(first.assets[0]).sort())===JSON.stringify(['bytes','height','id','mime','width']),'Raster projection excludes identity, fingerprint, intent and name');
    check(first.assets[0].id==='slot_collectible','Only a game-local handle is present');
    await reject(()=>resolve({origin:'https://two.test'}),'Foreign family origin denied');
    await reject(()=>resolve({game:'different'}),'Cross-game handle denied');
    await reject(()=>resolve({version:'unbound'}),'Forged revision denied');
    owner='player2';await reject(()=>resolve(),'Profile switch invalidates replay');await reject(()=>first.assertCurrent(),'Earlier projection invalid after profile switch');
    await reject(()=>J.resolveArtTest({...scope,owner},active),'Foreign image unavailable even with a matching fingerprint');owner='player1';
    const fresh=await resolve();allowed=false;await reject(()=>resolve(),'Withdrawn host authorization denied');await reject(()=>fresh.assertCurrent(),'Earlier projection revoked');allowed=true;
    await reject(()=>fresh.assertCurrent(),'New authorization cannot reactivate a revoked launch');
    for(const bad of [{role:'store'},{url:'https://outside.test'},{sha256:'bad'}]){
      await reject(()=>J.validateGameArt({...plan,pins:[{...pin,...bad}]}),'Unsupported metadata rejected '+Object.keys(bad)[0]);
    }
    await reject(()=>J.copyCommand({type:'image',assetId:'slot_obstacle',x:2,y:2,width:9,height:9},new Set(['slot_collectible'])),'Unbound draw command rejected');
    await J.updateDrawing(owner,source.id,{archived:true,name:'Older rock'});
    check(await blob(await resolve())===source.sha256,'Archived drawing still serves its saved version');
    await reject(()=>J.deleteArtwork(owner,source.id),'Retained game art protected from erasure');
    const replacement=await J.saveDrawing(owner,'New rock',file,source.id);J.selectGameArt(plan,{...pin,drawingId:replacement.id});
    const improved=J.saveArtTest(plan,'2'.repeat(64),test.id);book.update(session.id,owner,s=>s.gameArt=plan);
    check(improved.pins[0].drawingId===replacement.id && plan.tests[0].pins[0].drawingId===source.id,'Explicit replacement is confined to new test');
    const copy=book.fork(session.id,owner,'Another path',null,null);
    const copyActive=()=>({owner,game:copy.id,plan:copy.gameArt});
    await reject(()=>J.resolveArtTest(scope,copyActive),'Copy cannot reuse original launch scope');
    check(await blob(await J.resolveArtTest({...scope,game:copy.id},copyActive))===source.sha256,'Copy resolves retained art in its own game');
    const wrong=structuredClone(plan);wrong.tests[0].pins[0].sha256='f'.repeat(64);
    await reject(()=>J.resolveArtTest(scope,()=>({owner,game:session.id,plan:wrong})),'Wrong revision fingerprint denied');
    wrong.tests[0].pins[0]={...pin,logicalId:replacement.id};
    await reject(()=>J.resolveArtTest(scope,()=>({owner,game:session.id,plan:wrong})),'Forged logical artwork identity denied');
    const archive=await J.exportArtBundle(owner);
    const progress={profiles:[{id:owner}],factoryStudio:book.read(),factoryWorkspace:{version:2,projects:[],revisions:[],plays:[]},factoryCreation:{schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]}};
    const snapshot={progress,art:[{owner,bundle:archive}]};
    await J.checkCompleteArtwork(snapshot);
    const missing=structuredClone(snapshot);missing.art[0].bundle.drawings=[];
    await reject(()=>J.checkCompleteArtwork(missing),'Incomplete recovery backup rejected');
    const saved=book.read();
    await J.withArtTransaction(['drawings'],'readwrite',tx=>tx.objectStore('drawings').delete(source.id));
    await reject(()=>resolve(),'Missing original stops play');
    await J.restoreArtBundle(owner,archive);
    check(await blob(await resolve())===source.sha256,'Idempotent restore reconnects exact bytes');
    await J.withArtTransaction(['drawings'],'readwrite',async tx=>{
      const item=await J.artRequest(tx.objectStore('drawings').get(source.id));new Uint8Array(item.bytes)[32]^=1;tx.objectStore('drawings').put(item);
    });
    await reject(()=>resolve(),'Fresh digest check detects damaged stored bytes');
    book.restore(saved);return {session:book.get(session.id,owner),source:{id:source.id,sha256:source.sha256},checks};
  },fs.readFileSync('tests/game-art/rock.png').toString('base64'));
  await p.goto('https://two.test/');await p.addScriptTag({content:bundled.outputFiles[0].text});
  assert.ok(await p.evaluate(async s=>{
    try{await J.resolveArtTest({origin:location.origin,owner:s.owner,game:s.id,version:s.gameArt.kept},()=>({owner:s.owner,game:s.id,plan:s.gameArt}));return false;}catch{return true;}
  },session),'Matching local profile and notebook identifiers on another origin cannot recover the raster');
  assert.ok(source.sha256);console.log(checks.map(label=>'PASS '+label).join('\n')+'\nPASS second origin cannot resolve a copied plan');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
