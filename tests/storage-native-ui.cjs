/* Built application acceptance for the explicitly selected storage-preview. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{build}=require('esbuild'),{chromium,webkit}=require('playwright');
const {start}=require('./browser-server.cjs');
(async()=>{
 const directory=process.env.STUDIO_BUILD_DIR||'test-results/storage-preview';if(!fs.existsSync(directory+'/index.html'))throw Error('Build with vite build --mode storage-preview --outDir test-results/storage-preview first.');
 const fixture=await build({stdin:{contents:`export * from './src/factory/workspace';export * from './src/runtime/manifests';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'nativeFixture',platform:'browser'});
 const server=start(directory);await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));let browser,engine;
 try{engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;browser=await engine.launch({...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});
  for(const [name,viewport]of [['desktop',{width:1280,height:900}],['tablet',{width:820,height:1180}]]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
   await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await page.addScriptTag({content:fixture.outputFiles[0].text});
   const seeded=await page.evaluate(()=>{const store=new nativeFixture.RevisionStore(localStorage),owner=FG.store.current().id;let first;
    for(let i=0;i<30;i++){const project=store.create(owner,i===1?'dragon':'buckets','Saved game '+String(i).padStart(2,'0'));if(i===0){first=project;let head=project.headId;for(let j=0;j<125;j++)head=store.commit(project.id,owner,nativeFixture.defaults('buckets'),'Saved edition '+j,'',undefined,head).id;}}
    FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();return {first:first.id,raw:localStorage.getItem(nativeFixture.WORKSPACE_KEY)};
   });
   await page.reload();await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);assert.equal(await page.evaluate(()=>FG.factory.indexedStoragePreview),true);await page.evaluate(()=>FG.factory.prepareIndexedWorkspace());
   await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();await page.locator('#liveMoreGames').click();await page.waitForFunction(()=>document.querySelectorAll('#savedRemixes button').length===30);assert.equal(await page.locator('#savedRemixes button').count(),30);
   await page.getByRole('button',{name:'Saved game 29',exact:true}).click();await page.locator('#livePlay').click();await page.waitForFunction(()=>FG.runtime.snapshot()?.config?.bucketCount===3);await page.locator('#returnLive').click();
   // Choose the long retained history, including versions outside the first page.
   await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();if(!await page.getByRole('button',{name:'Saved game 00',exact:true}).count())await page.locator('#liveMoreGames').click();await page.getByRole('button',{name:'Saved game 00',exact:true}).click();await page.waitForFunction(()=>document.getElementById('liveName').textContent==='Saved game 00'&&document.querySelectorAll('#compareVersion option').length>=24&&document.getElementById('liveEditor').getAttribute('aria-busy')!=='true');
   await page.locator('#versionTools').evaluate(element=>element.open=true);while(await page.locator('#liveMoreVersions').isVisible()){const count=await page.locator('#compareVersion option').count();await page.locator('#liveMoreVersions').click();await page.waitForFunction(count=>document.getElementById('liveMoreVersions').hidden||document.querySelectorAll('#compareVersion option').length>count,count);}assert.equal(await page.locator('#compareVersion option').count(),126);
   await page.fill('#livePrompt','Give me four buckets');await page.locator('#livePromptForm button[type=submit]').click();await page.waitForFunction(()=>FG.runtime.snapshot()?.config?.bucketCount===4);
   assert.equal(await page.evaluate(()=>window.scrollY),0,'switching to play finishes the programmatic scroll before a child can tap');
   await page.locator('#returnLive').click();
   await page.locator('#page-feedback:not(.hidden) #liveKeep').waitFor({state:'visible'});
   await page.locator('#liveKeep').click();await page.waitForFunction(()=>document.getElementById('liveStatus').textContent.includes('pinned'));
   await page.locator('#versionTools').evaluate(element=>element.open=true);await page.fill('#forkName','Recovered indexed copy');await page.locator('#liveForkForm button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('liveStatus').textContent.includes('Saved as a new game'));
   const capture=await page.evaluate(()=>FG.factory.captureWorkspace());assert.equal(capture.projects.length,31);assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-workspace-v2')),seeded.raw,'legacy originals retained exactly');
   await page.reload();await page.waitForFunction(()=>window.FG?.factory&&window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();if(!await page.getByRole('button',{name:'Recovered indexed copy',exact:true}).count())await page.locator('#liveMoreGames').click();await page.getByRole('button',{name:'Recovered indexed copy',exact:true}).click();await page.locator('#livePlay').click();await page.waitForFunction(()=>FG.runtime.snapshot()?.config?.bucketCount===4);assert.deepEqual(errors,[]);
   console.log('PASS '+name+': 30-game pagination, 126 retained versions, exact mechanics, Keep, Fork, reload, preserved legacy originals');await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
