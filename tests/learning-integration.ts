/** Production-shell integration; all game content here is a named local fixture. No model calls. */
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {build, transformSync} from 'esbuild';
import {chromium, type Browser, type Page} from 'playwright';
import {start} from './browser-server.cjs';
import {generateItem} from '../src/learning/content';
import type {MathItem} from '../src/learning/types';
import {renderPreview} from '../server/pipeline/artifacts';
import {renderGenerated} from '../server/sandbox/preview.cjs';
import {hash, type GeneratedGame} from '../server/agent/generated';

const STORE='family-game-factory-state-v1';
const devices=[['desktop',{width:1280,height:960}],['mobile',{width:390,height:844}]] as const;
const activeItem=(page:Page):Promise<MathItem>=>page.evaluate(()=>window.FG.learning.activeItem);
const profile=(page:Page)=>page.evaluate(()=>window.FG.store.current());
const attempts=(page:Page)=>page.evaluate(()=>window.FG.store.current().learning?.attempts||[]);
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();

async function submitWritten(page:Page,item:MathItem,answer=String(item.answer)) {
  if(item.answerKind==='choice'){
    const choice=item.choices?.find(c=>c.value===answer);assert.ok(choice,'choice value must be defined by the item');
    await page.locator('.math-activity').getByRole('button',{name:choice.label,exact:true}).click();
  }else{
    const tab=page.getByRole('button',{name:'Write an answer',exact:true});
    if(await tab.isVisible())await tab.click();
    await page.locator('.math-activity .math-answer-input').fill(answer);
    await page.locator('.math-activity').getByRole('button',{name:'Check answer',exact:true}).click();
  }
}
function wrongAnswer(item:MathItem):string {
  if(item.answerKind==='choice')return item.choices!.find(c=>c.value!==String(item.answer))!.value;
  if(item.answerKind==='number')return String(Number(item.answer)+1);
  if(item.answerKind==='fraction')return Number(String(item.answer).split('/')[0])===0?'1/1':'0/1';
  return String(item.answer)==='1:00'?'2:00':'1:00';
}
async function finishWithHelp(page:Page) {
  await page.locator('[data-action="show-solution"]').click();
  await page.locator('[data-action="continue-supported"]').click();
  await page.waitForFunction(()=>!window.FG.learning.active);
}
async function advanceBudget(page:Page) {
  const now=await page.evaluate(()=>Date.now());
  await page.clock.setSystemTime(new Date(now+610_000));
  assert.equal(await page.evaluate(()=>window.FG.math.canAsk(window.FG.store.current())),true,'an expired pacing window permits another learning opportunity');
}

