import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {build} from 'esbuild';
import type {BrowserContext,Page} from 'playwright';

export async function migrationBrowser(ctx:BrowserContext){
 const sourceOrigin='https://original-household.example',targetOrigin='https://new-household.example';
 const map={familyId:'existing-owner',workspace:'original-workspace',sourceOrigin,targetOrigin};
 const script=readFileSync('server/beta/web/household-vault.js','utf8');
 await ctx.route('**/*',route=>route.fulfill(route.request().url().endsWith('vault.js')?{contentType:'text/javascript',body:script}:
  {contentType:'text/html',body:'<title>Synthetic household device</title><script type="module">import * as vault from "/vault.js";window.vault=vault;</script>'}));
 const open=async(host:string)=>{const tab=await ctx.newPage();await tab.goto(host);await tab.waitForFunction(()=>Boolean((window as any).vault));return tab;};
 const source=await open(sourceOrigin);
 try{
  await source.evaluate(async()=>{
   localStorage.setItem('family-game-factory-state-v1',JSON.stringify({games:['Splash or Pass','Dragon'],math:{facts:4},english:{stories:2}}));
   localStorage.setItem('family-game-factory-workspace-v2','coding project and retained revisions');
   localStorage.setItem('family-game-factory-studio-v1','conversation notebook');
   localStorage.setItem('family-game-factory-problem-solving-v1','local episodes');
   localStorage.setItem('family-game-factory-adult:adult:11111111-1111-4111-8111-111111111111:family-game-factory-creation-v1','private creation');
   localStorage.setItem('unrelated-site-record','ignore');sessionStorage.setItem('private-session','ignore');document.cookie='unrelated=not-exported;Secure';
   for(const name of ['family-game-factory-rewards-v1','family-game-factory-pals-v1','family-private-drawings-v1','jems-records-preparation-v1']){
    await new Promise<void>((ok,fail)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{if(name==='jems-records-preparation-v1')r.result.createObjectStore('pending');const s=r.result.createObjectStore('records',{keyPath:'id'});s.createIndex('owner','owner');
     s.add({id:'saved',owner:'original',image:new Blob([new Uint8Array([3,9,7])],{type:'image/png'}),date:new Date('2026-11-01'),bytes:new Uint8Array([27,4])});};
     r.onerror=()=>fail(Error(name+' initialization failed: '+String(r.error)));r.onsuccess=()=>{r.result.close();ok();};});
   }
  });
  await source.evaluate(()=>localStorage.setItem('family-game-factory-reward-backup-journal-v1','pending synthetic restore'));
  await assert.rejects(source.evaluate(m=>(window as any).vault.exportHousehold(m),map),/pending backup recovery/);
  await source.evaluate(()=>localStorage.removeItem('family-game-factory-reward-backup-journal-v1'));
  const pending=async(add:boolean)=>source.evaluate(async add=>{await new Promise<void>((ok,fail)=>{const r=indexedDB.open('jems-records-preparation-v1');r.onsuccess=()=>{const tx=r.result.transaction('pending','readwrite');if(add)tx.objectStore('pending').put({state:'applying'},'synthetic-pending');else tx.objectStore('pending').delete('synthetic-pending');tx.oncomplete=()=>{r.result.close();ok();};tx.onerror=()=>fail(tx.error);};r.onerror=()=>fail(r.error);});},add);
  await pending(true);await assert.rejects(source.evaluate(m=>(window as any).vault.exportHousehold(m),map),/pending storage recovery/);await pending(false);
  const archive=await source.evaluate(m=>(window as any).vault.exportHousehold(m),map);
  assert.equal(archive.body.data.databases.length,4);assert.ok(!JSON.stringify(archive).includes('not-exported'));
  const dest=await open(targetOrigin);
  const restore=(p:Page,m:typeof map,a:typeof archive,undo=false)=>p.evaluate(([map,file,rollback])=>(window as any).vault.restoreHousehold(map,file,rollback),[m,a,undo]);
  const bad=structuredClone(archive);bad.body.data.local[0][1]='unexpected';await assert.rejects(restore(dest,map,bad));
  await assert.rejects(restore(dest,{...map,familyId:'invited-family'},archive));
  const external=await open('https://f-11111111-1111-4111-8111-111111111111.workshop.example');await assert.rejects(restore(external,map,archive));
  await dest.evaluate(()=>localStorage.setItem('family-game-factory-state-v1','prior work'));await assert.rejects(restore(dest,map,archive));
  assert.equal(await dest.evaluate(()=>localStorage.getItem('family-game-factory-state-v1')),'prior work');
  await dest.evaluate(()=>localStorage.removeItem('family-game-factory-state-v1'));
  // Simulate process eviction after the durable journal and one verified write.
  await dest.evaluate(a=>{localStorage.setItem('jems-household-transfer-in-progress-v1',a.sha256);localStorage.setItem(a.body.data.local[0][0],a.body.data.local[0][1]);},archive);
  assert.deepEqual(await restore(dest,map,archive,true),{rolledBack:true});
  for(let i=0;i<2;i++)assert.deepEqual(await restore(dest,map,archive),{complete:true});
  assert.ok(await dest.evaluate(()=>localStorage.getItem('family-game-factory-state-v1')?.includes('Splash or Pass')));
  assert.equal(await dest.evaluate(()=>localStorage.getItem('unrelated-site-record')),null);
  assert.equal((await source.evaluate(m=>(window as any).vault.exportHousehold(m),map)).sha256,archive.sha256);
  // Separate native origin storage persists even when the same browser switches families.
  await external.evaluate(()=>localStorage.setItem('family-game-factory-state-v1','invited B'));
  assert.equal(await external.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),null);
  await external.close();
 }finally{await ctx.close();}
}

