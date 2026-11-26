/* Synthetic generated companion supplied through the same adapter as the Studio response. */
const {chromium} = require('playwright');
const {once} = require('node:events');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {start} = require('../../tests/browser-server.cjs');
const {exploreWelcome} = require('../../tests/studio-entry.cjs');

const scene = {
  schema:'jems.creation.v1', id:'before-import', title:'Rock slide', width:800,height:450,background:'world-workshop-v1',
  actors:[{id:'runner',name:'Runner',assetId:'gem',x:280,y:240,size:112}],
  programs:[{id:'slide',actorId:'runner',trigger:{type:'start'},actions:[{id:'glide',type:'move',dx:175,durationMs:580}]}],
  variables:{},
};
async function run(){
  const server = start(process.env.CREATIVE_APP_DIST || 'dist'); await once(server,'listening');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1060,height:800},reducedMotion:'reduce'});
    const sent = [], errors = [];
    page.on('request',req=>{if(req.method()==='POST') sent.push(req.url());});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');
    await page.waitForFunction(()=>window.FG?.creation&&window.FG?.artStudio);
    await exploreWelcome(page);
    await page.evaluate(async()=>{
      FG.store.changeProfile({rate:1}); FG.store.current().mathWindow=[Date.now()]; FG.store.save();
      await FG.artStudio.open();
    });
    const bytes = await page.evaluate(()=>{
      const c=document.createElement('canvas'); c.width=100; c.height=74;
      const g=c.getContext('2d');g.fillStyle='#e7a5d4';g.strokeStyle='#4a3057';g.lineWidth=3;
      g.beginPath();for(const [x,y] of [[3,61],[15,33],[36,9],[62,7],[84,23],[95,54],[90,66],[63,62],[28,69]])g.lineTo(x,y);g.closePath();g.fill();g.stroke();
      for(const [x,y] of [[40,36],[62,35]]){g.beginPath();g.arc(x,y,3,0,2*Math.PI);g.fillStyle='#392042';g.fill();}
      g.beginPath();g.moveTo(43,45);g.quadraticCurveTo(52,56,63,43);g.stroke();
      return c.toDataURL().split(',')[1];
    });
    await page.setInputFiles('#artUpload',{name:'Practice rock.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.waitForFunction(()=>document.querySelector('#artDetailTitle')?.textContent?.includes('Practice rock'));
    const open = (bad=false)=>page.evaluate(async({scene,bad})=>{
      await FG.creation.fromStudio({id:'review-game',owner:bad?'different-player':FG.store.current().id,name:'Rock slide',game:'new',projectId:'fixture-game',remoteId:'fixture-r1'},undefined,scene);
    },{scene,bad});
    await assert.rejects(open(true),/own profile/);
    await open();const original=await page.evaluate(()=>FG.creation.scene());
    const control = page.locator('#creationGameActorArt');
    if (!await control.isVisible()) await page.locator('#creationCharacterTools').click();
    await control.click(); await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    assert.equal((await page.evaluate(()=>FG.creation.scene())).actors[0].assetId,'gem');
    await control.click();const option = page.getByRole('dialog').locator('[data-private-art]').first();
    const pin=await option.getAttribute('data-private-art');await option.click();
    await page.waitForFunction(pin=>FG.creation.scene().actors[0].assetId===pin,pin);
    const updated=await page.evaluate(()=>FG.creation.scene());
    assert.deepEqual(updated,{...original,actors:[{...original.actors[0],assetId:pin}]});
    await page.locator('#creationUndo').click();
    await page.waitForFunction(()=>FG.creation.scene().actors[0].assetId==='gem');
    await control.click();await page.getByRole('dialog').locator('[data-private-art]').first().click();
    await page.waitForFunction(pin=>FG.creation.scene().actors[0].assetId===pin,pin);
    await page.locator('#creationKeep').click();
    await page.locator('#creationRun').click();await page.waitForFunction(()=>FG.creation.snapshot()?.actors[0].x===455);
    await page.locator('#creationCanvas').screenshot({path:'test-results/creative-game-review/companion.png'});
    await page.reload();await page.waitForFunction(()=>window.FG?.creation);await open();
    assert.equal((await page.evaluate(()=>FG.creation.scene())).actors[0].assetId,pin);
    const revisions=await page.evaluate(id=>FG.creation.export().revisions.filter(r=>r.projectId===id),updated.id);
    assert.equal(revisions[0].scene.actors[0].assetId,'gem');
    assert.equal(revisions.at(-1).scene.actors[0].assetId,pin);
    assert.deepEqual(sent,[]);assert.deepEqual(errors,[]);
    console.log('PASS generated companion actor replacement, cancelled selection, undo, block movement, Keep, owner guard, history and reload; zero POSTs');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
fs.mkdirSync('test-results/creative-game-review',{recursive:true});
void run().catch(e=>{console.error(e);process.exitCode=1;});
