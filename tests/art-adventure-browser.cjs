const assert = require('node:assert/strict');
const {mkdirSync} = require('node:fs');
const {join} = require('node:path');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

async function drawTestStone(page, color) {
  const data = await page.evaluate(color => {
    const canvas = document.createElement('canvas'); canvas.width=210; canvas.height=140;
    const pen=canvas.getContext('2d');pen.lineWidth=7;pen.lineJoin='round';pen.strokeStyle='#3d3058';pen.fillStyle=color;
    pen.beginPath();pen.moveTo(17,112);pen.lineTo(24,88);pen.lineTo(44,68);pen.lineTo(56,47);pen.lineTo(89,30);pen.lineTo(109,32);pen.lineTo(128,24);pen.lineTo(155,42);pen.lineTo(167,65);pen.lineTo(182,80);pen.lineTo(197,109);pen.lineTo(178,118);pen.lineTo(136,116);pen.lineTo(110,121);pen.closePath();pen.fill();pen.stroke();
    pen.fillStyle='#3d3058';pen.beginPath();pen.arc(82,70,5,0,Math.PI*2);pen.arc(143,72,6,0,Math.PI*2);pen.fill();
    pen.beginPath();pen.moveTo(99,82);pen.quadraticCurveTo(112,100,127,84);pen.stroke();
    return canvas.toDataURL().split(',')[1];
  },color);
  return Buffer.from(data,'base64');
}

async function main() {
  const server=start(process.env.ART_TEST_DIST || 'dist');if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
  try {
    for(const [name,viewport] of [['desktop',{width:1320,height:930}],['tablet',{width:820,height:1180}]]) {
      const context=await browser.newContext({viewport,hasTouch:name==='tablet',reducedMotion:'reduce'});
      try {
        const page=await context.newPage(),posts=[],errors=[];
        page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
        page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
        await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
        await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?art=1');
        await page.locator('#artEmpty').waitFor();
        await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
        for(const [title,color] of [['Green stone','#80cb8c'],['Happy rock','#c6a0e2']]){
          await page.setInputFiles('#artUpload',{name:title+'.png',mimeType:'image/png',buffer:await drawTestStone(page,color)});
          await page.waitForFunction(title=>document.querySelector('[aria-label="Artwork name"]')?.value===title,title);
        }
        await page.locator('#artPictureHunt').click();
        await page.waitForFunction(()=>FG.creation.scene()?.actors[0].role==='collectible');
        const initial=await page.evaluate(()=>FG.creation.scene());
        await page.locator('#creationRun').click();
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors[0].speech==='Find me three times!');
        const canvas=page.locator('#creationCanvas');
        for(const count of [1,2,3]){
          const position=await page.evaluate(()=>{const state=FG.creation.snapshot().actors[0], rect=document.querySelector('#creationCanvas').getBoundingClientRect();return {x:state.x*rect.width/800,y:state.y*rect.height/450};});
          await canvas.click({position});
          await page.waitForFunction(count=>FG.creation.snapshot()?.variables.found===count,count);
        }
        assert.equal(await page.evaluate(()=>FG.creation.snapshot().actors[0].speech),'You found all three!');
        if(process.env.ART_EVIDENCE_DIR){
          mkdirSync(process.env.ART_EVIDENCE_DIR,{recursive:true});
          await canvas.screenshot({path:join(process.env.ART_EVIDENCE_DIR,'picture-hunt-'+name+'.png')});
        }
        if(await page.locator('#creationCodeView').isVisible())await page.locator('#creationCodeView').click();
        if(await page.locator('#creationCharacterTools').isVisible() && await page.locator('#creationCharacterTools').getAttribute('aria-expanded')==='false')await page.locator('#creationCharacterTools').click();
        await page.locator('#creationFullMode').click();
        await page.locator('#creationSceneOptions > summary').click();
        await page.getByLabel('Role here').selectOption('decoration');
        await page.waitForFunction(()=>FG.creation.scene()?.actors[0].role==='decoration');
        await page.locator('#creationChangePicture').click();
        const other=page.locator('#creationPrivateActorChoices [data-private-art]').filter({hasText:'Green stone'}).first();
        const greenPin=await other.getAttribute('data-private-art');await other.click();
        await page.waitForFunction(pin=>FG.creation.scene()?.actors[0].assetId===pin,greenPin);
        await page.locator('#creationKeep').click();
        const result=await page.evaluate(()=>({scene:FG.creation.scene(),data:FG.creation.export()}));
        assert.deepEqual(result.scene.programs,initial.programs);
        assert.equal(result.scene.actors[0].id,initial.actors[0].id);
        assert.equal(result.scene.actors[0].role,'decoration');
        assert.ok(result.data.revisions.some(r=>r.scene.actors[0].assetId===initial.actors[0].assetId));
        assert.ok(result.data.revisions.some(r=>r.scene.actors[0].assetId===greenPin));
        assert.equal(result.data.attempts.length,0);
        assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
        console.log('PASS '+name+' local picture hunt: three taps, payoff, explicit art replacement, Keep, exact old version and unchanged scripts.');
      }finally{await context.close();}
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
