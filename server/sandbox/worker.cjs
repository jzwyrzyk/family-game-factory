// Runs ONLY in the credential-free, network-disabled gVisor image. No provider transport here.
const esbuild=require('esbuild'),{chromium}=require('playwright'),{createHash}=require('node:crypto');
const {renderGenerated}=require('./preview.cjs');
const {runtimeBundle}=require('./bundle-v2.cjs');
const {playtestV2}=require('./playtest-v2.cjs');
const {playtestIntentV2}=require('./intent-playtest-v2.cjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
const {validateSource}=require('./source-validator.cjs');
// V1 samples held controls every 50 ms. A zero-duration click followed by moving
// to the canvas can clear its click pulse on pointerleave before any sample.
// Keep an ordinary pointer held for two sampling periods and observe fresh
// frames before releasing it. Frames alone are insufficient: a reply may have
// been in flight before the press. This is an input gesture, never a win hook.
async function pressV1Control(page,frame,control){
 await control.hover();const bounds=await control.boundingBox();if(!bounds)throw Error('CONTROL_NOT_VISIBLE');await page.mouse.down();
 try{
  const canvas=frame.locator('#game'),baseline=Number(await canvas.getAttribute('data-frames')),started=performance.now();
  while(performance.now()-started<700){
   const state=await frame.locator('#status').getAttribute('data-state');
   if(state==='won')return;
   if(state==='error'||state==='lost')throw Error('PLAYTEST_'+state.toUpperCase());
   const frames=Number(await canvas.getAttribute('data-frames'));
   if(performance.now()-started>=100&&frames>=baseline+2)return;
   await page.waitForTimeout(10);
  }
  throw Error('CONTROL_DID_NOT_ADVANCE');
 }finally{
  // Release in the button's surrounding margin. A click would install the v1
  // 120 ms pulse-cleanup timer, which can otherwise clear the next held press.
  try{
   const viewport=page.viewportSize(),x=[bounds.x+bounds.width+2,bounds.x-2].find(value=>value>=0&&(!viewport||value<viewport.width));
   if(x===undefined)throw Error('CONTROL_RELEASE_POINT_UNAVAILABLE');
   const y=Math.max(0,Math.min(bounds.y+bounds.height/2,viewport?viewport.height-1:Infinity));
   await page.mouse.move(x,y);
  }finally{await page.mouse.up();}
 }
}
async function main(game,independentIntentPlan){
 validateSource(game);const v2=game.kind==='generated-module-v2';
 if(independentIntentPlan&&!v2)throw Error('INTENT_PLAN_REQUIRES_V2');
 const result=await esbuild.build({stdin:{contents:game.source,loader:'ts',sourcefile:'game.ts'},bundle:false,write:false,format:'iife',globalName:'GameModule',platform:'browser',target:'es2020',logLevel:'silent'});const code=result.outputFiles[0].text;if(code.length>100000)throw Error('OUTPUT_TOO_LARGE');
 const compiled={code,sourceHash:hash(game.source),codeHash:hash(code),tests:{desktop:false,mobile:false,replay:false,isolation:false}},tested={...game,compiled};
 if(v2){const runtime=runtimeBundle();compiled.runtimeVersion=runtime.version;compiled.runtimeHash=runtime.hash;Object.assign(compiled.tests,{input:false,resources:false,pause:false});}
 let independentIntentPasses=0;
 const browser=await chromium.launch({executablePath:process.env.WORKER_BROWSER_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
 try{
  for(const [device,viewport]of [['desktop',{width:1000,height:800}],['mobile',{width:375,height:812}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile'}),page=await context.newPage();let external=0;await context.route('**/*',r=>{external++;return r.abort();});
   try{
    if(v2){
      Object.assign(compiled.tests,await playtestV2(page,tested,{touch:device==='mobile'}));
      if(external)throw Error('ISOLATION_FAILED');
      if(independentIntentPlan){
       // The contract is supplied by the authorized gateway test claim,
       // never by the model output. This is the same credential-free Playwright
       // renderer as the generic gate, with independent requirements.
       const assessment=await playtestIntentV2(page,tested,independentIntentPlan,{touch:device==='mobile'});
       if(assessment.status!=='pass')throw Error('INTENT_EXPECTATIONS_NOT_TESTED');
       independentIntentPasses++;
      }
      compiled.tests[device]=true;continue;
    }
    const artifact=renderGenerated(tested,'sandbox-test','sandbox-channel');await page.setContent('<iframe title="Isolated preview" sandbox="allow-scripts" style="width:100%;height:680px;border:0"></iframe>');await page.locator('iframe').evaluate((el,html)=>el.srcdoc=html,artifact.html);const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Play!',exact:true}).click();
    await frame.locator('#game[data-frames]').waitFor({timeout:3000});if(await frame.locator('#status').getAttribute('data-state')==='error')throw Error('RUNTIME_FAILED');
    // Independent exploratory play; no generated tests, host privileges or injected win callbacks.
    for(let i=0;i<30;i++){
     const state=await frame.locator('#status').getAttribute('data-state');if(state==='won')break;if(state==='error'||state==='lost')throw Error('PLAYTEST_'+state.toUpperCase());
     const control=frame.locator('[data-control]'),count=await control.count();if(count)await pressV1Control(page,frame,control.nth(i%count));
     await frame.locator('#game').click({position:{x:40+(i*43)%240,y:35+(i*19)%120}});await page.waitForTimeout(100);
    }
    if(await frame.locator('#status').getAttribute('data-state')!=='won')throw Error('NO_ACHIEVABLE_WIN_IN_PLAYTEST');
    const changed=Number(await frame.locator('#game').getAttribute('data-changed'));if(changed<2)throw Error('NO_VISIBLE_GAMEPLAY_CHANGE');
    await frame.getByRole('button',{name:'Play again',exact:true}).click();await page.waitForTimeout(100);if(await frame.locator('#status').getAttribute('data-state')!=='playing')throw Error('REPLAY_DID_NOT_RESET');
    const accessible=await frame.locator('body').evaluate(()=>{try{return !!parent.document.body}catch{return false}});if(accessible||external)throw Error('ISOLATION_FAILED');
    compiled.tests[device]=true;compiled.tests.replay=true;compiled.tests.isolation=true;
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 if(independentIntentPlan){
  if(independentIntentPasses!==2)throw Error('INTENT_ATTESTATION_REQUIRED');
  compiled.tests.intent=true;
 }
 return tested;
}
if(require.main===module){let input='';process.stdin.on('data',c=>{input+=c;if(Buffer.byteLength(input)>50000)process.exit(2)});process.stdin.on('end',()=>{
 const value=JSON.parse(input);
 const withPlan=value&&Object.hasOwn(value,'independentIntentPlan');
 const game=withPlan?value.game:value;
 const plan=withPlan?value.independentIntentPlan:undefined;
 main(game,plan).then(game=>process.stdout.write(JSON.stringify({ok:true,game}))).catch(e=>{const errors=e.errors?.map(x=>x.text).join('; ')||e.message;process.stdout.write(JSON.stringify({ok:false,diagnostics:String(errors).slice(0,1500)}));});});}
module.exports={pressV1Control};
