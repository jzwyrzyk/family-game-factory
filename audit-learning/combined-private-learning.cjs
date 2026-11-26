const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{once}=require('node:events');
const root=path.join(__dirname,'combined-c');
const {chromium}=require(root+'/node_modules/playwright'),{start}=require(root+'/tests/browser-server.cjs');
const source=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const variant=process.env.CHECK_PRIVATE_VARIANT||'positive';if(!['positive','negative'].includes(variant))throw Error('Unknown local test input');const suffix=variant==='positive'?'':'-negative';
const out={source,variant,scenarios:[],failures:[]};
const file=fs.readFileSync(root+'/tests/game-art/rock.png');
const digest=crypto.createHash('sha256').update(file).digest('hex');
const artDigest=page=>page.evaluate(async()=>{const a=FG.creation.scene().provenance.sourceProjectId;const b=await FG.drawings.load(a);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');});
async function prepare(page,base,subject){
  await page.addInitScript(subject=>{if(window!==window.top||location.protocol!=='http:')return;const key='family-game-factory-state-v1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,activeProfile:'bench',createdAt:1750000000000,feedback:[],profiles:[{id:'bench',name:'Synthetic learner',icon:'⭐',grade:2,age:7,focus:'adaptive',intensity:'gentle',rate:1,hints:true,punish:false,skills:{},stats:{},mathWindow:[Date.now()],learningSetupComplete:true,allowSubjectSwitch:false,skillFocus:['g2-hundreds'],languageFocus:['g2-cause-effect'],learningSubject:subject}]}));},subject);
  await page.goto(base+'?art=1');await page.locator('#artUploadButton').waitFor();
  assert.equal(await page.evaluate(()=>FG.store.current().learningSubject),subject);
  await page.setInputFiles('#artUpload',{name:'My Rock.png',mimeType:'image/png',buffer:file});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Artwork name"]')?.value==='My Rock');
  await page.locator('#artPictureHunt').click();await page.waitForFunction(()=>FG.creation.scene()?.actors[0].role==='collectible');
  const code=page.locator('#creationCodeView');if(await code.isVisible())await code.click();
  const tools=page.locator('#creationCharacterTools');if(await tools.isVisible()&&await tools.getAttribute('aria-expanded')==='false')await tools.click();
  const opts=page.locator('#creationSceneOptions');if(!await opts.evaluate(el=>el.open))await opts.locator(':scope > summary').click();
  await page.locator('#creationBackground').selectOption('world-forest-v1');await page.waitForFunction(()=>FG.creation.scene().world?.assetId==='world-forest-v1');
  await page.locator('#creationSettingsDone').click();await page.locator('#creationKeep').click();
  assert.equal(await artDigest(page),digest);
  const playTab=page.locator('#creationPlayView');if(await playTab.isVisible())await playTab.click();
  await page.locator('#creationRun').click();await page.waitForFunction(()=>FG.creation.snapshot()?.actors[0].speech==='Find me three times!');
}
async function tapRock(page){
  const canvas=page.locator('#creationCanvas');
  const spot=await canvas.evaluate(c=>{const {width,height}=c.getBoundingClientRect(),actor=FG.creation.snapshot().actors[0];return {x:actor.x*width/800,y:actor.y*height/450};});
  await canvas.click({position:spot});
}
async function check(page,base,subject,viewport){
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'||(!q.url().startsWith(base)&&!q.url().startsWith('blob:')&&!q.url().startsWith('data:'))){requests.push(q.method()+' '+new URL(q.url()).origin);return r.abort();}if(q.url().endsWith('factory-config.json'))return r.fulfill({json:{version:1,mode:'unavailable'}});return r.continue();});
  await prepare(page,base,subject);await tapRock(page);await page.waitForFunction(()=>FG.creation.snapshot().variables.found===1);
  const scene=await page.evaluate(()=>FG.creation.scene()), owner=await page.evaluate(()=>FG.store.current().id);
  const initialGems=(await page.evaluate(()=>FG.rewards.summary())).lifetimeGems;
  await page.evaluate(()=>{FG.store.current().mathWindow=[];FG.store.save();});
  await tapRock(page);
  const dialog=page.locator('#creationLearning:modal'),title=dialog.locator('.workspace-question');await dialog.waitFor();
  const opening=await title.evaluate(n=>{const b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {focused:document.activeElement===n,inViewport:b.y>=0&&b.bottom<=innerHeight&&b.x>=0&&b.right<=innerWidth,hit:!!hit&&n.contains(hit),y:b.y,bottom:b.bottom}});
  assert.ok(opening.focused&&opening.inViewport&&opening.hit,'Visible focused question '+JSON.stringify(opening));
  const attemptId=await page.evaluate(()=>FG.learning.activeAttemptId), item=await page.evaluate(()=>FG.learning.activeItem);
  const paused=await page.evaluate(()=>FG.creation.snapshot());assert.equal(paused.variables.found,1);
  await page.keyboard.press('Escape');await page.keyboard.press('ArrowRight');await page.waitForTimeout(180);
  assert.equal(await dialog.isVisible(),true);const retained=await page.evaluate(()=>FG.creation.snapshot());assert.deepEqual(retained,paused);
  let ink=0;
  if(subject==='math'){
    await dialog.locator('.learning-scratchpad>summary').click();const paper=dialog.locator('.learning-scratchpad canvas');await paper.scrollIntoViewIfNeeded();await paper.focus();await paper.press('Shift+ArrowRight');await paper.press('Enter');
    ink=await paper.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>0).length);assert.ok(ink>0);
    const write=dialog.getByRole('button',{name:'Write an answer',exact:true});if(await write.isVisible())await write.click();
    await dialog.locator('.math-answer-input').fill(String(item.answer));await dialog.getByRole('button',{name:'Check answer',exact:true}).click();
  }else{
    await dialog.locator('[data-action="show-solution"]').click();await dialog.locator('[data-action="continue-supported"]').click();
  }
  await page.waitForFunction(()=>!FG.learning.active&&!document.querySelector('#creationLearning').open);await page.waitForFunction(()=>FG.creation.snapshot()?.variables.found===2,null,{timeout:6000}).catch(()=>{throw Error('PENDING_TAP_DID_NOT_RESUME_AT_SCORE_2');});
  const focus=await page.evaluate(()=>document.activeElement?.id);assert.equal(focus,'creationCanvas');
  const final=await page.evaluate(()=>FG.creation.scene());assert.deepEqual(final,scene);assert.equal(await artDigest(page),digest);
  const saved=await page.evaluate(({attemptId,subject})=>{const p=FG.store.current();return (subject==='math'?p.learning:p.language).attempts.find(a=>a.id===attemptId);},{attemptId,subject});
  assert.equal(saved.independent,subject==='math','EVIDENCE_INDEPENDENCE_CLASSIFICATION');assert.equal(saved.outcome,subject==='math'?'completed':'shown');assert.equal(saved.context.projectId,scene.id);assert.equal(saved.context.gameId,'creation');assert.ok(saved.context.versionId);assert.ok(scene.actors[0].assetId.includes(digest));
  await tapRock(page);await page.waitForFunction(()=>FG.creation.snapshot().variables.found===3&&FG.creation.snapshot().actors[0].speech==='You found all three!');
  const records=await page.evaluate(({attemptId,subject})=>{const p=FG.store.current();return (subject==='math'?p.learning:p.language).attempts.filter(a=>a.id===attemptId).length;},{attemptId,subject});assert.equal(records,1);
  const kept=await page.evaluate(()=>FG.creation.export());assert.ok(kept.revisions.some(r=>r.scene.id===scene.id&&r.scene.actors[0].assetId===scene.actors[0].assetId));
  const gems=(await page.evaluate(()=>FG.rewards.summary())).lifetimeGems;
  assert.equal(gems-initialGems,subject==='math'?2:0,'Reward semantics');await page.screenshot({path:path.join(__dirname,`combined-hunt-${subject}${suffix}.png`)});
  await page.evaluate(()=>FG.artStudio.open());await page.waitForFunction(()=>document.querySelectorAll('#artGrid .art-card').length===1);const names=await page.locator('#artGrid .art-card').allInnerTexts();assert.ok(names[0].includes('My Rock'));assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  return {subject,viewport,owner,world:scene.world.assetId,pin:scene.actors[0].assetId,originalSha:digest,opening,skill:item.skillId,outcome:saved.outcome,independent:saved.independent,context:saved.context,score:[1,2,3],blockedInputs:true,retainedScene:true,retainedOriginal:true,focus,ink,singleAttempt:records,initialGems,gems,afterLibrary:names,unexpectedRequests:requests,pageErrors:errors};
}
(async()=>{const server=start(variant==='positive'?root+'/dist':path.join(__dirname,'combined-negative-build'));if(!server.listening)await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/arcade/`;const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const [subject,viewport] of [['math',{width:1280,height:900}],['language',{width:390,height:844}]]){const page=await b.newPage({viewport,reducedMotion:'reduce',hasTouch:subject==='language'});page.setDefaultTimeout(12000);try{out.scenarios.push(await check(page,base,subject,viewport));}catch(e){out.failures.push({subject,error:e.message,where:e.stack.split('\n').slice(0,5),visible:(await page.locator('main .page:not(.hidden)').innerText().catch(()=>'' )).slice(0,750)});}finally{await page.close();}}}finally{await b.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(__dirname,'combined-private-learning'+suffix+'.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));if(out.failures.length)process.exitCode=1;}})().catch(e=>{console.error(e);process.exitCode=1;});
