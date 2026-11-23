/* My Creations relocation: actual native games and unchanged saved identities. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,openRetainedGame,openProfiles}=require('./studio-entry.cjs');
require('tsx/cjs');
const {RevisionStore,WORKSPACE_KEY}=require('../src/factory/workspace.ts');
const {StudioNotebook,STUDIO_KEY}=require('../src/studio/notebook.ts');
const {defaults}=require('../src/runtime/manifests.ts');

function savedGames(){
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const games=new RevisionStore(storage),notebook=new StudioNotebook(storage),selected={};
 for(const owner of ['player1','player2'])for(const game of ['buckets','dragon']){
  const project=games.create(owner,game,`${owner} ${game} kept game`);
  games.keep(project.id,owner);
  const config={...defaults(game),...(game==='buckets'?{bucketCount:4,splashMs:1200}:{groundResilience:150,shieldRadius:90})};
  games.commit(project.id,owner,config,'My saved current version');
  const session=notebook.create(owner,game,project.name,project.id,{playOnly:true});
  selected[owner+':'+game]={project:games.project(project.id,owner),config,session:session.id};
  // A separate authored fork uses the older engine. It must not disappear or
  // be replaced by the shortcut, even while another session is playOnly.
  const fork=games.fork(project.id,owner,`${owner} ${game} older-engine variant`);
  games.commit(fork.id,owner,{...config,originalRules:false},'Keep the older rules');
  notebook.create(owner,game,fork.name,fork.id);
 }
 return {workspace:games.snapshot(),notebook:notebook.read(),selected};
}
const readWorkspace=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),WORKSPACE_KEY);
const ready=page=>page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime&&window.FG?.factory);
async function collection(page){
 if(await page.locator('#page-studio').isVisible())await page.locator('#studioHome').click();
 if(await page.locator('#page-game').isVisible())await page.locator('#exitGame').click();
 if(!await page.locator('#page-creations').isVisible())await page.getByRole('button',{name:'My Creations',exact:true}).click();
 await page.locator('#page-creations').waitFor({state:'visible'});
}
async function nativeReady(page,game){
 await page.waitForSelector('#game-mount canvas#game');
 if(game==='dragon')await page.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);
}

(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
   for(const existing of [false,true]){
    const context=await browser.newContext({viewport,hasTouch:device==='phone',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
    await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:'{"version":1,"mode":"unavailable"}'}));
    const saved=existing?savedGames():null;
    if(saved)await context.addInitScript(({saved,workspaceKey,notebookKey})=>{
     if(window.top!==window)return;
     if(!localStorage.getItem(workspaceKey))localStorage.setItem(workspaceKey,JSON.stringify(saved.workspace));
     if(!localStorage.getItem(notebookKey))localStorage.setItem(notebookKey,JSON.stringify(saved.notebook));
    },{saved,workspaceKey:WORKSPACE_KEY,notebookKey:STUDIO_KEY});
    try{
     await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);await ready(page);await exploreWelcome(page);
     assert.deepEqual(await page.locator('#studioStarters [data-starter]').evaluateAll(nodes=>nodes.map(n=>n.dataset.starter)),['factory','mining','gum','hill']);
     assert.equal(await page.locator('#page-studio-library #studioOriginalsSection').count(),0);
     const before=await readWorkspace(page);
     await collection(page);
     assert.deepEqual(await page.locator('#page-creations #studioOriginals [data-starter]').evaluateAll(nodes=>nodes.map(n=>n.dataset.starter)),['dragon','buckets']);
     assert.equal(await page.locator('#studioOriginalsTitle').innerText(),'Play your games');
     assert.deepEqual(await readWorkspace(page),before,'opening My Creations does not create or rewrite a project');
     if(existing){
      const names=await page.locator('#savedRemixes button').allTextContents();
      for(const project of saved.workspace.projects.filter(p=>p.owner==='player1'))assert.ok(names.some(name=>name.includes(project.name)),'every owned variant remains selectable');
      assert.ok(names.every(name=>!name.includes('player2')),'the sibling’s saved versions remain private');
     }
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'My Creations fits the viewport');
     const cards=await page.locator('#studioOriginals .studio-starter').evaluateAll(nodes=>nodes.map(node=>({
      padding:getComputedStyle(node).padding,overflow:getComputedStyle(node).overflow,
      transition:getComputedStyle(node).transitionDuration,height:node.getBoundingClientRect().height,
      labels:[...node.querySelectorAll('.studio-card-name,.studio-card-state,.studio-card-link')].map(label=>Number.parseFloat(getComputedStyle(label).fontSize))
     })));
     assert.ok(cards.every(card=>card.padding==='0px'&&card.overflow==='hidden'&&card.height>=48));
     assert.ok(cards.every(card=>card.labels.every(size=>size>=18)),'moved cards keep readable child labels on phones');
     assert.ok(cards.every(card=>card.transition==='0s'),'reduced motion remains effective in My Creations');
     await page.screenshot({path:`test-results/retained-games-${device}-${existing?'saved':'fresh'}.png`,fullPage:true});
     for(const game of ['buckets','dragon']){
      await openRetainedGame(page,game);await nativeReady(page,game);
      const actual=await page.evaluate(()=>({runtime:FG.runtime.snapshot(),book:FG.studio.exportNotebook(),owner:FG.store.current().id}));
      const current=actual.book.sessions.find(s=>s.id===actual.book.active[actual.owner]);
      const expected=existing?saved.selected['player1:'+game]:null;
      assert.equal(current.owner,'player1');assert.equal(current.game,game);
      assert.deepEqual(actual.runtime.config,expected?expected.config:defaults(game));
      if(expected){assert.equal(current.id,expected.session);assert.equal(current.projectId,expected.project.id);}
      await collection(page);
     }
     const played=await readWorkspace(page);
     if(existing){
      assert.deepEqual(played.projects,saved.workspace.projects,'heads, kept versions, owners and variants are unchanged');
      assert.deepEqual(played.revisions,saved.workspace.revisions,'exact configs, fork ancestry and all immutable revisions survive');
      for(const project of saved.workspace.projects.filter(p=>p.owner==='player1'&&p.name.includes('older-engine'))){
       await page.locator('#savedRemixes').getByRole('button',{name:project.name,exact:true}).click();
       await page.locator('#livePlay').click();
       if(project.game==='dragon')await page.locator('#game-mount').getByRole('button',{name:/Ruby/}).click();
       await page.waitForSelector('#game-mount canvas');
       assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().config),saved.workspace.revisions.find(r=>r.id===project.headId).config,'saved variants retain their older playable engine');
       await collection(page);
      }
     }else assert.equal(played.projects.length,2,'first explicit play creates exactly one project per retained game');
     await page.reload();await ready(page);await exploreWelcome(page);
     for(const game of ['buckets','dragon']){await openRetainedGame(page,game);await nativeReady(page,game);await collection(page);}
     assert.deepEqual((await readWorkspace(page)).projects,played.projects,'reopening never creates replacement or duplicate projects');
     assert.deepEqual((await readWorkspace(page)).revisions,played.revisions);
     if(existing){
      await page.locator('#studioCollectionBack').click();await openProfiles(page);
      await page.locator('#profile-choices .profile-choice').nth(1).click();
      await openRetainedGame(page,'buckets');await nativeReady(page,'buckets');
      const selected=await page.evaluate(()=>{const n=FG.studio.exportNotebook(),owner=FG.store.current().id;return n.sessions.find(s=>s.id===n.active[owner]);});
      assert.equal(selected.owner,'player2');assert.equal(selected.id,saved.selected['player2:buckets'].session);
      await collection(page);
      assert.ok((await page.locator('#savedRemixes button').allTextContents()).every(name=>!name.includes('player1')));
      assert.deepEqual((await readWorkspace(page)).projects,saved.workspace.projects);
      assert.deepEqual((await readWorkspace(page)).revisions,saved.workspace.revisions);
     }
     assert.deepEqual(errors,[]);assert.deepEqual(posts,[],'retained play makes no model or build requests');
     console.log(`PASS ${device} ${existing?'saved variants':'fresh games'}: My Creations, native assets, current versions, no duplicate projects or POSTs`);
    }finally{await context.close();}
   }
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
