const {exploreWelcome,navigate}=require('./studio-entry.cjs');
/* Production-dist user journeys. COACH_INLINE_REVIEW is an explicit, non-CI local
 * harness for environments blocking browser HTTP: trusted built bundle + memory
 * storage fixture. It is NOT origin/security/service-worker/live-provider evidence. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const {start}=require('./browser-server.cjs');
const inline=process.env.COACH_INLINE_REVIEW==='1'&&!process.env.CI;
async function load(page,url,saved={}){
 if(!inline){await page.goto(url);return;}
 await page.goto('about:blank?studio=1');await page.evaluate(saved=>{
  crypto.randomUUID=()=>{const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const s=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
  const map=new Map(Object.entries(saved));Object.defineProperty(window,'localStorage',{value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),clear:()=>map.clear()},configurable:true});window.__reviewStorage=map;
  window.fetch=async()=>new Response(JSON.stringify({version:1,mode:'unavailable'}),{headers:{'Content-Type':'application/json'}});
 },saved);
 let html=fs.readFileSync('dist/index.html','utf8');const styles=[...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)].map(m=>fs.readFileSync('dist/'+m[1].replace(/^\.\//,''),'utf8')).join('\n');const script=[...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g)].map(m=>fs.readFileSync('dist/'+m[1].replace(/^\.\//,''),'utf8')).join('\n');
 html=html.replace(/<script[^>]+src="[^"]+\.js"[^>]*><\/script>/g,'').replace(/<link[^>]+href="[^"]+\.css"[^>]*>/g,'').replace('<head>','<head><base href="https://local-review.invalid/arcade/"><style>'+styles+'</style>');await page.setContent(html);await page.addScriptTag({type:'module',content:script});
}
(async()=>{const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});fs.mkdirSync('test-results',{recursive:true});
 try{for(const [device,viewport]of[['desktop',{width:1400,height:1000}],['mobile',{width:390,height:844}]]){
  const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(7000);
  const url=`http://127.0.0.1:${server.address().port}/arcade/?studio=1`;await load(page,url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);await exploreWelcome(page);
  // Isolate coaching and game experiments with the ordinary recent-question
  // budget. Math stays enabled; these design actions must not alter its evidence.
  const mathBefore=await page.evaluate(()=>{FG.store.changeProfile({rate:1});const p=FG.store.current();p.mathWindow=[Date.now()];FG.store.save();return JSON.stringify({skills:p.skills,learning:p.learning??null,grade:p.grade,focus:p.focus,intensity:p.intensity,rate:p.rate});});
  const gameTool=async id=>{if(!await page.locator('#studioMore').evaluate(el=>el.open))await page.locator('#studioMore > summary').click();await page.click(id);};
  const chooseProfile=async index=>{if(!await page.locator('#studioProfileMenu').evaluate(el=>el.open))await page.locator('#studioProfileMenu > summary').click();await page.locator('.profile-choice').nth(index).click();};
  const session=()=>page.evaluate(()=>FG.studio.exportNotebook().sessions.at(-1));const projects=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).projects);
  await page.click('[data-starter="gum"]');
  await page.evaluate(()=>{
    const key='family-game-factory-workspace-v2',workspace=JSON.parse(localStorage.getItem(key));
    const project=workspace?.projects.find(p=>p.game==='gum'),revision=workspace?.revisions.find(r=>r.id===project?.headId);
    if(!revision)throw Error('Missing physics fixture project');
    revision.config.qualityVersion=1;localStorage.setItem(key,JSON.stringify(workspace));
  });
  await page.reload();await page.waitForFunction(()=>window.FG?.studio);
  await page.click('[data-starter="gum"]');await page.waitForSelector('.quality-builder');assert.equal(await page.locator('#studioPrompt').isVisible(),false,'play-first hides design tools');
  await page.click('#studioHome');await page.click('[data-starter="gum"]');assert.equal((await projects()).length,1,'repeated play creates no duplicate project');
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();const baseline=(await projects())[0].headId;
  const moreChoices=async()=>{if(!await page.locator('#studioMoreChoices').evaluate(el=>el.open))await page.locator('#studioMoreChoices > summary').click();};
  const talk=async()=>{await page.click('#studioChange');};const tryLocal=async text=>{await talk();await page.fill('#studioPrompt',text);await page.click('#studioSend');await page.waitForSelector('.quality-builder');};
  await talk();await page.fill('#studioPrompt','I won but it was boring');await page.click('#studioTalk');await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('Local reflection'));
  assert.match(await page.textContent('#studioMessages'),/action or goal/);assert.equal((await session()).experiments.length,0);assert.equal((await projects())[0].headId,baseline);
  // Conversation must be its own action. Even a recognized local mechanic is
  // just a thought until the child explicitly chooses Try a change.
  await page.fill('#studioPrompt','Give me 15 gum sticks');
  await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('Local reflection'));
  assert.equal((await session()).experiments.length,0,'talking must not build');
  assert.equal((await projects())[0].headId,baseline,'talking must not change main version');
  // Exercise the real microphone/UI join with a mocked private browser
  // recognizer. No recording or network speech service is used in this test.
  await page.evaluate(()=>{
   class PrivateSpeech {
    static async available(options){if(!options.processLocally)throw Error('Off-device recognition forbidden');return 'available';}
    processLocally=false;lang='';continuous=false;interimResults=false;onresult=null;onerror=null;onend=null;
    start(){window.__studioVoiceTest=this;}
    abort(){this.aborted=true;this.onend?.();}
   }
   Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:PrivateSpeech});
  });
  await page.fill('#studioPrompt','An unsent typed thought');
  await page.click('#studioMic');
  await page.waitForFunction(()=>window.__studioVoiceTest?.processLocally===true);
  await page.evaluate(()=>{
   const mic=window.__studioVoiceTest;
   mic.onresult({results:[{isFinal:true,0:{transcript:'What if the dragon sneezes noodles?'}}]});
   mic.onend();
  });
  await page.waitForFunction(()=>document.getElementById('studioPrompt').value.includes('What if the dragon sneezes noodles?'));
  assert.equal(await page.locator('#studioPrompt').inputValue(),
   'An unsent typed thought What if the dragon sneezes noodles?',
   'voice transcription must not erase a typed draft and must remain editable');
  assert.doesNotMatch(await page.textContent('#studioMessages'),/What if the dragon sneezes noodles\?/,
   'recognition alone never auto-sends a chat turn');
  await page.click('#studioTalk');
  await page.waitForFunction(()=>document.getElementById('studioMessages').textContent.includes('What if the dragon sneezes noodles?')&&document.getElementById('coachModeStatus').textContent.includes('Local reflection'));
  assert.equal((await session()).experiments.length,0,'explicit Send must chat, not build');
  assert.equal((await projects())[0].headId,baseline,'voice must not change game versions');
  // The explicit Try action must not silently become another discussion.
  // An unsupported local mechanic fails honestly rather than queueing a fake AI build.
  await page.fill('#studioPrompt','Make my rocket sneeze spaghetti');
  await page.click('#studioSend');
  await page.waitForSelector('#studioBuildHandoff[open][data-phase="unavailable"]');await page.click('#studioBuildHandoffStay');
  assert.equal((await session()).experiments.length,0,'unavailable AI cannot invent a build');
  assert.equal((await projects())[0].headId,baseline,'unsupported Try preserves main');
  await page.fill('#studioPrompt',"I don't know");await page.click('#studioTalk');await page.waitForFunction(()=>FG.studio.exportNotebook().sessions[0].design.helpLevel===1);
  await moreChoices();await page.click('#coachIdeas');await page.waitForFunction(()=>document.getElementById('studioMessages').textContent.includes('Some ideas from jems:'));assert.equal(await page.locator('#coachProposals button').count(),0,'inspiration is labelled prose, not supplied-answer buttons');assert.equal((await session()).experiments.length,0);
  await page.fill('#studioPrompt','Give me 15 gum sticks');await moreChoices();await page.getByText('Experiment options (optional)',{exact:true}).click();await page.fill('#designPrediction','More chances to test a joint');await page.click('#studioSend');await page.waitForSelector('.quality-builder');assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.parts.filter(p=>p.kind==='bottle').length),1);
  await tryLocal('Make joints stronger');await tryLocal('Give me six gum sticks');let s=await session();assert.equal(s.experiments.length,3);assert.equal(s.experiments[0].candidate.config.gumBudget,15);assert.equal(s.experiments[1].candidate.config.gumBudget,10,'B starts from main, not A');assert.equal((await projects())[0].headId,baseline);
  await gameTool('#studioCompare');assert.equal(await page.locator('.experiment-card').count(),3);await page.locator('[aria-label="Notes for Test A"]').fill('A little easier. I liked having choices.');await page.locator('[aria-label="Combine Test A"]').check();await page.locator('[aria-label="Combine Test B"]').check();await page.click('#combineExperiments');await page.waitForSelector('.quality-builder');s=await session();assert.equal(s.experiments.length,4);assert.equal(s.experiments[3].parents.length,2);assert.equal(s.experiments[3].candidate.config.gumBudget,15);assert.equal(s.experiments[3].candidate.config.jointStrength,1.25);assert.equal((await projects())[0].headId,baseline);
  await gameTool('#studioCompare');await page.getByRole('button',{name:'Play Test A',exact:true}).click();assert.match(await page.textContent('#studioVersion'),/Test A/);assert.equal((await projects())[0].headId,baseline);
  await page.click('#studioKeep');assert.notEqual((await projects())[0].headId,baseline);assert.equal((await session()).experiments.length,4,'promotion preserves all alternatives');
  await gameTool('#studioCompare');await page.locator('.experiment-card').nth(2).getByRole('button',{name:'Develop this test'}).click();await page.fill('#studioPrompt','Make joints stronger');await page.click('#studioSend');await page.waitForSelector('.quality-builder');s=await session();assert.equal(s.experiments.length,5);assert.equal(s.experiments[4].candidate.config.gumBudget,6);assert.equal(s.experiments[4].baseId,baseline,'old experiment baseline is not silently rebased');
  await gameTool('#studioCompare');await page.screenshot({path:`test-results/design-experiments-${device}.png`,fullPage:true});
  await page.click('#studioCloseVersions');await talk();await page.fill('#studioPrompt','The aiming action is awkward. Could we rethink it?');await page.click('#studioTalk');await page.waitForFunction(()=>!document.getElementById('coachModeStatus').textContent.includes('Thinking'));await page.screenshot({path:`test-results/design-conversation-${device}.png`,fullPage:true});
  const retained=(await session()).experiments.length;await moreChoices();await page.click('#coachThink');assert.equal((await session()).design.paused,true);await page.waitForSelector('.quality-builder');assert.equal((await session()).experiments.length,retained);
  await page.click('#studioHome');const saved=inline?await page.evaluate(()=>Object.fromEntries(window.__reviewStorage)):{};if(inline)await load(page,url,saved);else await page.reload();await page.waitForFunction(()=>window.FG?.studio);
  await page.locator('#studioLibrary .studio-saved-open').first().click();await gameTool('#studioCompare');assert.equal(await page.locator('.experiment-card').count(),5);assert.equal(await page.locator('[aria-label="Notes for Test A"]').inputValue(),'A little easier. I liked having choices.');
  await chooseProfile(1);assert.equal(await page.locator('#studioLibrary [data-session]').count(),0);await chooseProfile(0);
  await page.click('#studioNavCreate');await page.fill('#studioPrompt','A penguin delivers pizza on the moon');await page.click('#studioTalk');await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('Local reflection'));assert.equal((await session()).job,null);
  await moreChoices();await page.click('#coachPlanToggle');assert.equal(await page.getByRole('button',{name:'You choose the remaining details',exact:true}).count(),0);
  await page.fill('#plan-fun','Funny pizza deliveries with a penguin');await page.fill('#plan-goal','Deliver pizzas');await page.locator('#plan-goal').locator('xpath=following-sibling::div[1]').getByRole('button',{name:'Save my answer'}).click();
  assert.equal(await page.locator('#plan-fun').inputValue(),'Funny pizza deliveries with a penguin','moving to and saving another field preserves earlier typing');
  const planSession=(await session()).id;assert.equal((await session()).design.approvedPlan,false,'autosave does not approve a build');
  const planSaved=inline?await page.evaluate(()=>Object.fromEntries(window.__reviewStorage)):{};if(inline)await load(page,url,planSaved);else await page.reload();await page.waitForFunction(()=>window.FG?.studio);await page.locator('#studioLibrary [data-session="'+planSession+'"] .studio-saved-open').click();assert.equal(await page.locator('#studioPrompt').isVisible(),true);await moreChoices();await page.click('#coachPlanToggle');
  assert.equal(await page.locator('#plan-fun').inputValue(),'Funny pizza deliveries with a penguin');assert.equal(await page.locator('#plan-goal').inputValue(),'Deliver pizzas');assert.equal((await session()).design.approvedPlan,false);
  assert.equal(await page.locator('#buildGamePlan').count(),0,'no optional Build bypass');assert.equal(await page.locator('#studioSend').isVisible(),false,'new creation requires contextual coach review');assert.doesNotMatch(await page.textContent('#studioMessages'),/Approved game plan|Choose sensible details for:|no build was started/);assert.equal((await session()).design.plan.goal.origin,'child');assert.equal((await session()).design.creationReview,undefined);assert.equal((await session()).job,null);
  const mathAfter=await page.evaluate(()=>{const p=FG.store.current();return JSON.stringify({skills:p.skills,learning:p.learning??null,grade:p.grade,focus:p.focus,intensity:p.intensity,rate:p.rate});});assert.equal(mathAfter,mathBefore,'coaching, experiment versions, reload and profile switching preserve learning evidence and settings');
  // Navigation out of Studio must release the microphone, not just hide its UI.
  await page.evaluate(()=>{
   // The browser reloaded above; install the synthetic local recognizer again.
   class PrivateSpeech {
    static async available(options){if(!options.processLocally)throw Error('Cloud speech is not allowed');return 'available';}
    processLocally=false;lang='';continuous=false;interimResults=false;onresult=null;onerror=null;onend=null;aborted=false;
    start(){window.__studioVoiceTest=this;}
    abort(){this.aborted=true;this.onend?.();}
   }
   Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:PrivateSpeech});
   window.__studioVoiceTest=null;
  });
  await page.click('#studioMic');
  await page.waitForFunction(()=>window.__studioVoiceTest?.processLocally===true);
  await navigate(page,'#studioNavPowers');
  assert.equal(await page.evaluate(()=>window.__studioVoiceTest.aborted),true,'My Powers navigation must abort microphone capture');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);console.log(`PASS ${device}: play-first, no duplicate play projects, discussion vs build, support, A/B/C, combination, explicit promotion, old-base continuation, notes/reload, profile and math isolation, skip, optional own-answer plan and honest offline first-build gate${inline?' [INLINE HARNESS, not network evidence]':''}`);await ctx.close();
 }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
