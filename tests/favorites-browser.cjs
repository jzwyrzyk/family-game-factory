const {exploreWelcome,navigate,openRetainedGame}=require('./studio-entry.cjs');
/* Curated shelves and saved legacy games run in the actual game lifecycle. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
require('tsx/cjs');
const {RevisionStore,WORKSPACE_KEY}=require('../src/factory/workspace.ts');
const {StudioNotebook,STUDIO_KEY}=require('../src/studio/notebook.ts');

function savedLegacyGames(){
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const workspace=new RevisionStore(storage),notebook=new StudioNotebook(storage),sessions={};
 for(const [game,name] of [['moon','Saved Moon experiment'],['robot','Saved Robot experiment']]){
  const project=workspace.create('player1',game,name),session=notebook.create('player1',game,name,project.id);
  notebook.message(session.id,'player1','child',game==='moon'?'I want to collect more moon donuts.':'I want to plan a route to the star.');
  sessions[game]=session.id;
 }
 return {workspace:workspace.snapshot(),notebook:notebook.read(),sessions};
}
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['tablet',{width:820,height:1080}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='tablet',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    const legacy=savedLegacyGames();
    await context.addInitScript(({legacy,workspaceKey,notebookKey})=>{
     if(window.top!==window)return;
     if(!localStorage.getItem(workspaceKey))localStorage.setItem(workspaceKey,JSON.stringify(legacy.workspace));
     if(!localStorage.getItem(notebookKey))localStorage.setItem(notebookKey,JSON.stringify(legacy.notebook));
    },{legacy,workspaceKey:WORKSPACE_KEY,notebookKey:STUDIO_KEY});
    await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);await exploreWelcome(page);
    const favorites=page.locator('#studioStarters [data-starter]');
    assert.equal(await favorites.count(),4,'four current Ready to Play games');
    assert.deepEqual((await favorites.evaluateAll(nodes=>nodes.map(node=>node.dataset.starter))).sort(),['factory','gum','hill','mining']);
    assert.deepEqual((await page.locator('#page-studio-library #studioOriginals [data-starter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.starter))).sort(),['buckets','dragon']);
    assert.equal(await page.locator('[data-starter="moon"], [data-starter="robot"]').count(),0,'retired starters are absent from both curated shelves');
    assert.equal(await page.locator('#studioLibrary [data-session]').count(),2,'meaningful saved legacy games remain accessible');
    assert.equal((await page.locator('#studioStarterTitle').textContent()).trim(),'Ready to Play jems','favorites shelf uses the approved child-facing heading');
    const openSaved=async game=>page.locator(`#studioLibrary [data-session="${legacy.sessions[game]}"] .studio-saved-open`).click();
    await openSaved('moon');await page.waitForSelector('.favorite-moon .favorite-canvas');
    await page.locator('.favorite-moon .favorite-canvas').focus();
    const original=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');
    const moved=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    assert.ok(moved>original+8,'moon game responds to the actual control');
    await navigate(page,'#studioNavHome');await openSaved('moon');await page.waitForSelector('.favorite-moon');
    const resumed=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    assert.ok(resumed>=moved-5,'moon mission position survives leaving and returning');
    const paused=await page.evaluate(()=>({ok:FG.runtime.pause(),state:FG.runtime.snapshot().state}));
    assert.equal(paused.ok,true,'moon action can reach a safe host checkpoint');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.x),paused.state.x,'game stops while learning is active');
    await page.evaluate(()=>FG.runtime.resume());
    assert.equal(await page.evaluate(()=>FG.runtime.isPlaying()),true);
    await navigate(page,'#studioNavHome');
    await openSaved('robot');await page.waitForSelector('.favorite-robot .favorite-canvas');
    const root=page.locator('.favorite-robot');
    for(let i=0;i<4;i++)await root.locator('[data-direction="right"]').click();
    for(let i=0;i<4;i++)await root.locator('[data-direction="up"]').click();
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.planLength),8,'the robot runs a child-authored plan');
    await navigate(page,'#studioNavHome');await openSaved('robot');await page.waitForSelector('.favorite-robot');
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.planLength),8,'a saved route survives leaving to check another build');
    await page.locator('.favorite-robot').getByRole('button',{name:'Run my plan'}).click();
    await page.waitForFunction(()=>FG.runtime.snapshot().state.position.x>=1,{timeout:5000});
    const state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.running,true);
    assert.ok(state.position.x>0,'robot movement is physical game state, not a static picture');
    const freeze=await page.evaluate(()=>({paused:FG.runtime.pause(),state:FG.runtime.snapshot().state}));
    assert.equal(freeze.paused,true);
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state.position),freeze.state.position,'robot also freezes during learning');
    await page.evaluate(()=>FG.runtime.resume());
    await page.waitForFunction(()=>FG.runtime.snapshot().state.position.y<4,{timeout:9000});
    const persisted=await page.evaluate(()=>FG.studio.exportNotebook());
    assert.deepEqual(persisted.sessions.map(session=>session.id).sort(),Object.values(legacy.sessions).sort(),'opening a saved legacy game never creates a replacement starter');
    for(const original of legacy.notebook.sessions){
     const saved=persisted.sessions.find(session=>session.id===original.id);
     assert.equal(saved.owner,original.owner);assert.deepEqual(saved.messages,original.messages,'authored legacy intent survives native play');
    }
    assert.deepEqual(errors,[],device+' native favorites have no page errors');
    console.log('PASS '+device+': four Ready to Play and two retained games in My Creations, saved Moon movement, saved Robot route, safe checkpoints and durable legacy intent');
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
