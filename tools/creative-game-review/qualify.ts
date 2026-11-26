import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright';
import {startReview} from './serve';
import {validPosition} from './contract';

async function run() {
  for (const invalid of [-1,89,621,90.75,NaN,Infinity,'150',{},null]) assert.equal(validPosition(invalid),false);
  const server = await startReview(), url = 'http://127.0.0.1:'+(server.address() as AddressInfo).port;
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  try {
    for (const [device,width,height] of [['desktop',1024,700],['phone',390,844]] as const) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:device==='phone'});
      const page = await context.newPage(), errors:string[]=[], external:string[]=[];
      try {
        await page.addInitScript(() => {
          if (window.parent !== window) return;
          const outgoing:unknown[] = []; (window as any).__reviewOutgoing = outgoing;
          const send = MessagePort.prototype.postMessage;
          MessagePort.prototype.postMessage = function(message, ...args) {outgoing.push(message);return Reflect.apply(send,this,[message,...args]);};
        });
        page.on('pageerror',e=>errors.push(e.message));
        context.on('request',request=>{if (!request.url().startsWith(url+'/')&&!request.url().startsWith('blob:') || request.method() !== 'GET') external.push(request.url());});
        await page.goto(url);
        await page.getByRole('button',{name:'Choose drawing'}).click();
        const rock = page.locator('[data-private-art]');
        const pin = await rock.getAttribute('data-private-art');
        assert.match(pin!,/^art:image:[\w-]+:[0-9a-f]{64}$/);
        await rock.click();
        const position = (n:number) => page.waitForFunction(x => document.querySelector<HTMLElement>('#stage')?.dataset.position===String(x),n);
        await position(150);
        await page.getByRole('button',{name:'Move right'}).click();
        await position(162);
        // Verify actual pixels at the new position, including transparent edges.
        const matchesOriginal = await page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve,reject) => {const r=indexedDB.open('family-private-drawings-v1'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);});
          const source = await new Promise<any>((resolve,reject) => {const r=db.transaction('drawings').objectStore('drawings').openCursor();r.onsuccess=()=>resolve(r.result?.value);r.onerror=()=>reject(r.error);});
          db.close();
          const original = await createImageBitmap(new Blob([source.bytes],{type:'image/png'}));
          const room = new Image(); room.src='/workshop.webp'; await room.decode();
          const check = document.createElement('canvas'); check.width=720; check.height=400;
          const g = check.getContext('2d')!; g.drawImage(room,0,-40,720,480);
          const h = 100 * original.height/original.width;
          g.drawImage(original,112,280-h/2,100,h); original.close();
          const stage = document.querySelector<HTMLCanvasElement>('#stage')!.getContext('2d')!;
          const a = g.getImageData(0,0,720,400).data, b = stage.getImageData(0,0,720,400).data;
          return a.every((byte,index)=>byte===b[index]);
        });
        assert.equal(matchesOriginal,true);
        await page.locator('#stage').focus(); await page.keyboard.press('ArrowLeft'); await position(150);
        assert.deepEqual(await page.evaluate(()=>(window as any).__reviewOutgoing),['right','left']);
        assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
        const runtime = page.frames().find(frame=>frame.url()===url+'/frame')!;
        assert.ok(!(await runtime.content()).includes(pin!.split(':')[2]));
        await page.reload();
        await position(150);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await mkdir('test-results/creative-game-review',{recursive:true});
        await page.screenshot({path:'test-results/creative-game-review/'+device+'.png',fullPage:true});
        // Simulate a restored record whose bytes no longer match the original hash.
        await page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve,reject) => {const r=indexedDB.open('family-private-drawings-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
          const tx=db.transaction('drawings','readwrite'), store=tx.objectStore('drawings'), cursor=store.openCursor();
          cursor.onsuccess=()=>{const c=cursor.result;if (c) c.update({...c.value,bytes:new Uint8Array([1,2,3]).buffer});};
          await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);}); db.close();
        });
        await page.reload(); await page.getByText('This version could not play.',{exact:false}).waitFor();
        assert.equal(await page.locator('iframe').count(),0);
        assert.equal(await page.getByRole('button',{name:'Move right'}).isDisabled(),true);
        assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
        console.log('PASS',device,'pinned generated fixture, ordinary move, saved pin/replay, bounded channel, hash failure, local GET only');
      } finally {await context.close();}
    }
  } finally {await browser.close(); await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
