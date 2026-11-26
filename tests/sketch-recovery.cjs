// A saved private PNG is simultaneously a normal image and an editable My Art page.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {start}=require('./browser-server.cjs');

async function pictures(page) {
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('family-private-drawings-v1');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    try{
      const rows=await new Promise((resolve,reject)=>{
        const r=db.transaction('drawings').objectStore('drawings').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
      });
      return Promise.all(rows.map(async item=>{
        const blob=new Blob([item.bytes],{type:item.mime}), image=await createImageBitmap(blob);
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();
        return {id:item.id,digest:item.sha256,parent:item.sourceId,parentDigest:item.sourceSha256,category:item.category,
          background:[...ctx.getImageData(0,0,1,1).data],ink:[...ctx.getImageData(450,280,1,1).data]};
      }));
    }finally{db.close();}
  });
}

(async()=>{
  const server=start();
  await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const base='http://127.0.0.1:'+server.address().port+'/arcade/?art=1';
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage(), posts=[], errors=[];
    page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:'{"version":1,"mode":"unavailable"}'}));
    await page.goto(base);await page.locator('#artDrawButton').click();
    const editor=page.locator('dialog.drawing-paint'),paper=editor.locator('[data-paper]');
    await editor.getByRole('button',{name:'Character',exact:true}).click();
    await paper.press('Enter');
    const options=editor.locator('[data-options]');
    if(!await options.evaluate(node=>node.open))await options.locator('summary').click();
    await options.locator('[data-background]').selectOption('clear');
    await editor.locator('[data-title]').fill('Moon mole');
    await page.evaluate(()=>{
      const native=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(...args){
        if(this.name==='drawings'){
          IDBObjectStore.prototype.add=native;
          throw new DOMException('Fixture storage is full','QuotaExceededError');
        }
        return native.apply(this,args);
      };
    });
    await editor.locator('[data-save]').click();
    await editor.locator('[data-message]').filter({hasText:/full/i}).waitFor();
    assert.equal(await editor.locator('[data-title]').inputValue(),'Moon mole');
    assert.deepEqual(await pictures(page),[],'failed first save rolls back and keeps the open drawing');
    await editor.locator('[data-save]').click();await editor.waitFor({state:'detached'});
    const [original]=await pictures(page);
    assert.equal(original.category,'character');assert.equal(original.background[3],0);assert.ok(original.ink[3]>0);
    await page.reload();await page.locator('[data-art-id="'+original.id+'"]').click();
    await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
    assert.equal(await editor.locator('[data-title]').inputValue(),'Moon mole');
    assert.equal(await editor.locator('[data-background]').inputValue(),'clear');
    await editor.locator('[data-tool=eraser]').click();await paper.press('Enter');
    await editor.locator('[data-title]').fill('Moon mole hiding');await editor.locator('[data-save]').click();
    await editor.waitFor({state:'detached'});
    const rows=await pictures(page),version=rows.find(x=>x.parent===original.id);
    assert.ok(version);assert.deepEqual(rows.find(x=>x.id===original.id),original);
    assert.equal(version.parentDigest,original.digest);assert.notEqual(version.digest,original.digest);assert.equal(version.ink[3],0);
    await page.locator('.art-library-more summary').click();
    const downloading=page.waitForEvent('download');await page.locator('#artExport').click();
    const library=JSON.parse(await fs.readFile(await (await downloading).path(),'utf8'));
    const restored=await browser.newContext(), next=await restored.newPage();
    await next.route('**/factory-config.json',r=>r.abort());
    await next.goto(base);await next.locator('#artDrawButton').waitFor();
    await next.locator('#artRestore').setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(library))});
    await next.locator('#artStatus').filter({hasText:'Original art versions restored'}).waitFor();
    assert.deepEqual((await pictures(next)).sort((a,b)=>a.id.localeCompare(b.id)),rows.sort((a,b)=>a.id.localeCompare(b.id)));
    await next.locator('[data-art-id="'+original.id+'"]').click();
    await next.getByRole('button',{name:'Keep drawing',exact:true}).click();
    const recovered=next.locator('dialog.drawing-paint');
    assert.equal(await recovered.locator('[data-title]').inputValue(),'Moon mole');
    assert.equal(await recovered.locator('[data-background]').inputValue(),'clear');
    assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    console.log('PASS sketch save retry, true transparency, editable reopen, immutable version and private bundle restore');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
