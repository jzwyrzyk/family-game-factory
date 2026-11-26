/* Synthetic fixture. Exercise the same owner-gated authoring surface used after an import. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');

(async()=>{
  const server=start(process.env.ANIMATION_DIST||'dist');
  if(!server.listening)await once(server,'listening');
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
    const output=process.env.ANIMATION_CAPTURES || 'test-results/connected-animation';
    fs.mkdirSync(output,{recursive:true});
    for(const [device,viewport] of [['desktop',{width:1280,height:850}],['phone',{width:390,height:844}]]){
      const context=await browser.newContext({viewport,hasTouch:device==='phone',reducedMotion:'reduce'});
      try{
        const page=await context.newPage();page.setDefaultTimeout(15000);
        const errors=[],posts=[];
        page.on('pageerror',err=>errors.push(String(err)));
        page.on('request',req=>{if(req.method()==='POST')posts.push(req.url());});
        await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
        await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?art=1');
        await page.locator('#page-art-studio').waitFor({state:'visible'});
        const image=await page.evaluate(()=>{
          const canvas=document.createElement('canvas');canvas.width=140;canvas.height=90;
          const c=canvas.getContext('2d');c.fillStyle='#83ca9c';c.strokeStyle='#304d40';c.lineWidth=3;
          c.beginPath();c.moveTo(5,64);c.lineTo(25,30);c.lineTo(62,10);c.lineTo(104,24);c.lineTo(134,64);c.lineTo(122,79);c.lineTo(29,81);c.closePath();c.fill();c.stroke();
          c.fillStyle='#304d40';c.fillRect(47,40,5,8);c.fillRect(84,41,5,8);
          c.beginPath();c.moveTo(61,55);c.quadraticCurveTo(69,63,77,52);c.stroke();
          return canvas.toDataURL('image/png').split(',')[1];
        });
        const original=Buffer.from(image,'base64');
        await page.setInputFiles('#artUpload',{name:'Mint rock.png',mimeType:'image/png',buffer:original});
        const open=page.locator('#artAnimatePath');await open.click();
        const dialog=page.locator('#artAnimationPath');await dialog.waitFor({state:'visible'});
        const button=name=>dialog.getByRole('button',{name,exact:true});
        const sprite=dialog.locator('.art-motion-sprite');
        assert.ok(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
        const cues=dialog.locator('[data-move] canvas[aria-hidden="true"]');
        assert.equal(await cues.count(),9);
        const glyphs=await cues.evaluateAll(items=>items.map(canvas=>canvas.toDataURL()));
        assert.equal(new Set(glyphs).size,9);
        for(const target of await dialog.locator('[data-move]').all()){
          const bounds=await target.boundingBox();assert.ok(bounds.height>=48 && bounds.width>=44);
        }
        const initial=await sprite.getAttribute('style');
        await button('Dance').focus();await dialog.getByLabel('Pace').selectOption('2400');
        await page.waitForTimeout(180);
        assert.equal(await sprite.getAttribute('style'),initial);
        assert.ok(await button('Pause').isDisabled(),'opening, focusing and adjusting pace keep artwork still');
        await button('Spin').click();await page.waitForFunction(()=>document.querySelector('.art-motion-sprite').style.transform.match(/rotate\((\d+(\.\d+)?)deg\)/)?.[1]>10);
        await button('Pause').click();
        const fixed=await sprite.getAttribute('style');await page.waitForTimeout(160);assert.equal(await sprite.getAttribute('style'),fixed);
        await button('Resume').click();await page.waitForFunction(previous=>document.querySelector('.art-motion-sprite').getAttribute('style')!==previous,fixed);
        assert.equal(await dialog.getByLabel('World').inputValue(),'world-forest-v1');
        await dialog.getByLabel('World').selectOption('world-cloud-v1');
        const planes=dialog.locator('.art-motion-stage img:visible');
        assert.equal(await planes.count(),3);
        await planes.evaluateAll(items=>Promise.all(items.map(img=>img.decode())));
        await button('Float').click();await button('Pause').click();
        await dialog.screenshot({path:path.join(output,'connected-animation-'+device+'.png')});
        await button('Path').click();
        assert.ok(await button('Save animation').isDisabled());
        await dialog.locator('summary').click();
        if(device==='phone'){
          await dialog.getByLabel('World').selectOption('world-forest-v1');
          for(const size of [{width:320,height:568},viewport,{width:820,height:1180},{width:1280,height:850}]){
            await page.setViewportSize(size);
            assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'expanded path controls fit at '+size.width);
            await dialog.getByLabel('World').scrollIntoViewIfNeeded();
            const selector=await dialog.getByLabel('World').boundingBox(),bounds=await dialog.boundingBox();
            assert.ok(selector.x>=bounds.x && selector.x+selector.width<=bounds.x+bounds.width+1);
            await dialog.locator('[data-save]').scrollIntoViewIfNeeded();
            const end=await dialog.locator('[data-save]').boundingBox();
            assert.ok(end.y>=0 && end.y+end.height<=size.height,'Save is reachable at '+size.width);
          }
          await page.setViewportSize(viewport);
          await dialog.getByLabel('World').selectOption('world-cloud-v1');
        }
        await button('Top left').click();await button('Middle').click();
        const stage=dialog.locator('[data-stage]'),box=await stage.boundingBox();
        await page.mouse.move(box.x+box.width*.25,box.y+box.height*.5);await page.mouse.down();
        await page.mouse.move(box.x+box.width*.8,box.y+box.height*.66,{steps:12});
        await stage.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
        await button('Bottom right').click();await button('Undo path').click();await button('Bottom left').click();
        await button('Save animation').click();await dialog.waitFor({state:'detached'});
        await page.waitForFunction(()=>document.querySelector('#artVersion')?.value);
        const first=await page.locator('#artVersion').inputValue();assert.ok(first);
        await open.click();assert.equal(await dialog.getByLabel('World').inputValue(),'world-cloud-v1');
        assert.equal(await dialog.getByLabel('Pace').inputValue(),'2400');
        assert.equal(await button('Path').getAttribute('aria-pressed'),'true');
        await button('Spin').click();await button('Save animation').click();await dialog.waitFor({state:'detached'});
        await page.waitForFunction(id=>document.querySelector('#artVersion')?.value && document.querySelector('#artVersion').value!==id,first);
        const second=await page.locator('#artVersion').inputValue();assert.ok(second && second!==first);
        await page.locator('#artLibraryHeading').scrollIntoViewIfNeeded();
        await page.locator('.art-library-more summary').click();
        const download=page.waitForEvent('download');await page.locator('#artExport').click();
        const file=await download,bundle=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
        const a=bundle.rigs.find(r=>r.id===first),b=bundle.rigs.find(r=>r.id===second);
        assert.deepEqual(a.assembly.motion.points,[{x:.17,y:.22},{x:.5,y:.5},{x:.17,y:.78}]);
        assert.equal(a.assembly.motion.sprite,'original');assert.equal(b.parentId,a.id);
        assert.equal(b.assembly.motion.move,'spin');
        assert.equal(bundle.drawings.length,1);assert.equal(bundle.drawings[0].sha256,require('node:crypto').createHash('sha256').update(original).digest('hex'));
        await open.click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('factory-page',{detail:'home'})));
        await dialog.waitFor({state:'detached'});
        await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?art=1');
        await page.locator('[data-art-id]').first().click();await open.click();await button('Spin').click();
        // The modal normally traps focus. Invoke the app's real profile-choice handler
        // to exercise the same lifecycle as a host-driven switch during playback.
        await page.locator('#profile-choices .profile-choice').nth(1).evaluate(b=>b.click());
        await page.waitForFunction(()=>FG.store.current().id==='player2');
        await dialog.waitFor({state:'detached'});
        await page.evaluate(()=>FG.artStudio.open());await page.locator('#artEmpty').waitFor({state:'visible'});
        assert.equal(await page.locator('[data-art-id]').count(),0);
        assert.equal(await page.locator('.art-motion-sprite').count(),0);
        assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
        console.log(device+' animation preview, pause/resume, canceled stroke, revision lineage, export and profile switch passed');
      }finally{await context.close();}
    }
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
