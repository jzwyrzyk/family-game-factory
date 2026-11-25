import assert from 'node:assert/strict';
import type {Browser} from 'playwright';
import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
export async function previewBrowser(browser:Browser){
 const ctx=await browser.newContext(),page=await ctx.newPage(),family='https://workshop.example',preview='https://generated.example/family-preview';
 const script=transformSync(readFileSync('src/builder/open-preview.ts','utf8'),{loader:'ts',format:'esm'}).code;
 await ctx.route('**/*',async route=>{
  const q=route.request();
  if(q.url()===preview){await route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"sandbox allow-scripts; default-src 'none'"},body:'<title>Private synthetic preview</title>'});return;}
  if(q.url().endsWith('/open.js')){await route.fulfill({contentType:'text/javascript',body:script});return;}
  await route.fulfill({contentType:'text/html',headers:{'Referrer-Policy':'strict-origin'},body:'<iframe sandbox="allow-scripts"></iframe><script type="module">import {openPreviewFrame} from "/open.js";window.start=openPreviewFrame;</script>'});
 });
 try{
  await page.goto(family+'/play/');await page.waitForFunction(()=>typeof (window as any).start==='function');
  const event=page.waitForRequest(r=>r.url()===preview);
  await page.evaluate(url=>(window as any).start(document.querySelector('iframe'),{url,grant:'synthetic-signed-preview'},crypto.randomUUID()),preview);
  const req=await event;assert.equal(ctx.pages().length,1);assert.equal(req.method(),'POST');assert.equal((await req.allHeaders()).origin,family);assert.equal(new URLSearchParams(req.postData()!).get('grant'),'synthetic-signed-preview');assert.ok(!req.url().includes('synthetic'));
  await page.waitForFunction(()=>document.querySelector('iframe')!.contentDocument===null);
 }finally{await ctx.close();}
}
