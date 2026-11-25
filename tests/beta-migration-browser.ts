import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Browser,Page} from 'playwright';

export async function migrationBrowser(browser:Browser){
 const ctx=await browser.newContext();
 const sourceOrigin='https://original-household.example',targetOrigin='https://new-household.example';
 const map={familyId:'existing-owner',workspace:'original-workspace',sourceOrigin,targetOrigin};
 const script=readFileSync('server/beta/web/household-vault.js','utf8');
 await ctx.route('**/*',route=>route.fulfill(route.request().url().endsWith('vault.js')?{contentType:'text/javascript',body:script}:
  {contentType:'text/html',body:'<title>Synthetic household device</title><script type="module">import * as vault from "/vault.js";window.vault=vault;</script>'}));
 const open=async(host:string)=>{const tab=await ctx.newPage();await tab.goto(host);await tab.waitForFunction(()=>Boolean((window as any).vault));return tab;};
 const source=await open(sourceOrigin),dest=await open(targetOrigin);
 try{
  await source.evaluate(async()=>{
   localStorage.setItem('family-game-factory-state-v1',JSON.stringify({games:['Splash or Pass','Dragon'],math:{facts:4},english:{stories:2}}));
   localStorage.setItem('family-game-factory-workspace-v2','coding project and retained revisions');
   localStorage.setItem('family-game-factory-studio-v1','conversation notebook');
   localStorage.setItem('family-game-factory-problem-solving-v1','local episodes');
   localStorage.setItem('family-game-factory-adult:adult:11111111-1111-4111-8111-111111111111:family-game-factory-creation-v1','private creation');
   localStorage.setItem('unrelated-site-record','ignore');sessionStorage.setItem('private-session','ignore');document.cookie='unrelated=not-exported;Secure';
   for(const name of ['family-game-factory-rewards-v1','family-game-factory-pals-v1','family-private-drawings-v1','jems-records-preparation-v1']){
    await new Promise<void>((ok,fail)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records',{keyPath:'id'});s.createIndex('owner','owner');
     s.add({id:'saved',owner:'original',image:new Blob([new Uint8Array([3,9,7])],{type:'image/png'}),date:new Date('2026-11-01'),bytes:new Uint8Array([27,4])});};
     r.onerror=()=>fail(r.error);r.onsuccess=()=>{r.result.close();ok();};});
   }
  });
  const archive=await source.evaluate(m=>(window as any).vault.exportHousehold(m),map);
  assert.equal(archive.body.data.databases.length,4);assert.ok(!JSON.stringify(archive).includes('not-exported'));
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
