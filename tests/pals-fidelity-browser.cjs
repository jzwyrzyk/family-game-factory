/* Pixel/variant acceptance for approved Pal rendering. No provider or earned-state writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild'),{chromium}=require('playwright');
const {start}=require('./browser-server.cjs'),{exploreWelcome}=require('./studio-entry.cjs');
const out='test-results/pal-fidelity',offline=process.argv.includes('--offline');fs.mkdirSync(out,{recursive:true});
// Read the mask as pixels rather than treating a successful image load as proof.
async function pixels(image){return image.evaluate(async img=>{
 const url=getComputedStyle(img).maskImage;let source=img;
 if(url!=='none'){source=new Image();source.src=url.slice(5,-2);await source.decode();}
 const canvas=document.createElement('canvas');canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;const c=canvas.getContext('2d');c.drawImage(source,0,0);const d=c.getImageData(0,0,canvas.width,canvas.height).data;
 const edge=[];for(let x=0;x<canvas.width;x++)edge.push(x,(canvas.height-1)*canvas.width+x);for(let y=1;y<canvas.height-1;y++)edge.push(y*canvas.width,y*canvas.width+canvas.width-1);
 // Independent visual landmarks: negative space versus intentional pale anatomy.
 const anchors=[];const checks=[
  [/brim\/mature\//,[[.45,.42,0],[.465,.607,255]]],
  [/poff\/mature\//,[[.46,.79,0],[.497,.32,255]]],
  [/pleeko\/mature\//,[[.5,.75,0],[.69,.167,255]]],
  [/tessit\/mature\/neutral-/,[[.467,.648,0],[.474,.281,255]]],
 ];
 for(const [pattern,points]of checks)if(pattern.test(img.getAttribute('src')))for(const [x,y,want]of points)anchors.push({x,y,want,alpha:d[(Math.floor(y*canvas.height)*canvas.width+Math.floor(x*canvas.width))*4+3]});
 let opaque=0;for(let i=3;i<d.length;i+=4)if(d[i]>240)opaque++;
 return {anchors,path:img.getAttribute('src'),presentation:img.dataset.palPresentation,borderClear:edge.filter(i=>d[i*4+3]<10).length/edge.length,opaque:opaque/(canvas.width*canvas.height),mask:url!=='none',fit:getComputedStyle(img).objectFit,visibility:getComputedStyle(img).visibility};
 });}
async function screenshotPixel(page,buffer,x,y){return page.evaluate(async({src,x,y})=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return [...ctx.getImageData(x,y,1,1).data];},{src:'data:image/png;base64,'+buffer.toString('base64'),x,y});}
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});const results=[];
 try{
  if(!offline&&!process.env.PAL_FIDELITY_JOURNEYS_ONLY){
   const fixture=await build({stdin:{contents:`import {PAL_CATALOG,palArtworkPath} from './src/pals/catalog';import {createPalPortrait} from './src/pals/ui';window.audit={catalog:PAL_CATALOG,create:createPalPortrait,path:palArtworkPath};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,outfile:'audit.js',format:'iife'});
   const context=await browser.newContext({viewport:{width:1200,height:1000}}),page=await context.newPage();await page.route('**/pal-audit',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><base href="/arcade/"></head><body></body></html>'}));await page.goto('http://127.0.0.1:'+server.address().port+'/pal-audit');await page.addStyleTag({content:fixture.outputFiles.find(f=>f.path.endsWith('.css')).text+'body{margin:0;background:#fff}#grid{display:grid;grid-template-columns:repeat(6,200px)}.sample{background:#173448;padding:8px;color:white;font:13px sans-serif}.sample .pals-portrait{width:168px;height:160px}.sample:nth-child(even){background:#75bfa8}.sample p{margin:4px 0}'});await page.addScriptTag({content:fixture.outputFiles.find(f=>f.path.endsWith('.js')).text});
   const variants=await page.evaluate(()=>audit.catalog.flatMap(p=>['base','mature'].flatMap(form=>Object.entries(p.artwork.expressions[form]).map(([expression,url])=>({id:p.id,name:p.name,form,expression,url})))));
   assert.equal(variants.length,170,'168 original approved states and two Brio neutrals; no unapproved expressions');
   for(let offset=0;offset<variants.length;offset+=24){const batch=variants.slice(offset,offset+24);
    await page.evaluate(batch=>{document.querySelector('#grid')?.remove();const grid=document.createElement('div');grid.id='grid';document.body.append(grid);for(const [i,v]of batch.entries()){const sample=document.createElement('section');sample.className='sample';sample.id='sample-'+i;sample.append(audit.create(v.id,v.form==='mature'?2:1,'',v.expression,true));const label=document.createElement('p');label.textContent=v.name+' / '+v.form+' / '+v.expression;sample.append(label);grid.append(sample);}},batch);
    await page.waitForFunction(()=>[...document.querySelectorAll('#grid .pals-portrait')].every(p=>p.dataset.state==='ready'),undefined,{timeout:30000});
    for(let i=0;i<batch.length;i++){const sample=page.locator('#sample-'+i),img=sample.locator('img'),r=await pixels(img);assert.ok(r.path.endsWith(batch[i].url),'exact approved variant '+batch[i].url);assert.ok(r.borderClear>.75,`opaque rectangle: ${batch[i].url}: ${JSON.stringify(r)}`);assert.ok(r.opaque>.01&&r.opaque<.8,'character is neither erased nor a filled rectangle');assert.equal(r.fit,'contain');assert.equal(r.visibility,'visible');for(const point of r.anchors)assert.equal(point.alpha,point.want,`${batch[i].url} landmark ${JSON.stringify(point)}`);
     // A real CSS-composited pixel at the image corner must expose the colored card.
     const png=await img.screenshot();for(const x of [1,Math.floor((await img.boundingBox()).width)-2]){const color=await screenshotPixel(page,png,x,1);assert.deepEqual(color.slice(0,3),i%2?[117,191,168]:[23,52,72],'rendered upper corners expose the real background; intentional ground/props may reach lower edges');}results.push({...batch[i],...r});
    }
    await page.locator('#grid').screenshot({path:`${out}/approved-variants-${offset/24+1}.png`});
   }
   // A blocked preparation must never flash an opaque source or replace its identity.
   await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(){throw Error('fixture canvas unavailable')};const p=audit.create('navi',1,'','neutral',true);p.id='failed-mask';document.body.append(p);window.restoreCanvas=()=>{HTMLCanvasElement.prototype.getContext=original;};});
   await page.waitForFunction(()=>document.getElementById('failed-mask').dataset.state==='unavailable');assert.equal(await page.locator('#failed-mask img').isVisible(),false);await page.evaluate(()=>restoreCanvas());await context.close();
  }
  for(const [name,width,height]of [['desktop',1440,1000],['landscape',1180,820],['portrait',820,1180],['phone',390,844]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<1200,reducedMotion:'reduce'}),page=await context.newPage();const errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});let app=page;
   if(offline){const artifact=path.resolve(process.env.UI_REVIEW_FILE||'dist-review/jems-ui-review.html');if(process.env.UI_REVIEW_INLINE_HARNESS==='1'){await page.route('http://localhost:43199/',r=>r.fulfill({contentType:'text/html',path:artifact}));await page.goto('http://localhost:43199/',{timeout:120000});}else await page.goto('file://'+artifact,{timeout:120000});await page.waitForFunction(()=>document.querySelector('#loading').hidden);await page.selectOption('#scenario','empty');await page.waitForTimeout(1500);app=page.frames().find(f=>f.parentFrame()===page.mainFrame());await app.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');await page.selectOption('#destination','journey');await page.waitForTimeout(400);await page.click('#hide');}
   else{await page.route('**/factory-config.json',r=>r.fulfill({contentType:'application/json',body:'{"version":1,"mode":"unavailable"}'}));await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');await page.waitForFunction(()=>!!window.FG?.studio);await exploreWelcome(page);await page.locator('#studioJourneyTile').click();}
   const capture=async state=>{const card=app.locator('#studioPalsEntry');await card.scrollIntoViewIfNeeded();await app.waitForFunction(()=>document.querySelector('#studioPalsEntry .pals-portrait')?.dataset.state==='ready');const img=card.locator('img'),r=await pixels(img);assert.ok(r.borderClear>.75,`${name} ${state} transparent border`);assert.equal(r.visibility,'visible');const box=await card.boundingBox();if(width<640)assert.ok(box.height<230,`phone card keeps compact proportions: ${box.height}`);assert.ok((await card.boundingBox()).height>=48);await card.screenshot({path:`${out}/${offline?'offline':'app'}-${name}-${state}-card.png`});await app.locator('.jems-world-overview').screenshot({path:`${out}/${offline?'offline':'app'}-${name}-${state}-overview.png`});return {name,state,...r,height:box.height};};
   await require('./secondary-page-headers.cjs').checkSecondaryHeaders({page,app,out,name,width,height,offline});
   results.push(await capture('starter'));
   const cards=app.locator('.jems-world-overview > button');
   assert.deepEqual(await cards.locator('strong').allTextContents(),['My Gems','My Pals','My Powers']);
   const boxes=await cards.evaluateAll(nodes=>nodes.map(node=>{
    const {width,height,x,y}=node.getBoundingClientRect();
    return {width,height,x,y,padding:getComputedStyle(node).padding,radius:getComputedStyle(node).borderRadius};
   }));
   for(const box of boxes){
    assert.ok(Math.abs(box.width-boxes[0].width)<=1);
    assert.equal(box.height,boxes[0].height);assert.ok(box.height>=48);
    assert.equal(box.padding,boxes[0].padding);assert.equal(box.radius,boxes[0].radius);
    if(!offline)assert.equal(width>680?box.y:box.x,width>680?boxes[0].y:boxes[0].x);
   }
   if(!offline){
    await app.locator('.jems-world-overview').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.screenshot({path:`${out}/dashboard-${name}.png`});
    for(const [button,destination] of [['jemsRewardsWidget','page-jems-rewards'],['journeyPowers','page-lab']]){
     await app.locator('#'+button).focus();await page.keyboard.press('Enter');
     await app.locator('#'+destination).waitFor({state:'visible'});
     if(destination==='page-lab' && await app.evaluate(()=>FG.learning.active)){
      // Leaving optional practice uses the existing My Games exit.
      await app.locator('#studioNavHome').click();
      await app.locator('#studioJourneyTile').click();
     }else await app.locator('#'+destination+' [data-journey-section="overview"]').click();
    }
   }
   if(offline){await page.click('#return');await page.selectOption('#scenario','unlocked');await page.waitForTimeout(1500);app=page.frames().find(f=>f.parentFrame()===page.mainFrame());await app.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');await page.selectOption('#destination','journey');await page.waitForTimeout(400);await page.click('#hide');}
   else{await app.locator('#studioPalsEntry').first().click();const starter=name==='portrait'?'kip':'navi';assert.equal(await app.locator('.pals-starter-grid [data-pals-focus^="starter-"]').count(),2);await app.locator('[data-pals-focus="starter-'+starter+'"]').click();await app.waitForFunction(id=>FG.pals.view()?.activeId===id,starter);await app.locator('.page:not(.hidden) [data-journey-section="overview"]').click();}
   const before=await app.evaluate(()=>JSON.stringify(FG.pals.view()));results.push(await capture('equipped'));assert.equal(await app.evaluate(()=>JSON.stringify(FG.pals.view())),before,'presentation does not mutate Pal progress');if(!offline && name==='desktop'){
    await page.reload();await exploreWelcome(page);await page.locator('#studioJourneyTile').click();
    await page.locator('#studioPalsEntry').click();
    await page.waitForFunction(()=>document.activeElement.id==='jemsPalsTitle' && getComputedStyle(document.activeElement).outlineStyle==='none');
    assert.equal(await page.evaluate(()=>JSON.stringify(FG.pals.view())),before,'refresh preserves the equipped starter and progression');
   }
   assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);await context.close();console.log('PASS Pal fidelity '+(offline?'offline ':'app ')+name);
  }
  fs.writeFileSync(`${out}/${offline?'offline':'app'}-results.json`,JSON.stringify(results,null,2));console.log('PASS exact Pal variants, transparent pixels, fail-closed presentation and responsive cards');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
