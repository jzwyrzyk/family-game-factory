const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1024}});
    const errors=[],outbound=[];
    page.on('pageerror',error=>errors.push(error.message));
    const local='http://localhost:43199/';
    page.on('request',request=>{if(/^https?:/.test(request.url())&&request.url()!==local)outbound.push(request.url());});
    const artifact=path.resolve('dist-review/jems-ui-review.html');
    if(process.env.UI_REVIEW_INLINE_HARNESS==='1'){
      await page.route(local,route=>route.fulfill({contentType:'text/html',path:artifact}));
      await page.goto(local);
    }else await page.goto('file://'+artifact);
    await page.waitForFunction(()=>document.querySelector('#loading').hidden);
    await page.selectOption('#scenario','populated');
    await page.waitForFunction(()=>document.querySelector('#loading').hidden);
    await page.selectOption('#destination','creative-picker');
    const frame=page.frameLocator('iframe').first();
    const picker=frame.getByRole('dialog',{name:'Choose artwork'});
    await picker.waitFor();
    for(const name of ['My Rock','Clover Cat','Rocket Bus','My Hill World'])await picker.getByRole('button',{name:new RegExp(name)}).waitFor();
    await picker.getByRole('button',{name:/My Rock/}).click();
    await frame.getByRole('button',{name:'Keep drawing',exact:true}).waitFor();
    await frame.locator('#artPictureHunt').click();
    await frame.locator('#creationRun').waitFor();
    const app=page.frames().find(f=>f.parentFrame()===page.mainFrame());
    const scene=await app.evaluate(()=>FG.creation.scene());
    assert.equal(scene.actors[0].name,'My Rock');assert.equal(scene.actors[0].role,'collectible');
    assert.match(scene.actors[0].assetId,/^art:image:/);
    assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
    console.log('PASS standalone picker: four editable fixtures, exact rock pin, local hunt, zero external requests');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
