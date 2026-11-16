// Runs ONLY in the credential-free, network-disabled gVisor image. No provider transport here.
const esbuild=require('esbuild'),{chromium}=require('playwright'),{createHash}=require('node:crypto');
const {renderGenerated}=require('./preview.cjs');
const {runtimeBundle}=require('./bundle-v2.cjs');
const {playtestV2}=require('./playtest-v2.cjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
const {validateSource}=require('./source-validator.cjs');
async function main(game){
 validateSource(game);const v2=game.kind==='generated-module-v2';
 const result=await esbuild.build({stdin:{contents:game.source,loader:'ts',sourcefile:'game.ts'},bundle:false,write:false,format:'iife',globalName:'GameModule',platform:'browser',target:'es2020',logLevel:'silent'});const code=result.outputFiles[0].text;if(code.length>100000)throw Error('OUTPUT_TOO_LARGE');
 const compiled={code,sourceHash:hash(game.source),codeHash:hash(code),tests:{desktop:false,mobile:false,replay:false,isolation:false}},tested={...game,compiled};
 if(v2){const runtime=runtimeBundle();compiled.runtimeVersion=runtime.version;compiled.runtimeHash=runtime.hash;Object.assign(compiled.tests,{input:false,resources:false,pause:false});}
 const browser=await chromium.launch({executablePath:process.env.WORKER_BROWSER_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
 try{
  for(const [device,viewport]of [['desktop',{width:1000,height:800}],['mobile',{width:375,height:812}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile'}),page=await context.newPage();let external=0;await context.route('**/*',r=>{external++;return r.abort();});
   try{
    if(v2){Object.assign(compiled.tests,await playtestV2(page,tested));if(external)throw Error('ISOLATION_FAILED');compiled.tests[device]=true;continue;}
    const artifact=renderGenerated(tested,'sandbox-test','sandbox-channel');await page.setContent('<iframe title="Isolated preview" sandbox="allow-scripts" style="width:100%;height:680px;border:0"></iframe>');await page.locator('iframe').evaluate((el,html)=>el.srcdoc=html,artifact.html);const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Play!',exact:true}).click();
    await frame.locator('#game[data-frames]').waitFor({timeout:3000});if(await frame.locator('#status').getAttribute('data-state')==='error')throw Error('RUNTIME_FAILED');
    // Independent exploratory play; no generated tests, host privileges or injected win callbacks.
    for(let i=0;i<30;i++){
     const state=await frame.locator('#status').getAttribute('data-state');if(state==='won')break;if(state==='error'||state==='lost')throw Error('PLAYTEST_'+state.toUpperCase());
     const control=frame.locator('[data-control]');if(await control.count())await control.nth(i%await control.count()).click();
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
 return tested;
}
let input='';process.stdin.on('data',c=>{input+=c;if(Buffer.byteLength(input)>50000)process.exit(2)});process.stdin.on('end',()=>{main(JSON.parse(input)).then(game=>process.stdout.write(JSON.stringify({ok:true,game}))).catch(e=>{const errors=e.errors?.map(x=>x.text).join('; ')||e.message;process.stdout.write(JSON.stringify({ok:false,diagnostics:String(errors).slice(0,1500)}));});});
