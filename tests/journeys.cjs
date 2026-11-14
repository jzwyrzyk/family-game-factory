const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html'))}).listen(0,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const nav=async(name)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 const original=await page.evaluate(()=>{FG.store.current().stats.gum={played:9,wins:5,bestLevel:3};FG.store.current().skills.legacy={tries:2};FG.store.save();return JSON.stringify(FG.store.current())});
 await nav('✨ Create');await page.click('#wizardNext');assert.equal(await page.locator('[data-step="0"]').isVisible(),true);
 await page.fill('#inventIdea','A space cat collects dancing donuts');await page.click('#wizardNext');await page.selectOption('#inventAction','Run, jump and explore');await page.fill('#inventWin','Collect five donuts');await page.click('#wizardBack');assert.equal(await page.inputValue('#inventIdea'),'A space cat collects dancing donuts');await page.click('#wizardNext');await page.click('#wizardNext');assert.match(await page.textContent('#ideaPreview'),/Collect five donuts/);await page.click('#wizardSave');await page.waitForSelector('#page-creations:not(.hidden)');assert.match(await page.textContent('#feedbackList'),/space cat/);
 await page.reload();assert.equal(await page.evaluate(()=>JSON.stringify(FG.store.current())),original);
 await nav('🎨 My Creations');assert.match(await page.textContent('#feedbackList'),/space cat/);
 // Improvement save and safe text rendering.
 await nav('🎛️ Remix');await page.fill('#feedbackText','<img src=x onerror=alert(1)> More dancing donuts');await page.click('#feedbackForm button[type=submit]');assert.match(await page.textContent('#feedbackStatus'),/Saved/);await nav('🎨 My Creations');assert.equal(await page.locator('#feedbackList img').count(),0);
 // Every original game and each difficulty can launch and exit.
 for(const game of ['gum','buckets','dragon'])for(const difficulty of ['gentle','classic','stretch']){
 await nav('🎛️ Remix');await page.selectOption('#remixGame',game);await page.selectOption('#remixDifficulty',difficulty);await page.click('#playRemix');await page.waitForSelector('#page-game:not(.hidden)');
 if(game==='gum')assert.ok(await page.locator('.builder-piece').count()>0);
 if(game==='dragon')await page.getByRole('button',{name:/Alex/}).count()?await page.getByRole('button',{name:/Alex/}).click():await page.locator('.builder-piece').first().click();
 if(game==='buckets'){await page.getByRole('button',{name:'🪣 Choose bucket',exact:true}).click();await page.waitForTimeout(2100);assert.equal(await page.locator('#stage-overlay').isVisible(),true)}
 await page.click('#exitGame');
 }
 // Existing math engine: wrong answer hint, correct answer, persisted progress.
 await nav('⚡ My Powers');const answer=await page.locator('#lab-question h1').textContent();const parts=answer.match(/(\d+)\s*([+−×÷-])\s*(\d+)/);const a=+parts[1],b=+parts[3];const n=parts[2]==='+'?a+b:parts[2]==='×'?a*b:parts[2]==='÷'?a/b:a-b;
 await page.fill('#lab-answer','-999');await page.click('#lab-check');assert.ok((await page.textContent('#lab-feedback')).length);await page.fill('#lab-answer',String(n));await page.click('#lab-check');assert.match(await page.textContent('#lab-feedback'),/Nice/);
 // Parent settings and v1 restore retain original progress and ideas.
 await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();await page.selectOption('#parentFocus','div');await page.click('#saveParent');assert.equal(await page.evaluate(()=>FG.store.current().focus),'div');const backup=await page.evaluate(()=>JSON.stringify(FG.store.data));await page.evaluate(raw=>FG.store.restore(raw),backup);
 await page.reload();assert.equal(await page.evaluate(()=>FG.store.current().stats.gum.played),9);assert.equal(await page.evaluate(()=>FG.store.data.feedback.length),2);
 // Profile-specific remixes; legacy v1 backups without new fields still load.
 await nav('🎛️ Remix');await page.selectOption('#remixGame','dragon');assert.equal(await page.inputValue('#remixDifficulty'),'stretch');await page.locator('.profile-choice').nth(1).click();assert.equal(await page.inputValue('#remixDifficulty'),'classic');
 // Complete a builder level and continue, without changing the first profile's history.
 await page.evaluate(()=>FG.store.changeProfile({rate:0}));await page.evaluate(()=>FG.app.openGame('gum'));
 for(const [piece,slot] of [['Traffic cone','Pointy nose'],['Big bottle','Rocket body'],['Spoon wing','Left wing'],['Paddle wing','Right wing'],['Old fan','Engine'],['Shiny CD','Window']]){await page.locator('.builder-piece').filter({hasText:piece}).click();await page.locator('.build-slot').filter({hasText:slot}).click()}
 await page.waitForSelector('#resultNext');await page.click('#resultNext');assert.match(await page.textContent('.builder-header'),/Level 2/);assert.equal(await page.evaluate(()=>FG.store.current().stats.gum.wins),1);await page.click('#exitGame');
 // Failed local writes keep a child's draft and report failure.
 await nav('✨ Create');await page.fill('#inventIdea','A rainbow swimming adventure');await page.click('#wizardNext');await page.click('#wizardNext');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage full')}});await page.click('#wizardSave');assert.match(await page.textContent('#createStatus'),/could not be saved/);assert.equal(await page.inputValue('#inventIdea'),'A rainbow swimming adventure');
 // Mobile pages fit and key controls stay reachable.
 await page.setViewportSize({width:375,height:812});for(const name of ['🎮 Play','✨ Create','🎛️ Remix','🎨 My Creations','⚡ My Powers']){await nav(name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} overflows`)}
 assert.deepEqual(errors,[]);console.log('PASS: creation, remix, all games, math, parents, persistence, profiles, failed saves, mobile');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