async function applicationJourney(browser:Browser,base:string,device:typeof devices[number]) {
  const [name,viewport]=device;
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',reducedMotion:'reduce'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
  try{
    await page.goto(base);await page.waitForFunction(()=>window.FG?.learning&&window.FG?.factory);
    await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();
    assert.deepEqual(await page.locator('#parentGrade option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value)),['1','2','3','4']);
    assert.equal(await page.locator('#parentRate').getAttribute('min'),'1');
    for(const grade of [1,2,3,4]){
      await page.selectOption('#parentGrade',String(grade));await page.selectOption('#parentFocus','adaptive');
      const choices=await page.locator('#parentSkill option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean));
      assert.ok(choices.length>0);assert.ok(choices.every(id=>Number(id[1])<=grade),'focus choices respect the chosen grade scope');
      await page.click('#saveParent');assert.equal((await profile(page)).grade,grade);
    }
    await page.uncheck('#parentHint');await page.locator('#parentRate').focus();await page.keyboard.press('Home');await page.click('#saveParent');
    await page.evaluate(()=>window.FG.store.changeProfile({rate:0}));
    assert.equal((await profile(page)).rate,1,'the storage API also clamps attempted math-off settings');
    await page.screenshot({path:`test-results/math-settings-${name}.png`,fullPage:true});

    // A real Math Lab item, including a first error, help request, and abandoned activity.
    await nav(page,'⚡ My Powers');await page.waitForSelector('.math-activity');
    const first=await activeItem(page),firstId=await page.evaluate(()=>window.FG.learning.activeAttemptId),owner=(await profile(page)).id;
    await submitWritten(page,first,wrongAnswer(first));
    const savedWrong=await page.evaluate(({key,owner,id})=>JSON.parse(localStorage.getItem(key)!).profiles.find((p:any)=>p.id===owner).learning.attempts.find((a:any)=>a.id===id),{key:STORE,owner,id:firstId});
    assert.equal(savedWrong.answers.length,1);assert.equal(savedWrong.answers[0].correct,false);assert.equal(savedWrong.outcome,'open');
    await page.locator('[data-action="hint"]').click();
    const hinted=(await attempts(page)).find((a:any)=>a.id===firstId);assert.equal(hinted.hintLevel,1);
    await page.screenshot({path:`test-results/math-lab-help-${name}.png`,fullPage:true});
    await nav(page,'🎮 Play');
    const ended=(await attempts(page)).find((a:any)=>a.id===firstId);
    assert.equal(ended.outcome,'interrupted');assert.equal(ended.answers.length,1);assert.equal(ended.hintEvents.length,1);
    await page.reload();await page.waitForFunction(()=>window.FG?.learning);
    const reloaded=(await attempts(page)).find((a:any)=>a.id===firstId);assert.deepEqual(reloaded,ended,'responses and help survive reload after abandonment');

    // Both profiles practice through the real UI; neither child's history is copied or cleared.
    const ownerHistory=JSON.stringify((await profile(page)).learning);
    await page.locator('.profile-choice').nth(1).click();await nav(page,'⚡ My Powers');
    const otherOwner=(await profile(page)).id;assert.notEqual(otherOwner,owner);
    await submitWritten(page,await activeItem(page));await page.waitForSelector('#lab-next');await nav(page,'🎮 Play');
    const otherHistory=JSON.stringify((await profile(page)).learning);
    const originalHistory=await page.evaluate(id=>JSON.stringify(window.FG.store.data.profiles.find((p:any)=>p.id===id).learning),owner);
    assert.equal(originalHistory,ownerHistory,'the second child cannot mutate the first child’s evidence');
    await page.locator('.profile-choice').first().click();
    assert.equal((await profile(page)).id,owner);assert.equal(JSON.stringify((await profile(page)).learning),ownerHistory);

    await page.clock.install();
    await page.evaluate(()=>{window.FG.store.current().mathWindow=[];window.FG.store.save();window.FG.app.openGame('gum');});
    const mode=page.locator('#gameMathMode select');
    assert.deepEqual(await mode.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value)),['checkpoint','interaction','both']);
    for(const value of ['interaction','both','checkpoint']){
      await mode.selectOption(value);assert.equal(await page.evaluate(()=>window.FG.learning.modeFor('gum')),value);
    }
    const cannotDisable=await page.evaluate(()=>{try{window.FG.learning.setMode('gum','off');return false;}catch{return true;}});
    assert.equal(cannotDisable,true);assert.equal(await page.evaluate(()=>window.FG.learning.modeFor('gum')),'checkpoint');
    await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
    const originalX=await page.evaluate(()=>window.FG.runtime.snapshot().state.parts[0].x);
    await page.clock.runFor(91_000);await page.waitForSelector('#stage-overlay .math-activity');
    const nativeId=await page.evaluate(()=>window.FG.learning.activeAttemptId);
    assert.equal(await page.locator('.math-activity').getAttribute('data-mode'),'checkpoint');
    assert.equal(await page.locator('#game-mount').evaluate(el=>(el as HTMLElement).inert),true,'paused native controls are inert for keyboard and pointer input');
    await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(()=>window.FG.runtime.snapshot().state.parts[0].x),originalX,'the construction is paused even when keyboard focus leaves math');
    await page.screenshot({path:`test-results/math-native-${name}.png`,fullPage:true});
    await finishWithHelp(page);assert.equal(await page.locator('#stage-overlay').isVisible(),false);
    assert.equal(await page.locator('#game-mount').evaluate(el=>(el as HTMLElement).inert),false);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(()=>window.FG.runtime.snapshot().state.parts[0].x),originalX-10,'the same construction resumes after supported participation');
    const native=(await attempts(page)).find((a:any)=>a.id===nativeId);
    assert.equal(native.context.gameId,'gum');assert.equal(native.context.versionId,'original-gum');assert.equal(native.outcome,'shown');assert.equal(native.independent,false);
    assert.equal(await page.evaluate(()=>window.FG.math.canAsk(window.FG.store.current())),false,'one child shares one pacing budget');

    // The child may change the math format in a real remix, without removing math.
    await nav(page,'🎛️ Remix');await page.selectOption('#liveGame','gum');await page.click('#newLiveGame');
    const projectId=await page.locator('#liveProjects').inputValue();
    const beforeRemix=await attempts(page),workspaceBefore=await page.evaluate(()=>JSON.stringify(window.FG.factory.exportWorkspace()));
    await page.fill('#livePrompt','Put math inside the game');await page.click('#livePromptForm button[type=submit]');
    assert.equal(await page.evaluate(id=>window.FG.learning.modeFor(id),projectId),'interaction');
    await page.fill('#livePrompt','Remove all math');await page.click('#livePromptForm button[type=submit]');
    assert.match(await page.locator('#liveIntent').textContent()||'',/Math stays part of every game/);
    assert.equal(await page.evaluate(id=>window.FG.learning.modeFor(id),projectId),'interaction');
    await page.fill('#livePrompt','Use both math formats');await page.click('#livePromptForm button[type=submit]');
    assert.equal(await page.evaluate(id=>window.FG.learning.modeFor(id),projectId),'both');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.FG.factory.exportWorkspace())),workspaceBefore,'format preferences do not rewrite game versions');
    await advanceBudget(page);await page.click('#livePlay');await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
    await page.clock.runFor(91_000);await page.waitForSelector('#stage-overlay .math-activity');
    assert.equal(await page.locator('.math-activity').getAttribute('data-mode'),'both');
    const remixId=await page.evaluate(()=>window.FG.learning.activeAttemptId);await submitWritten(page,await activeItem(page));
    await page.clock.runFor(600);await page.waitForFunction(()=>!window.FG.learning.active);
    const afterRemix=await attempts(page),remix=afterRemix.find((a:any)=>a.id===remixId);
    assert.equal(afterRemix.length,beforeRemix.length+1);assert.ok(beforeRemix.every((a:any)=>afterRemix.some((b:any)=>a.id===b.id)));
    assert.equal(remix.context.projectId,projectId);assert.notEqual(remix.context.versionId,'original-gum');assert.equal(remix.correct,true);
    assert.equal(await page.evaluate(id=>JSON.stringify(window.FG.store.data.profiles.find((p:any)=>p.id===id).learning),otherOwner),otherHistory);

    // A fixed curriculum item gives an inspectable fraction construction in the production host.
    await nav(page,'⚡ My Powers');
    const fraction=generateItem('g3-unit-fraction',{random:()=>.55,representation:'visual'});
    await page.evaluate(item=>{
      const w=window as any;w.fractionResult=null;
      window.FG.learning.mount(document.getElementById('lab-question'),{item,mode:'both',context:{gameId:'math-lab',projectId:'math-lab',mode:'both'},onComplete(result:any){w.fractionResult=result;}});
    },fraction);
    assert.equal(await page.locator('.math-built-number').textContent(),'0/2');
    await page.locator('[data-fraction-part="denominator"][data-delta="1"]').click();
    await page.locator('[data-fraction-part="denominator"][data-delta="1"]').click();
    await page.locator('[data-fraction-part="numerator"][data-delta="1"]').click();
    assert.equal(await page.locator('.math-built-number').textContent(),'1/4');
    await page.screenshot({path:`test-results/math-fraction-${name}.png`,fullPage:true});
    await page.locator('[data-action="check-interaction"]').click();await page.clock.runFor(600);
    assert.equal(await page.evaluate(()=>(window as any).fractionResult?.independent),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'math views stay inside the mobile viewport');
    assert.deepEqual(errors,[]);
    console.log(`PASS learning ${name}: grades, mandatory modes/rate, durable Lab error/help/exit, profile isolation, native pause/resume, shared remix history, fraction construction`);
  }finally{await context.close();}
}

