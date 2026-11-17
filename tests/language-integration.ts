/** Production Family Game Factory ELA journeys; only audited local games and fixtures. */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {build} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';
import {start} from './browser-server.cjs';
import {renderPreview} from '../server/pipeline/artifacts';

const STORE='family-game-factory-state-v1';
const devices=[['desktop',{width:1250,height:900}],['mobile',{width:390,height:844}]] as const;
const active=(page:Page)=>page.locator('.language-activity:visible');
const saved=(page:Page)=>page.evaluate(()=>window.FG.store.current());
const errorsFor=(page:Page)=>{const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));return errors;};
async function answer(page:Page){
  const question=await page.evaluate(()=>window.FG.learning.activeItem);
  if(question.kind==='choice'){
    await active(page).locator('.language-choice').filter({hasText:question.answer}).first().click();
    await page.waitForFunction(()=>!window.FG.learning.active);
    return;
  }
  await active(page).locator('[data-action="show-solution"]').click();
  await active(page).locator('[data-action="continue-supported"]').click();
  await page.waitForFunction(()=>!window.FG.learning.active);
}
async function subjectAndNative(browser:Browser,base:string,device:typeof devices[number]){
  const [name,viewport]=device,context=await browser.newContext({viewport,hasTouch:name==='mobile',reducedMotion:'reduce'}),page=await context.newPage();
  const errors=errorsFor(page);page.on('dialog',d=>void d.accept());
  try{
    await page.goto(base);
    await page.waitForFunction(()=>window.FG?.learning&&window.FG?.app);
    // Record an actual math attempt first, to test preservation of nonempty learner history.
    await page.evaluate(()=>{
      const p=window.FG.store.current(),q=window.FG.math.select(p,Date.now(),()=>0.23);
      window.FG.math.record(p,q,true,false,Date.now(),1);
      window.FG.store.save();
    });
    await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();
    // Parent reports may legitimately initialize the empty legacy math-v2 record.
    // Compare after initial parent view, before any subject edit, to test actual preservation.
    const oldMath=await page.evaluate(()=>JSON.stringify(window.FG.store.current().learning||null));
    assert.deepEqual(await page.locator('#parentSubject option').evaluateAll(els=>els.map(el=>(el as HTMLOptionElement).value)),['math','language']);
    await page.selectOption('#parentGrade','2');
    await page.selectOption('#parentSubject','language');
    assert.equal(await page.locator('#parentLanguageSettings').isVisible(),true);
    assert.equal(await page.locator('#parentMathSettings').isVisible(),false);
    assert.equal(await page.locator('#parentPunish').isVisible(),false);
    const skills=await page.locator('#parentLanguageSkill option').evaluateAll(els=>els.map(el=>(el as HTMLOptionElement).value).filter(Boolean));
    assert.ok(skills.length>=24);
    assert.ok(skills.every(id=>Number(id[1])<=2));
    await page.selectOption('#parentLanguageSkill','g2-cause-effect');
    await page.click('#saveParent');
    assert.equal((await saved(page)).learningSubject,'language');
    assert.deepEqual((await saved(page)).languageFocus,['g2-cause-effect']);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.FG.store.current().learning||null)),oldMath,'math data is unchanged');
    assert.equal(await page.evaluate(()=>{try{window.FG.store.changeProfile({learningSubject:'off'});return false;}catch{return true;}}),true,'no parent API learning-off escape');
    await page.screenshot({path:'test-results/language-parent-'+name+'.png',fullPage:true});
    await page.reload();await page.waitForFunction(()=>window.FG?.learning);
    assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language');
    await page.getByRole('button',{name:'⚡ My Powers',exact:true}).click();
    await active(page).waitFor({state:'visible'});
    const item=await page.evaluate(()=>window.FG.learning.activeItem);
    assert.equal(item.source,'reviewed-local');
    assert.equal(item.grade<=2,true);
    assert.equal(await active(page).getAttribute('data-skill-id'),'g2-cause-effect');
    assert.equal(await active(page).locator('.language-passage').isVisible(),true);
    await answer(page);
    assert.equal((await saved(page)).language.totals.presentations,1);
    await page.getByRole('button',{name:'🎮 Play',exact:true}).click();
    assert.equal((await saved(page)).language.attempts[0].context.gameId,'language-lab');
    await page.clock.install();
    await page.evaluate(()=>{
      window.FG.store.current().mathWindow=[];
      window.FG.store.save();
      window.FG.app.openGame('gum',{config:{originalRules:true,qualityVersion:0,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}});
    });
    const mode=page.locator('#gameMathMode select');
    assert.deepEqual(await mode.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value)),['checkpoint','interaction','both']);
    assert.match(await page.locator('#gameMathMode').textContent()||'',/Language Arts in this game/);
    assert.equal(await page.evaluate(()=>{try{window.FG.learning.setMode('gum','off');return false;}catch{return true;}}),true);
    const game=page.locator('#game-mount');
    await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
    const before=await page.evaluate(()=>window.FG.runtime.snapshot().state.parts[0].x);
    await page.clock.runFor(91_000);
    await page.waitForSelector('#stage-overlay .language-activity');
    assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language');
    const geometry=await page.locator('#stage-overlay').evaluate(el=>{
      const r=el.getBoundingClientRect(),activity=el.querySelector('.language-activity')!.getBoundingClientRect();
      const text=getComputedStyle(el.querySelector('.language-lead')!).color;
      return {position:getComputedStyle(el).position,top:r.top,left:r.left,width:r.width,height:r.height,
        questWidth:activity.width,questLeft:activity.left,questRight:activity.right,questTop:activity.top,text};
    });
    assert.equal(geometry.position,'fixed','native learning is a viewport dialog rather than clipped inside the game stage');
    assert.ok(Math.abs(geometry.top)<2&&Math.abs(geometry.left)<2);
    assert.ok(geometry.width>=viewport.width-2&&geometry.height>=viewport.height-2);
    assert.ok(geometry.questWidth>=Math.min(330,viewport.width-30),'child has usable reading width on mobile');
    assert.ok(geometry.questLeft>=0&&geometry.questRight<=viewport.width+1);
    assert.ok(!/rgb\(213, 222, 243\)/.test(geometry.text),'text must not inherit pale text from dark modal card');
    assert.equal(await page.locator('[data-action="leave-game"]').isVisible(),true,'the child can leave without solving or cheating');
    assert.equal(await game.evaluate(el=>(el as HTMLElement).inert),true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(()=>window.FG.runtime.snapshot().state.parts[0].x),before,'paused game cannot change while reading');
    const id=await page.evaluate(()=>window.FG.learning.activeAttemptId);
    await page.screenshot({path:'test-results/language-native-'+name+'.png',fullPage:true});
    await active(page).locator('[data-action="show-solution"]').click();
    await active(page).locator('[data-action="continue-supported"]').click();
    assert.equal(await page.locator('#stage-overlay').isVisible(),false);
    assert.equal(await game.evaluate(el=>(el as HTMLElement).inert),false);
    const record=await page.evaluate(id=>window.FG.store.current().language.attempts.find((a:any)=>a.id===id),id);
    assert.equal(record.context.gameId,'gum');
    assert.equal(record.context.versionId,'original-gum');
    assert.equal(record.context.opportunity,'mid-play');
    assert.equal(record.outcome,'shown');
    assert.equal(record.independent,false);
    assert.equal(await page.evaluate(()=>window.FG.math.canAsk(window.FG.store.current())),false,'subject uses existing rolling budget');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.FG.store.current().learning||null)),oldMath,'ELA does not mutate math learner model');
    await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();
    await page.selectOption('#parentSubject','math');
    await page.click('#saveParent');
    assert.equal(await page.evaluate(()=>window.FG.learning.subject),'math');
    assert.equal((await saved(page)).language.totals.presentations,2,'language evidence persists through the switch back');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.FG.store.current().learning||null)),oldMath,'switch back restores math without resetting');
    assert.deepEqual(errors,[]);
    console.log('PASS Language Arts '+name+': parent selection, required checkpoints, lab, original game, safe pause, shared budget, separate history');
  }catch(error){
    const location='test-results/language-integration-'+name+'-failure';
    await page.screenshot({path:location+'.png',fullPage:true}).catch(()=>{});
    writeFileSync(location+'.json',JSON.stringify({errors,subject:await page.evaluate(()=>window.FG?.learning.subject).catch(()=>null)},null,2));
    throw error;
  }finally{await context.close();}
}
async function generatedPreview(browser:Browser,base:string){
  const channel='ela-fixture-channel',artifactId='ela-fixture-artifact';
  const preview=renderPreview({kind:'star-catcher-v1',target:2,seconds:60},artifactId,channel).html;
  const script=(await build({entryPoints:['src/learning/remote.ts'],bundle:true,format:'iife',globalName:'PreviewLearningTest',platform:'browser',write:false})).outputFiles[0].text;
  const context=await browser.newContext({viewport:{width:1100,height:850},reducedMotion:'reduce'}),page=await context.newPage(),errors=errorsFor(page);
  try{
    await page.goto(base);await page.waitForFunction(()=>window.FG?.learning);
    await page.addScriptTag({content:script});
    await page.evaluate(({html,channel,artifactId})=>{
      const w=window as any;
      window.FG.store.changeProfile({learningSubject:'language',grade:2,rate:1,hints:false});
      window.FG.store.current().mathWindow=[];window.FG.store.save();
      w.elaPreviewRounds=[];
      const host=document.createElement('section');host.id='ela-preview-host';host.style.cssText='position:relative;height:720px;width:100%;max-width:760px;margin:auto;';
      const frame=document.createElement('iframe');frame.id='ela-preview-frame';frame.title='Audited ELA preview fixture';frame.sandbox.add('allow-scripts');
      frame.style.cssText='width:100%;height:720px;border:0';host.append(frame);document.getElementById('page-home')!.prepend(host);
      w.elaPreviewBridge=w.PreviewLearningTest.attachPreviewLearning(frame,{
        channel,artifactId,ownerId:window.FG.store.current().id,gameId:'ela-preview',
        projectId:'ela-preview',mode:'checkpoint',onRound(result:any){w.elaPreviewRounds.push(result);}
      });
      frame.srcdoc=html;
    },{html:preview,channel,artifactId});
    const frame=page.frameLocator('#ela-preview-frame');
    await frame.locator('#restart').waitFor();
    await page.waitForFunction(()=>(window as any).elaPreviewBridge.ready===true);
    assert.equal(await page.locator('#ela-preview-frame').evaluate(el=>(el as HTMLIFrameElement).inert),false);
    assert.equal(await frame.locator('body').evaluate(()=>{try{return !!parent.document.body;}catch{return false;}}),false,'sandbox cannot read child history');
    // A spoofed window packet is not trusted, despite knowing the visible protocol.
    await page.evaluate(({channel,artifactId})=>window.postMessage({type:'factory-preview',channel,artifactId,event:'round-complete',roundId:1,won:true,score:2},'*'),{channel,artifactId});
    assert.equal(await page.evaluate(()=>window.FG.learning.active),false);
    for(let i=0;i<2;i++)await frame.getByRole('button',{name:'Catch star',exact:true}).first().click();
    await page.waitForSelector('.learning-preview-cover .language-activity');
    assert.equal(await page.locator('#ela-preview-frame').evaluate(el=>(el as HTMLIFrameElement).inert),true);
    const attempt=await page.evaluate(()=>window.FG.learning.activeAttemptId);
    await page.screenshot({path:'test-results/language-generated-preview.png',fullPage:true});
    await page.locator('.learning-preview-cover .language-activity [data-action="show-solution"]').click();
    await page.locator('.learning-preview-cover .language-activity [data-action="continue-supported"]').click();
    await page.waitForFunction(()=>(window as any).elaPreviewRounds.length===1);
    assert.equal(await page.locator('.learning-preview-cover').count(),0);
    const stored=await page.evaluate(id=>window.FG.store.current().language.attempts.find((a:any)=>a.id===id),attempt);
    assert.equal(stored.context.gameId,'ela-preview');
    assert.equal(stored.context.opportunity,'round-end');
    assert.equal(stored.outcome,'shown');
    assert.equal(stored.independent,false);
    assert.deepEqual(errors,[]);
    console.log('PASS generated preview: isolated worker, channel validation, required ELA, replay release and provenance');
  }finally{await context.close();}
}
async function main(){
  mkdirSync('test-results',{recursive:true});
  const server=start();let browser:Browser|undefined;
  try{
    if(!server.listening)await new Promise<void>(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+((server.address() as AddressInfo).port)+'/arcade/';
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    const failures:Error[]=[];
    for(const device of devices)try{await subjectAndNative(browser,base,device);}catch(e){console.error('FAIL Language Arts '+device[0],e);failures.push(e as Error);}
    try{await generatedPreview(browser,base);}catch(e){console.error('FAIL Language Arts preview',e);failures.push(e as Error);}
    if(failures.length)throw new AggregateError(failures,failures.length+' Language Arts journeys failed');
  }finally{
    await browser?.close();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
