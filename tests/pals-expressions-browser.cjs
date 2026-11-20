/* Real approved WebP expressions in an isolated browser fixture; no rewards. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const fixture=`import {createPalExpressionExplorer} from './src/pals/expression-explorer';
 const view=createPalExpressionExplorer({owner:'family/player1'});
 document.querySelector('main')!.append(view.element);
 window.palExpressionFixture=view;`;
 const bundle=await build({absWorkingDir:root,stdin:{contents:fixture,resolveDir:root,sourcefile:'pal-expression-browser-fixture.ts'},bundle:true,format:'iife',outdir:'fixture',write:false});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/arcade/"><link rel="stylesheet" href="./fixture.css"><style>main{max-width:900px;margin:auto;padding:16px}</style></head><body><main></main><script src="./fixture.js"></script></body></html>';
 const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/'||pathname==='/arcade/') {response.setHeader('content-type','text/html');response.end(html);return;}
  if(pathname==='/arcade/fixture.js'){response.setHeader('content-type','application/javascript');response.end(js);return;}
  if(pathname==='/arcade/fixture.css'){response.setHeader('content-type','text/css');response.end(css);return;}
  const file=path.resolve(root,'public',pathname.replace(/^\/arcade\//,''));
  if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
  response.setHeader('content-type',path.extname(file)==='.webp'?'image/webp':'application/json');
  response.end(fs.readFileSync(file));
 });
 let browser;
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}/arcade/`;
  await page.goto(base);await page.waitForFunction(()=>!!window.palExpressionFixture);
  assert.equal(await page.locator('img').count(),0,'collapsed panel loads no images');
  await page.locator('.pal-expression-explorer > summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="Pal to preview"] option').length===23);
  assert.equal(await page.locator('.pal-expression-explorer select[aria-label="Pal to preview"] option').count(),23);
  await page.locator('select[aria-label="Pal to preview"]').selectOption('first-round-2026-11-19/F1');
  await page.waitForFunction(()=>document.querySelector('.pal-artwork-view[data-character-key="first-round-2026-11-19/F1"][data-expression="neutral"] img')?.complete);
  assert.equal(await page.locator('.pal-artwork-view').getAttribute('data-form'),'base');
  const hash=await page.locator('.pal-artwork-view').getAttribute('data-source-hash');
  assert.equal(hash,'f0d1f53e54dd47da4a658ea2252e9c8ab8c54eceb3ba9fff6c978eb9d1bb4e62','Navi corrected Base, not gemless source');
  await page.locator('[data-expression-choice="thinking"]').click();
  await page.waitForFunction(()=>document.querySelector('.pal-artwork-view[data-expression="thinking"] img')?.complete);
  await page.locator('select[aria-label="Pal form to preview"]').selectOption('mature');
  await page.waitForFunction(()=>document.querySelector('.pal-artwork-view[data-form="mature"][data-expression="neutral"] img')?.complete);
  const url=await page.locator('.pal-artwork-view img').first().getAttribute('src');
  assert.match(url,/jems-pals\/navi\/mature\/neutral-/);
  assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),true,'no phone horizontal overflow');
  await page.evaluate(()=>window.palExpressionFixture.updateOwner('family/player2'));
  assert.equal(await page.locator('.pal-expression-explorer').evaluate(el=>el.open),false,'switch owner closes the explorer');
  assert.equal(await page.locator('.pal-expression-panel').count(),0);
  assert.deepEqual(errors,[]);
  await ctx.close();
  console.log('PASS Pal expressions: 23 exact characters, Navi R2, both forms, owner reset, mobile, lazy loading');
 }finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
})().catch(error=>{console.error(error);process.exitCode=1;});