function generatedFixture():GeneratedGame {
  const source=`export function createGame(){return {
    init:()=>({count:0}),
    step:(state,input)=>({count:Math.min(2,state.count+(input.tap?1:0))}),
    draw:state=>[{type:'rect',x:0,y:0,width:720,height:400,color:'#172443'},
      {type:'circle',x:120+state.count*180,y:160,radius:45,color:'#ffe28a'},
      {type:'text',x:70,y:290,text:'Tap twice to complete this test round',size:24,color:'#f5f7ff'}],
    outcome:state=>({status:state.count===2?'won':'playing',score:state.count})
  }};`;
  const code=transformSync(source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
  return {kind:'generated-module-v1',title:'Learning integration fixture',instructions:'A local audited fixture: tap the play area twice.',source,controls:[],compiled:{code,sourceHash:hash(source),codeHash:hash(code),tests:{desktop:true,mobile:true,replay:true,isolation:true}}};
}

async function previewJourney(browser:Browser,base:string,bridge:string,device:typeof devices[number],kind:'declarative'|'generated') {
  const [name,viewport]=device,channel=`math-${kind}-channel`,artifactId=`math-${kind}-artifact`;
  const html=kind==='declarative'?renderPreview({kind:'star-catcher-v1',target:2,seconds:60},artifactId,channel).html:renderGenerated(generatedFixture(),artifactId,channel).html;
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base);await page.waitForFunction(()=>window.FG?.learning);await page.addScriptTag({content:bridge});
    await page.evaluate(({html,channel,artifactId,kind})=>{
      const w=window as any;window.FG.store.changeProfile({grade:4,focus:'adaptive',rate:1,hints:true,punish:false});
      w.previewRounds=[];w.previewMessages=[];
      const host=document.createElement('section');host.id='math-preview-fixture';host.style.cssText='position:relative;width:100%;max-width:760px;margin:20px auto;height:760px;';
      const frame=document.createElement('iframe');frame.id='math-fixture-frame';frame.title='Audited learning preview fixture';frame.sandbox.add('allow-scripts');frame.style.cssText='width:100%;height:760px;border:0;';
      host.append(frame);document.getElementById('page-home')!.prepend(host);
      window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.type==='factory-preview')w.previewMessages.push(event.data);});
      w.previewBridge=w.PreviewLearningTest.attachPreviewLearning(frame,{channel,artifactId,ownerId:window.FG.store.current().id,gameId:`fixture-${kind}`,projectId:`fixture-${kind}`,mode:'checkpoint',onRound(result:any){w.previewRounds.push(result);}});
      frame.srcdoc=html;
    },{html,channel,artifactId,kind});
    const frame=page.frameLocator('#math-fixture-frame');
    await frame.locator(kind==='declarative'?'#restart':'#start').waitFor();
    await page.waitForFunction(()=> (window as any).previewMessages.some((m:any)=>m.event==='ready'));
    assert.equal(await frame.locator('body').evaluate(()=>{try{return !!parent.document.body;}catch{return false;}}),false,'the actual wrapper remains sandboxed away from child data');
    const packet={type:'factory-preview',channel,artifactId,event:'round-complete',roundId:1,won:true,score:2};
    await page.evaluate(packet=>window.postMessage(packet,'*'),packet); // Correct data from the wrong source.
    await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,channel:'incorrect-channel'});
    await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,artifactId:'incorrect-artifact'});
    await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,score:-1});
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>window.FG.learning.active),false);assert.equal((await attempts(page)).length,0);
    assert.equal(await page.evaluate(()=>(window as any).previewRounds.length),0,'spoofed or malformed outcomes cannot advance learning or the game');
    const playRound=async(replay=false)=>{
      if(kind==='declarative'){
        if(replay)await frame.locator('#restart').click();
        for(let i=0;i<2;i++)await frame.getByRole('button',{name:'Catch star',exact:true}).first().click();
      }else{
        await frame.locator(replay?'#replay':'#start').click();
        await frame.locator('#game').click({position:{x:80,y:80}});await frame.getByText('Score: 1',{exact:true}).waitFor();
        await frame.locator('#game').click({position:{x:80,y:80}});
      }
      await page.waitForSelector('.learning-preview-cover .math-activity');
    };
    await playRound();
    assert.equal(await frame.locator(kind==='declarative'?'#restart':'#replay').isDisabled(),true,'the wrapper pauses replay while math is active');
    assert.equal(await page.locator('#math-fixture-frame').evaluate(el=>(el as HTMLIFrameElement).inert),true);
    const firstId=await page.evaluate(()=>window.FG.learning.activeAttemptId);
    await page.screenshot({path:`test-results/math-${kind}-preview-${name}.png`,fullPage:true});
    await submitWritten(page,await activeItem(page));await page.waitForFunction(()=>(window as any).previewRounds.length===1);
    assert.equal(await page.locator('.learning-preview-cover').count(),0);
    assert.equal(await frame.locator(kind==='declarative'?'#restart':'#replay').isDisabled(),false,'the trusted host resumes the actual wrapper');
    assert.equal((await attempts(page)).find((a:any)=>a.id===firstId).independent,true);
    // Browser-generated message.source from the same sandbox, but an already consumed round ID.
    await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),packet);
    await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,checkpointId:999});
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(()=>(window as any).previewRounds.length),1);assert.equal((await attempts(page)).length,1);
    assert.equal(await page.evaluate(()=>window.FG.math.canAsk(window.FG.store.current())),false);
    await page.clock.install();await advanceBudget(page);
    await playRound(true);
    const secondId=await page.evaluate(()=>window.FG.learning.activeAttemptId);assert.notEqual(secondId,firstId);
    await submitWritten(page,await activeItem(page));await page.clock.runFor(600);await page.waitForFunction(()=>(window as any).previewRounds.length===2);
    const history=await attempts(page);assert.equal(history.length,2);assert.ok(history.every((a:any)=>a.independent&&a.context.gameId===`fixture-${kind}`));
    const rounds=await page.evaluate(()=>(window as any).previewMessages.filter((m:any)=>m.event==='round-complete'&&m.channel!=='incorrect-channel').map((m:any)=>m.roundId));
    assert.ok(rounds.includes(1)&&rounds.includes(2),'the real wrapper increments its round ID on replay');
    assert.equal(await page.evaluate(()=>(window as any).previewRounds.length),2);
    if(kind==='generated'){
      // Exercise a completion already in flight when the trusted wrapper's
      // mid-round checkpoint pauses play. These are explicit protocol fixtures.
      await advanceBudget(page);await frame.locator('#replay').click();
      await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{type:'factory-preview',channel,artifactId,event:'math-checkpoint',roundId:3,checkpointId:1});
      await page.waitForSelector('.learning-preview-cover .math-activity');
      const pendingId=await page.evaluate(()=>window.FG.learning.activeAttemptId);
      await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,roundId:3});
      await frame.locator('body').evaluate(packet=>parent.postMessage(packet,'*'),{...packet,roundId:3,checkpointId:77});
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(()=>(window as any).previewRounds.length),2,'the in-flight outcome waits for the active math activity');
      assert.equal(await page.evaluate(()=>window.FG.learning.activeAttemptId),pendingId);
      await submitWritten(page,await activeItem(page));await page.clock.runFor(600);
      await page.waitForFunction(()=>(window as any).previewRounds.length===3);
      assert.equal((await attempts(page)).length,3,'the checkpoint and its pending completion share one learning opportunity');
      assert.equal(await page.locator('.learning-preview-cover').count(),0);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${kind} preview ${name}: source/channel validation, sandbox isolation, host-owned math, pause/resume, duplicate suppression, fresh replay and in-flight outcome handling`);
  }finally{await context.close();}
}

async function recoveryJourney(browser:Browser,base:string) {
  const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const original=JSON.stringify({version:1,activeProfile:'recovery-fixture',feedback:[],profiles:[{
    id:'recovery-fixture',name:'Recovery fixture',icon:'⭐',age:9,grade:3,focus:'mul',intensity:'balanced',rate:3,hints:false,punish:false,
    skills:{},stats:{},mathWindow:[],learning:{version:999,opaque:'preserve this future evidence'},
  }]});
  try{
    await page.addInitScript(({key,original})=>{if(window.top===window)localStorage.setItem(key,original);},{key:STORE,original});
    await page.goto(base);await page.waitForSelector('#storageRecovery');
    assert.match(await page.locator('#storageRecovery').textContent()||'',/unsupported|damaged/);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORE),original,'a future record must remain byte-for-byte recoverable');
    await page.locator('[data-game="gum"]').click();
    assert.equal(await page.evaluate(()=>window.FG.learning.active),false,'unsupported evidence does not start a replacement learning history');
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Save original progress for recovery',exact:true}).click();
    const file=await (await download).path();assert.ok(file);assert.equal(readFileSync(file,'utf8'),original);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORE),original);
    assert.deepEqual(errors,[]);
    console.log('PASS learning recovery: visible explanation, no replacement practice, unchanged future record and exact recovery export');
  }finally{await context.close();}
}

async function main(){
  mkdirSync('test-results',{recursive:true});
  const server=start();let browser:Browser|undefined;
  try{
    if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/arcade/`;
    const output=await build({entryPoints:['src/learning/remote.ts'],bundle:true,format:'iife',globalName:'PreviewLearningTest',platform:'browser',write:false});
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    for(const device of devices){
      await applicationJourney(browser,base,device);
      for(const kind of ['declarative','generated'] as const)await previewJourney(browser,base,output.outputFiles[0].text,device,kind);
    }
    await recoveryJourney(browser,base);
  }finally{await browser?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
