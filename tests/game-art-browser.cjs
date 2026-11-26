const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createHash}=require('node:crypto');
const {start}=require('./browser-server.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function main(){
 const build='test-results/game-art-build';
 const evidence=process.env.ART_TEST_EVIDENCE||'test-results/game-art-evidence';
 fs.mkdirSync(evidence,{recursive:true});
 const server=start(build);
 await new Promise(ok=>server.listening?ok():server.once('listening',ok));
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1080,height:900}}),page=await context.newPage();
  page.setDefaultTimeout(10000);const errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
    const req=route.request();
    if(!req.url().startsWith(base)||req.method()!=='GET'){unexpected.push([req.method(),req.url()]);return route.abort();}
    if(req.url().endsWith('/factory-config.json'))return route.fulfill({json:{version:1,mode:'unavailable'}});
    return route.continue();
  });
  await page.goto(base+'?art=1');await page.locator('#artUploadButton').waitFor();
  const choose=async(name,role,upload=true)=>{
    if(upload)await page.setInputFiles('#artUpload',{name:name+'.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(__dirname,'game-art',name+'.png'))});
    else await page.locator('#artGrid .art-card').filter({has:page.getByText(name,{exact:true})}).click();
    await page.waitForFunction(name=>document.querySelector('#artDetailTitle')?.textContent===name,name);
    await page.selectOption('#artGameRole',role);if(role==='collectible')await page.getByPlaceholder('My idea (optional)').fill('Give me one point');await page.click('#artPlanGame');
    await page.locator('#studioArtPlan').waitFor().catch(async error=>{console.error(await page.locator('main .page:not(.hidden)').innerText(),errors);throw error;});await page.waitForFunction(role=>window.FG.studio.exportNotebook().sessions.some(s=>s.gameArt?.pins.some(p=>p.role===role)),role);
  };
  const picker=async()=>{
    const more=page.locator('#studioExtraTools').locator('..');if(!await page.locator('#studioUseDrawing').isVisible())await more.locator(':scope > summary').click();
    await page.click('#studioUseDrawing');await page.locator('#artUploadButton').waitFor();
  };
  const session=()=>page.evaluate(()=>window.FG.studio.exportNotebook().sessions.find(s=>s.gameArt));
  await choose('rocket','player');
  for(const [name,role,upload] of [['rock','collectible',true],['rock','obstacle',false],['dragon','character',true],['world','background',true]]){
    await picker();await choose(name,role,upload);
  }
  const initial=await session();
  assert.equal(initial.gameArt.pins.find(p=>p.role==='collectible').intent,'Give me one point');
  await page.setViewportSize({width:390,height:844});await page.locator('#studioArtPlan').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Phone plan fits the viewport');
  await page.locator('#studioArtPlan').screenshot({path:path.join(evidence,'phone-game-pictures.png')});
  await page.setViewportSize({width:1080,height:900});
  assert.equal(initial.gameArt.pins.length,5);assert.equal(initial.gameArt.pins[1].drawingId,initial.gameArt.pins[2].drawingId);
  for(const pin of initial.gameArt.pins)assert.equal(pin.sha256,sha(fs.readFileSync(path.join(__dirname,'game-art',pin.name+'.png'))));
  assert.ok(await page.locator('#studioSend').isDisabled());
  const play=async(label)=>{
    await page.getByRole('button',{name:label,exact:true}).click();
    const frame=page.frameLocator('.game-art-review iframe');await frame.locator('#game[data-assets-ready=true]').waitFor();
    await frame.locator('#start').click();await frame.locator('#game[data-frames]').waitFor();
    return frame;
  };
  let frame=await play('Try art in a sample game');
  const canvas=frame.locator('#game');
  assert.equal(await canvas.evaluate(c=>{try{return !!parent.document.body;}catch{return false;}}),false);
  assert.equal(await canvas.evaluate(c=>c.closest('html').querySelector('meta[http-equiv]').content.includes("connect-src 'none'")),true);
  const reference=await page.evaluate(async pngs=>{
    const c=document.createElement('canvas');c.width=720;c.height=400;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    for(const [name,x,y,w] of [['world',360,200,720],['dragon',620,225,100],['rock',440,240,83],['rock',245,240,50],['rocket',85,240,65]]){
      const img=new Image();img.src='data:image/png;base64,'+pngs[name];await img.decode();const h=w*img.height/img.width;
      g.save();g.translate(x,y);g.drawImage(img,-w/2,-h/2,w,h);g.restore();
    }
    return c.toDataURL();
  },Object.fromEntries(['world','rocket','rock','dragon'].map(name=>[name,fs.readFileSync('tests/game-art/'+name+'.png').toString('base64')])));
  assert.equal(await canvas.evaluate(c=>c.toDataURL()).then(data=>sha(data)),sha(reference),'Every game canvas pixel matches a direct composite of the selected originals');
  const sample=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(100,12,1,1).data));
  assert.deepEqual(await sample(),[198,226,237,255],'The selected background contributes actual canvas pixels');
  await canvas.screenshot({path:path.join(evidence,'valley-first-round.png')});
  const hold=async(key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
  await hold('ArrowRight',2350);await frame.getByText('Score: 1',{exact:true}).waitFor();
  assert.equal(await frame.locator('#status').getAttribute('data-state'),'playing','the larger rock blocks travel');
  await hold('ArrowUp',650);await hold('ArrowRight',1600);await frame.getByText('You did it!',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Keep this art test'}).click();
  await page.getByText('This art test is kept.',{exact:true}).waitFor();await page.getByRole('button',{name:'Back to my idea',exact:true}).click();
  const kept=(await session()).gameArt;assert.equal(kept.kept,kept.tests[0].id);
  frame=await play('Try faster flight');await hold('ArrowUp',370);await hold('ArrowRight',420);await frame.locator('#game').screenshot({path:path.join(evidence,'valley-improved-round.png')});
  const improved=(await session()).gameArt;
  assert.deepEqual(improved.tests[1].pins,kept.tests[0].pins);assert.equal(improved.tests[1].parent,kept.kept);assert.notEqual(improved.tests[1].program,kept.tests[0].program);assert.equal(improved.kept,kept.kept);
  await page.getByRole('button',{name:'Back to my idea',exact:true}).click();
  await page.reload();await page.waitForFunction(()=>window.FG?.studio);await page.evaluate(id=>window.FG.studio.open(id),initial.id);
  await play('Play art test 1 · kept');await page.getByRole('button',{name:'Back to my idea',exact:true}).click();
  assert.deepEqual((await session()).gameArt,improved);
  // One more game uses the actual approved illustrated environment.
  await page.evaluate(()=>FG.studio.home());await page.locator('#studioArt').click();
  await choose('rocket','player',false);
  frame=await play('Try art in a sample game');await frame.locator('#game').screenshot({path:path.join(evidence,'workshop-rocket.png')});
  await page.evaluate(()=>dispatchEvent(new Event('factory-profile-changing')));
  assert.equal(await page.locator('.game-art-review iframe').count(),0,'Profile change destroys the opaque review frame');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('PASS My Art, Invent, five pins, collectible/obstacle physics, win, explicit Keep, improvement, reload and exact earlier replay. No remote requests.');
 }finally{await browser.close();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