/** Full application source-to-target transfer with real versioned records and native playback. */
export async function applicationMigrationBrowser(ctx:BrowserContext,engine:string){
 const sourceOrigin='https://saved-household.example',targetOrigin='https://restored-household.example';
 const map={familyId:'existing-owner',workspace:'original-workspace',sourceOrigin,targetOrigin};
 const fixture=(await build({entryPoints:['tests/beta-household-fixture.ts'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
 const vault=readFileSync('server/beta/web/household-vault.js','utf8'),root=resolve('dist');
 if(!existsSync(root+'/index.html'))throw Error('Build the ordinary application before household migration acceptance.');
 await ctx.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(![sourceOrigin,targetOrigin].includes(url.origin)){await route.abort();return;}
  if(url.pathname==='/fixture.js'){await route.fulfill({contentType:'text/javascript',body:fixture});return;}
  if(url.pathname==='/vault.js'){await route.fulfill({contentType:'text/javascript',body:vault});return;}
  if(url.pathname==='/transfer'){await route.fulfill({contentType:'text/html',body:'<title>Synthetic migration</title><script type="module">import * as vault from "/vault.js";window.vault=vault;</script>'});return;}
  const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+'/')||!existsSync(file)){await route.fulfill({status:404,body:'Not found'});return;}
  const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
  await route.fulfill({contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)});
 });
 const source=await ctx.newPage(),dest=await ctx.newPage();
 const app=async(p:Page,origin:string)=>{await p.goto(origin+'/');await p.waitForFunction(()=>Boolean((window as any).FG?.studio));};
 const transfer=async(p:Page,origin:string)=>{await p.goto(origin+'/transfer');await p.waitForFunction(()=>Boolean((window as any).vault));};
 try{
  await app(source,sourceOrigin);
  const before=await source.evaluate(async()=>{const modulePath='/fixture.js',fixture=await import(modulePath);return fixture.createHousehold();});
  await transfer(source,sourceOrigin);const archive=await source.evaluate(m=>(window as any).vault.exportHousehold(m),map);
  await transfer(dest,targetOrigin);await dest.evaluate(([m,a])=>(window as any).vault.restoreHousehold(m,a),[map,archive]);
  await app(dest,targetOrigin);
  const restored=await dest.evaluate(async art=>{const modulePath='/fixture.js',fixture=await import(modulePath);return fixture.inspectHousehold(art);},before.art);
  assert.deepEqual(restored.workspace,before.workspace);assert.deepEqual(restored.notebook,before.notebook);assert.deepEqual(restored.art,before.art);
  for(const entry of before.entries){
   await dest.evaluate(e=>{const FG=(window as any).FG;if(!FG.store.choose(e.owner))throw Error('Profile switch blocked');window.dispatchEvent(new Event('factory-profile'));FG.store.current().mathWindow=[Date.now()];FG.store.save();return FG.studio.open(e.sessionId);},entry);
   await dest.locator('#page-studio.studio-play-mode').waitFor();
   if(entry.game==='buckets'){
    await dest.waitForFunction(()=>Boolean((window as any).FG.runtime.snapshot()?.state?.splashMs));
    assert.equal(await dest.evaluate(()=>(window as any).FG.runtime.snapshot().state.splashMs),entry.config.splashMs);
    for(let i=0;i<3;i++)await dest.locator('#game-mount #go').click();
    await dest.locator('#game-mount #right').click();
    assert.equal(await dest.evaluate(()=>(window as any).FG.runtime.snapshot().state.mode),'play');
   }else{
    await dest.waitForFunction(()=>(window as any).FG.runtime.snapshot()?.state?.assets===22);
    await dest.locator('#game-mount #startBtn').click();assert.equal(await dest.evaluate(()=>(window as any).FG.runtime.snapshot().state.mode),'playing');
   }
   await dest.locator('#game-mount').screenshot({path:'test-results/family-beta/'+engine+'-restored-'+entry.game+'-'+entry.owner+'.png'});
   await dest.locator('#studioHome').click();
   await dest.evaluate(e=>(window as any).FG.studio.open(e.legacySessionId),entry);
   await dest.locator('#page-studio.studio-play-mode').waitFor();
   const older=await dest.evaluate(()=>(window as any).FG.runtime.snapshot().state);
   assert.equal(entry.game==='buckets'?older.splashMs:older.breathSpeed,entry.game==='buckets'?entry.config.splashMs:entry.config.breathSpeed);
   await dest.locator('#studioHome').click();
  }
  await transfer(source,sourceOrigin);assert.equal((await source.evaluate(m=>(window as any).vault.exportHousehold(m),map)).sha256,archive.sha256);
  console.log(engine+' restored two profile owners, eight kept projects, saved mechanics, original art bytes and original Studio session IDs; both current and earlier native engines launched');
 }finally{await ctx.close();}
}
