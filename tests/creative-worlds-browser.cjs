/* Run against a local production build. Every drawing in this journey is synthetic. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');

(async()=>{
  const server=start(process.env.JEMS_TEST_DIST||'dist');
  await once(server,'listening');
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    page.setDefaultTimeout(12000);
    const output=process.env.JEMS_WORLD_EVIDENCE||'test-results/creative-worlds';
    const shot=async(group,name,locator=page)=>{
      fs.mkdirSync(path.join(output,group),{recursive:true});
      await locator.screenshot({path:path.join(output,group,name+'.png')});
    };
    const errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
    await page.route('**/factory-config.json',route=>route.fulfill({json:{version:1,mode:'unavailable'}}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?creation=1');
    await page.locator('#creationIntroSkip').click();
    await page.locator('#creationFreeMode').click();
    await page.locator('[data-creation-starter=dragon]').click();
    await page.locator('#creationCanvas').waitFor();
    await page.waitForFunction(()=>FG.creation.scene()?.world?.backdrop==='world-forest-v1');
    // Wait for the illustration to reach the actual stage canvas.
    async function illustrated(){
      await page.waitForFunction(()=>{
        const c=document.querySelector('#creationCanvas'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        const colors=new Set();for(let i=0;i<pixels.length;i+=104)colors.add(pixels[i]*65536+pixels[i+1]*256+pixels[i+2]);
        return colors.size>800;
      });
    }
    await illustrated();await shot('B','enchanted-gem-forest',page.locator('.creation-stage-card'));
    await page.locator('#creationEditWorld').click();
    const dialog=page.getByRole('dialog',{name:'Make your world'});
    await dialog.locator('[data-backdrop-id="world-moon-v1"]').click();
    await page.waitForFunction(()=>FG.creation.scene().world.backdrop==='world-moon-v1');
    const stageCanvas=page.locator('#creationCanvas');
    const hashCanvas=()=>stageCanvas.evaluate(c=>c.toDataURL());
    await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(r=>/moon-(background|middle|foreground).webp$/.test(r.name)).length>=3);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const moon=await hashCanvas();
    await dialog.locator('[data-layer=foreground]').uncheck();
    await page.waitForFunction(()=>FG.creation.scene().world.foreground===false);
    assert.notEqual(await hashCanvas(),moon,'The foreground checkbox changes painted pixels.');
    await dialog.locator('[data-layer=foreground]').check();
    await page.waitForFunction(()=>FG.creation.scene().world.foreground===true);
    await dialog.locator('[data-done]').click();
    await illustrated();await shot('B','moon-adventure',page.locator('.creation-stage-card'));
    await page.locator('#creationEditWorld').click();
    await dialog.locator('[data-backdrop-id="world-cloud-v1"]').click();
    await page.waitForFunction(()=>FG.creation.scene().world.backdrop==='world-cloud-v1');
    await dialog.locator('[data-prop-collection]').selectOption('world-workshop-v1');
    assert.equal(await dialog.locator('[data-props] button').count(),8);
    await dialog.locator('[data-prop-collection]').selectOption('world-cloud-v1');
    await dialog.locator('[data-prop-id="world-prop-balloon-v1"]').click();
    await page.waitForFunction(()=>FG.creation.scene().world.decorations.length===1);
    await dialog.locator('[data-field=x]').focus();await page.keyboard.press('Home');
    await page.waitForFunction(()=>FG.creation.scene().world.decorations[0].x===0);
    await dialog.locator('canvas').click({position:{x:100,y:100}});
    await page.waitForFunction(()=>FG.creation.scene().world.decorations[0].x>0);
    await dialog.locator('[data-plane]').selectOption('front');
    await page.waitForFunction(()=>FG.creation.scene().world.decorations[0].plane==='front');
    await dialog.locator('[data-private-prop]').click();
    await dialog.getByRole('button',{name:'Draw or add a picture'}).click();
    const upload=page.getByRole('dialog',{name:'Add my art'});
    const chooser=page.waitForEvent('filechooser');
    await upload.getByRole('button',{name:'Upload a drawing'}).click();
    const original=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=130;c.height=90;const ctx=c.getContext('2d');
      ctx.fillStyle='#74468f';ctx.strokeStyle='#33214d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(8,74);ctx.lineTo(24,36);ctx.lineTo(60,16);ctx.lineTo(94,20);ctx.lineTo(119,65);ctx.lineTo(103,76);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff';ctx.fillRect(46,40,7,7);ctx.fillRect(74,42,7,7);return c.toDataURL().split(',')[1];
    });
    await (await chooser).setFiles({name:'My purple rock.png',mimeType:'image/png',buffer:Buffer.from(original,'base64')});
    await page.waitForFunction(()=>FG.creation.scene().world.decorations.length===2);
    const rock=await page.evaluate(()=>FG.creation.scene().world.decorations[1]);
    assert.match(rock.assetId,/^art:image:/);
    const originalHash=require('node:crypto').createHash('sha256').update(Buffer.from(original,'base64')).digest('hex');
    assert.ok(rock.assetId.endsWith(originalHash));
    await shot('F','world-editor',dialog);
    await dialog.locator('[data-done]').click();
    await illustrated();await shot('B','cloud-kingdom',page.locator('.creation-stage-card'));
    await page.locator('#creationKeep').click();
    const first=await page.evaluate(()=>FG.creation.scene());
    await page.locator('#creationBack').click();await page.locator('#creationFreeMode').click();await page.locator('[data-creation-starter=robot]').click();
    await illustrated();await shot('B','inventors-workshop',page.locator('.creation-stage-card'));
    await page.locator('#creationEditWorld').click();await dialog.locator('[data-saved]').click();
    await dialog.getByRole('button',{name:first.title,exact:true}).click();
    await page.waitForFunction(id=>FG.creation.scene().world.decorations[1]?.assetId===id,rock.assetId);
    // Keep the thumbnail's load callback pending, so each exit must release
    // the object URL itself. Only this synthetic world's thumbnails are held.
    await page.evaluate(()=>{
      window.heldWorldPreviews=new Set();
      document.addEventListener('load',event=>{
        const image=event.target;
        if(image instanceof HTMLImageElement && image.closest('.creation-world-dialog .creative-picker') && image.src.startsWith('blob:')){
          event.stopImmediatePropagation();window.heldWorldPreviews.add(image.src);
        }
      },true);
      const revoke=URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL=url=>{window.heldWorldPreviews.delete(url);revoke(url);};
    });
    await dialog.locator('[data-private-prop]').click();
    await page.waitForFunction(()=>window.heldWorldPreviews.size>0);
    await dialog.locator('[data-saved]').click();
    await page.waitForFunction(()=>window.heldWorldPreviews.size===0);
    await dialog.locator('[data-private-prop]').click();
    await page.waitForFunction(()=>window.heldWorldPreviews.size>0);
    await dialog.locator('[data-done]').click();
    await page.waitForFunction(()=>window.heldWorldPreviews.size===0);
    await page.locator('#creationEditWorld').click();
    await dialog.locator('[data-backdrop]').click();
    await page.waitForFunction(()=>window.heldWorldPreviews.size>0);
    await dialog.locator('[data-private-art]').first().click();
    await page.waitForFunction(id=>FG.creation.scene().world.backdrop===id,rock.assetId);
    await page.waitForFunction(()=>window.heldWorldPreviews.size===0);
    assert.equal(await page.evaluate(()=>FG.creation.scene().world.fit),'contain');
    await shot('F','my-art-backdrop',dialog);
    await dialog.locator('[data-done]').click();
    await page.locator('#creationUndo').click();
    await page.waitForFunction(()=>FG.creation.scene().world.backdrop==='world-cloud-v1');
    const openMore=async()=>{if(!await page.locator('#creationMore').evaluate(el=>el.open))await page.locator('#creationMore summary').click();};
    await openMore();
    await page.locator('#creationRedo').click();
    await page.waitForFunction(id=>FG.creation.scene().world.backdrop===id,rock.assetId);
    await page.locator('#creationKeep').click();
    await openMore();
    const download=page.waitForEvent('download');
    await page.locator('#creationDownload').click();
    const bundle=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
    assert.equal(bundle.schema,'jems.scene-art.v1');
    assert.equal(bundle.art.drawings.length,1,'One original supplies both placement and backdrop.');
    assert.equal(bundle.art.drawings[0].sha256,originalHash);
    assert.equal(bundle.scene.world.backdrop,rock.assetId);
    assert.equal(bundle.scene.world.decorations[1].assetId,rock.assetId);
    await page.locator('#creationMore summary').click();
    const retained=await page.evaluate(()=>FG.creation.export());
    assert.ok(retained.revisions.some(rev=>rev.scene.id===first.id&&JSON.stringify(rev.scene.world)===JSON.stringify(first.world)));
    assert.ok(retained.revisions.some(rev=>rev.scene.world?.backdrop===rock.assetId));
    await page.locator('#creationBack').click();
    await page.locator('[data-scene]').filter({hasText:first.title}).first().click();
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().world),first.world);
    await page.locator('#creationSceneOptions > summary').click();
    const classicPixels=new Set();
    for(const classic of ['sky','workshop','meadow','night']){
      await page.locator('#creationBackground').selectOption(classic);
      await page.waitForFunction(name=>FG.creation.scene()?.world.backdrop==='world:classic-'+name+':v1',classic);
      classicPixels.add(await hashCanvas());
      assert.deepEqual(await page.evaluate(()=>FG.creation.scene().world.decorations),first.world.decorations);
    }
    assert.equal(classicPixels.size,4,'Each retained backdrop draws its own artwork and keeps the placements.');
    await page.locator('#creationSceneOptions > summary').click();
    await page.setViewportSize({width:390,height:844});await page.locator('#creationPlayView').click();
    await page.locator('#creationEditWorld').click();await dialog.locator('[data-private-prop]').click();
    await shot('F','world-picker-phone');
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    console.log('PASS: illustrated stage, keyboard and touch placement, layers, upload and exact hash, world reuse, private backdrop, retained scene, phone layout, zero POSTs.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
