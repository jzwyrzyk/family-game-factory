/* Synthetic world picture tests the local editor, playback and portable round trip. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,navigate}=require('./studio-entry.cjs');

(async()=>{
  const server=start(process.env.WORLD_BUILD || 'dist');
  if(!server.listening) await once(server,'listening');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce',acceptDownloads:true});
    page.setDefaultTimeout(15000);
    const errors=[],posts=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
    await page.route('**/factory-config.json',route=>route.fulfill({json:{version:1,mode:'unavailable'}}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');
    await exploreWelcome(page);
    await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
    const picture=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=340;canvas.height=230;
      const c=canvas.getContext('2d');
      c.fillStyle='#f6e6c1';c.fillRect(0,0,340,230);
      c.strokeStyle='#b96556';c.lineWidth=4;
      c.beginPath();c.arc(220,60,24,0,2*Math.PI);c.stroke();
      for(const [color,points] of [
        ['#589778',[[0,160],[70,75],[130,152],[180,121],[252,169],[286,139],[340,161]]],
        ['#427761',[[0,193],[51,159],[100,181],[185,150],[224,189],[285,170],[340,202]]],
      ]){
        c.strokeStyle=color;c.lineWidth=5;c.lineJoin='round';c.beginPath();c.moveTo(...points[0]);
        points.slice(1).forEach(p=>c.lineTo(...p));c.stroke();
      }
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#studioSavedIdeas').click();
    await page.setInputFiles('#drawingUpload',{name:'Pencil hills.png',mimeType:'image/png',buffer:Buffer.from(picture,'base64')});
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===1);
    await page.locator('#homeBtn').click();
    await navigate(page,'#studioNavScenes');
    await page.locator('#creationFreeMode').click();
    await page.locator('[data-creation-starter="dragon"]').click();
    const options=page.locator('#creationSceneOptions');
    const settings=async()=>{
      await page.locator('#creationWorkspace').waitFor();
      const tools=page.locator('#creationCharacterTools');
      if(await tools.isVisible() && await tools.getAttribute('aria-expanded')==='false')await tools.click();
      if(!await options.evaluate(el=>el.open))await options.locator(':scope > summary').click();
      // The open panel is positioned independently of its disclosure wrapper.
      // Wait for the child's actual control, which it must be possible to use.
      await page.locator('#creationBackground').waitFor();
    };
    fs.mkdirSync('test-results',{recursive:true});
    for (const key of ['forest','cloud','workshop','moon']) {
      await settings();
      const pin = 'world-'+key+'-v1';
      await page.locator('#creationBackground').selectOption(pin);
      await page.waitForFunction(pin => FG.creation.scene().world.assetId === pin, pin);
      await page.locator('#creationSettingsDone').click();
      await page.locator('#creationRun').click();
      await page.waitForFunction(()=>FG.creation.snapshot().status==='completed');
      // Compare the rendered canvas with the independently composed registered
      // images at positions away from the child-editable actors and text.
      const fraction = await page.evaluate(async key => {
        const stage=document.querySelector('#creationCanvas'), {width,height}=stage;
        const expected=document.createElement('canvas');expected.width=width;expected.height=height;
        const ctx=expected.getContext('2d');
        for(const layer of ['background','middle','foreground']){
          const img=new Image();img.src='./art/creative-worlds/v1/'+key+'-'+layer+'.webp';await img.decode();
          const scale=Math.max(width/img.width,height/img.height),w=img.width*scale,h=img.height*scale;
          ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
        }
        const a=stage.getContext('2d').getImageData(0,0,width,height).data,b=ctx.getImageData(0,0,width,height).data;
        let same=0,total=0;
        for(let i=0;i<a.length;i+=4*23){
          if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))<3) same++;
          total++;
        }
        return same/total;
      },key);
      assert.ok(fraction>.80, key+' matched '+fraction+' of independently composed stage samples');
      await page.locator('#creationCanvas').screenshot({path:'test-results/creative-painted-'+key+'.png'});
    }
    await page.locator('#creationAddActor').click();
    await page.locator('[data-creation-asset="world-prop-rover-v1"]').click();
    await page.waitForFunction(()=>FG.creation.scene().actors.some(a=>a.assetId==='world-prop-rover-v1'));
    await page.locator('#creationKeep').click();
    const paintedScene=await page.evaluate(()=>FG.creation.scene());
    await page.reload();
    await navigate(page,'#studioNavScenes');
    await page.locator('[data-scene="'+paintedScene.id+'"]').click();
    assert.deepEqual((await page.evaluate(()=>FG.creation.scene())).world,paintedScene.world);
    assert.equal((await page.evaluate(()=>FG.creation.scene())).actors.at(-1).assetId,'world-prop-rover-v1');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#creationPlayView').click();
    await page.locator('#creationRun').click();
    await page.waitForFunction(()=>FG.creation.snapshot().status==='completed');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'test-results/creative-painted-moon-phone.png'});
    await page.setViewportSize({width:1366,height:900});
    // Resume the existing private world journey on its own starting project.
    await page.locator('#creationBack').click();
    await page.locator('#creationFreeMode').click();
    await page.locator('[data-creation-starter="dragon"]').click();
    const initial=await page.evaluate(()=>FG.creation.scene());
    await settings();
    await page.locator('#creationBackground').selectOption({label:'Waterfall islands'});
    await page.waitForFunction(()=>FG.creation.scene()?.world?.assetId.startsWith('world-islands'));
    await page.locator('#creationSettingsDone').click();
    await page.locator('#creationRun').click();
    await page.waitForFunction(()=>FG.creation.snapshot().status==='completed');
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/creation-waterfall-islands.png'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#creationPlayView').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:'test-results/creation-waterfall-phone.png'});
    await page.setViewportSize({width:1366,height:900});
    await settings();
    await page.locator('#creationWorldFromArt').click();
    await page.locator('[data-world-art]').first().click();
    await page.waitForFunction(()=>FG.creation.scene()?.world?.assetId.startsWith('art:image:'));
    const own=await page.evaluate(()=>FG.creation.scene());
    assert.equal(own.world.framing,'fit');assert.deepEqual(own.actors,initial.actors);
    await settings();
    await page.locator('#creationWorldFraming').selectOption('fill');
    await page.waitForFunction(()=>FG.creation.scene().world.framing==='fill');
    await page.locator('#creationSettingsDone').click();
    await page.locator('#creationUndo').click();
    await page.waitForFunction(()=>FG.creation.scene().world.framing==='fit');
    await page.locator('#creationFullMode').click();
    await settings();
    await page.getByLabel('Picture layer').selectOption('1');
    await page.waitForFunction(id=>FG.creation.scene().actors.find(actor => actor.id === id).stackOrder === 1,own.actors[0].id);
    const reordered = await page.evaluate(()=>FG.creation.scene());
    assert.deepEqual(reordered.actors.map(actor=>actor.id), own.actors.map(actor=>actor.id));
    assert.deepEqual(reordered.programs,own.programs);
    await page.locator('#creationSettingsDone').click();
    await page.locator('#creationSimpleMode').click();
    await page.locator('#creationKeep').click();
    await page.screenshot({path:'test-results/creation-pencil-hills.png'});
    await page.locator('#creationMore summary').click();
    const downloadEvent=page.waitForEvent('download');
    await page.locator('#creationDownload').click();
    const bundle=JSON.parse(fs.readFileSync(await (await downloadEvent).path(),'utf8'));
    assert.equal(bundle.scene.world.assetId,own.world.assetId);
    assert.equal(bundle.art.drawings.length,1);
    assert.equal(bundle.art.drawings[0].sha256,own.world.assetId.split(':').at(-1));
    await page.reload();
    await navigate(page,'#studioNavScenes');
    await page.locator('[data-scene="'+own.id+'"]').click();
    assert.deepEqual((await page.evaluate(()=>FG.creation.scene())).world,own.world);
    await page.locator('#creationBack').click();
    const originalCount=await page.evaluate(()=>FG.creation.export().projects.length);
    const incomplete=structuredClone(bundle);
    incomplete.art.drawings=[];
    await page.setInputFiles('#creationImport',{name:'incomplete.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incomplete))});
    await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('Nothing was imported'));
    assert.equal(await page.evaluate(()=>FG.creation.export().projects.length),originalCount);
    await page.setInputFiles('#creationImport',{name:'my-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
    await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('scene and its artwork'));
    const imported=await page.evaluate(()=>FG.creation.scene());
    assert.notEqual(imported.world.assetId,own.world.assetId);
    assert.equal(imported.world.assetId.split(':').at(-1),own.world.assetId.split(':').at(-1));
    assert.equal(imported.world.framing,'fit');
    assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    console.log('World choice, artwork fit, undo, Keep, reopen, incomplete rejection and exact-art remap passed.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
