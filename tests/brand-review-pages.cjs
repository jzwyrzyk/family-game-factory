const {exploreWelcome,navigate,sendChildMessage,openRetainedGame}=require('./studio-entry.cjs');
/* jems final premerge screenshot review: real built app, synthetic local browser data. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start}=require('./browser-server.cjs');
(async()=>{
const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const root=path.resolve('test-results/brand-review'),report={sha:'unknown',viewports:{},screenshots:[],errors:[]};
fs.mkdirSync(root,{recursive:true});
try{report.sha=JSON.parse(fs.readFileSync('dist/build-info.json','utf8')).sha}catch{}
const base='http://127.0.0.1:'+server.address().port+'/arcade/';
async function shot(page,device,name){
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(160);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=3,name+' has '+overflow+'px horizontal overflow');
 const dir=path.join(root,device);fs.mkdirSync(dir,{recursive:true});
 const rel=device+'/'+name+'.png';
 await page.screenshot({path:path.join(root,rel),fullPage:true,animations:'disabled'});
 report.screenshots.push({device,name,file:rel});
 console.log('CAPTURED '+rel);
}
async function home(page){await navigate(page,'#studioNavHome');await page.locator('#page-studio-library').waitFor({state:'visible'});}
async function pages(device,viewport){
 report.viewports[device]=viewport;
 const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce',serviceWorkers:'block'}),p=await ctx.newPage();
 p.setDefaultTimeout(14000);p.on('dialog',d=>void d.accept());
 try{
  await p.goto(base);await p.waitForFunction(()=>window.FG?.studio&&window.FG?.learning);await exploreWelcome(p);
  assert.deepEqual(await p.locator('#studioStarters [data-starter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.starter)),['factory','mining','gum','hill'],'four curated Ready to Play games keep their intended order');
  assert.equal(await p.locator('#page-studio-library #studioOriginals').count(),0,'Home keeps only the four Ready to Play games');
  assert.deepEqual(await p.locator('#page-creations #studioOriginals [data-starter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.starter)),['dragon','buckets'],'retained games belong to My Creations');
  assert.equal(await p.locator('#page-creations #studioOriginalsTitle').textContent(),'Play your games');
  await shot(p,device,'01-studio-home');
  await p.locator('#studioNew').click();await p.locator('#page-studio').waitFor({state:'visible'});
  await p.locator('#studioCreationHero').waitFor({state:'visible'});
  await shot(p,device,'02-invention-workbench');
  // Creation is conversation-first on all screen sizes; it has no redundant
  // mobile Game/Talk tabs until a playable game exists.
  await p.locator('#studioPrompt').fill('A cat invents a rocket-powered donut car');
  await shot(p,device,'02-create-idea-conversation');
  await sendChildMessage(p,'A cat invents a rocket-powered donut car');
  assert.equal(await p.locator('#coachGuidedChoices').count(),0,'questions invite the child’s own words');
  assert.equal(await p.locator('.jems-delight-toast[data-kind="idea"]').count(),0,'guided creation keeps the next question clear');
  await shot(p,device,'02-first-guided-question');
  // New invention deliberately hides old-game tools; compare versions from a playable game.
  await home(p);await p.locator('[data-starter="gum"]').click();
  await p.locator('.gum-builder').waitFor({state:'visible'});
  await p.locator('#studioMore > summary').click();await p.locator('#studioCompare').click();
  await p.locator('#studioVersions').waitFor({state:'visible'});await shot(p,device,'03-versions-and-tests');
  await home(p);await shot(p,device,'04-saved-idea-home');
  for(const [num,game] of [['05','dragon'],['06','gum'],['07','buckets']]){
   if(['dragon','buckets'].includes(game))await openRetainedGame(p,game);
   else await p.locator('[data-starter="'+game+'"]').click();
   await p.locator('#page-studio').waitFor({state:'visible'});
   await p.waitForTimeout(300);await shot(p,device,num+'-play-'+game);await home(p);
  }
  await navigate(p,'#studioNavPowers');await p.locator('#page-lab').waitFor({state:'visible'});
  await shot(p,device,'08-my-powers-math');
  await p.locator('footer [data-page="parent"]').click();await p.locator('#page-parent').waitFor({state:'visible'});
  await shot(p,device,'09-parent-controls');
  await p.locator('[data-parent-tab="settings"]').click();
  await p.locator('#parentSubject').selectOption('both');await p.locator('#saveParent').click();
  assert.equal(await p.locator('#parentSubject').inputValue(),'both');
  await shot(p,device,'10-parent-both-subjects');
  await home(p);await p.locator('#studioNavMenu').click();await p.locator('#studioSubjectLanguage').click();await p.locator('#studioMenuClose').click();
  assert.equal(await p.evaluate(()=>window.FG.learning.subject),'language');
  await navigate(p,'#studioNavPowers');await p.locator('#page-lab').waitFor({state:'visible'});
  await shot(p,device,'11-my-powers-english');await home(p);
  await shot(p,device,'12-returning-child-home');
 }finally{await ctx.close();}
 const c2=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce',serviceWorkers:'block'}),legacy=await c2.newPage();
 legacy.setDefaultTimeout(14000);legacy.on('dialog',d=>void d.accept());
 try{
  await legacy.goto(base+'?arcade=1');await legacy.waitForFunction(()=>window.FG?.app);
  await legacy.locator('#page-home').waitFor({state:'visible'});await shot(legacy,device,'13-legacy-home');
  for(const [num,dest,name] of [['14','create','legacy-create-wizard'],['15','feedback','legacy-remix'],['16','creations','legacy-my-creations']]){
   await legacy.locator('.site-header nav [data-page="'+dest+'"]').click();
   await legacy.locator('#page-'+dest).waitFor({state:'visible'});await shot(legacy,device,num+'-'+name);
  }
  await legacy.locator('footer [data-page="parent"]').click();await legacy.locator('#page-parent').waitFor({state:'visible'});
  await shot(legacy,device,'17-legacy-parent-controls');
 }finally{await c2.close();}
}
try{
 await pages('desktop',{width:1440,height:960});
 await pages('mobile',{width:390,height:844});
 assert.equal(report.screenshots.length,38);
 console.log('PASS: '+report.screenshots.length+' actual PR screenshots, commit '+report.sha);
}catch(e){report.errors.push(String(e.stack||e));console.error(e);process.exitCode=1;}
finally{
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(root,'README.txt'),'jems actual browser premerge captures for commit '+report.sha+'\nDesktop 1440x960 and mobile 390x844. Synthetic local child data only. Screenshots: '+report.screenshots.length+'\n'+report.errors.join('\n'));
 await browser.close();server.close();
}
})().catch(e=>{console.error(e);process.exitCode=1});
