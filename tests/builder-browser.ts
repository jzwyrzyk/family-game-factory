import { chromium,type Browser } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync,readFileSync,mkdirSync,readdirSync } from 'node:fs';
import { createServer,type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { MemoryRepository } from '../server/pipeline/repository';
import { JobService } from '../server/pipeline/service';
import { apiHandler,previewHandler } from '../server/pipeline/http';
import { signSession } from '../server/pipeline/auth';
import { MockAgent } from '../server/testing/mock-agent';
import { renderPreview } from '../server/pipeline/artifacts';
import type { AgentAdapter,AgentInput } from '../server/pipeline/types';
import { resolve,extname } from 'node:path';
const listen=(server:Server,host?:string)=>new Promise<number>(r=>{server.listen(0,host,()=>r((server.address() as {port:number}).port));});
async function main(){
 const browser:Browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 console.log('Builder test browser:',browser.version(),'explicit executable:',process.env.CHROMIUM_PATH||(process.env.CI?'Playwright pinned browser':'local auto'));
 let failNext=false,slowNext=false;const mock=new MockAgent();
 const agent:AgentAdapter={available:true,kind:'mock',async generate(input:AgentInput){if(failNext){failNext=false;throw Error('TEST_BUILD_FAILURE');}if(slowNext){slowNext=false;await new Promise<void>((_,reject)=>input.signal.addEventListener('abort',()=>reject(Error('CANCELLED')),{once:true}));}return mock.generate(input);}};
 const repository=new MemoryRepository(),service=new JobService(repository,agent,{async test(game){
  const context=await browser.newContext(),page=await context.newPage();try{if(game.kind!=='star-catcher-v1')throw Error('DECLARATIVE_FIXTURE_ONLY');const artifact=renderPreview(game,'smoke-test','smoke-channel');await page.setContent('<iframe title="smoke" sandbox="allow-scripts"></iframe>');await page.locator('iframe').evaluate((frame,html)=>(frame as HTMLIFrameElement).srcdoc=html,artifact.html);const frame=page.frameLocator('iframe');for(let i=0;i<game.target;i++)await frame.getByRole('button',{name:'Catch star',exact:true}).first().click();await frame.getByText('You caught the stars!').waitFor();console.log('Artifact gate passed:',game.target,'stars');}finally{await context.close();}
 }},{allowMock:true,maxUnits:0,timeoutMs:15000,maxRetries:2});
 const config={sessionKey:randomBytes(32).toString('hex'),previewKey:randomBytes(32).toString('hex'),appOrigin:'',previewOrigin:''};
 const api=apiHandler(service,config),preview=createServer(previewHandler(service,config));const previewPort=await listen(preview);config.previewOrigin=`http://localhost:${previewPort}`;
 const server=createServer((req,res)=>{
  if(req.url?.startsWith('/v1/')){void api(req,res);return;}
  if(req.url==='/arcade/factory-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,mode:'remote',apiBaseUrl:config.appOrigin,previewOrigin:config.previewOrigin}));return;}
  const name=new URL(req.url!,'http://local').pathname.replace(/^\/arcade\//,'/'),file=resolve('dist','.'+(name==='/'?'/index.html':name));if(!file.startsWith(resolve('dist')+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'} as Record<string,string>)[extname(file)]||'text/plain');res.end(readFileSync(file));
 });const port=await listen(server,'127.0.0.1');config.appOrigin=`http://127.0.0.1:${port}`;
 try{
 for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:375,height:812}]] as const){
  const context=await browser.newContext({viewport,hasTouch:device==='mobile'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>console.error('Builder test page crashed'));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/v1/'))console.error('Builder API failure:',r.status(),new URL(r.url()).pathname);});
  await context.addCookies([{name:'factory_session',value:signSession({subject:'test-designer',familyId:'family-'+device,role:'designer',expiresAt:Date.now()+600000},config.sessionKey),url:config.appOrigin,httpOnly:true,sameSite:'Strict'}]);
  await page.goto(config.appOrigin+'/arcade/');await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'✨ Create',exact:true}).click();await page.fill('#inventIdea','Catch five stars before time runs out');await page.click('#createTry');await page.waitForFunction(()=>document.getElementById('builderStatus')?.textContent?.includes('preview is ready'),{},{timeout:30000}).catch(async e=>{console.error('original builder failure:',String(e));if(!page.isClosed())console.error('builder status:',await page.textContent('#builderStatus').catch(()=>'<closed>'));console.error('pipeline statuses:',(await repository.snapshot()).jobs.map(j=>({status:j.status,errorCode:j.errorCode})));throw e;});assert.match(await page.textContent('#builderMode')||'',/Test builder \(mock\)/);
  const iframe=page.locator('#generatedPreview');assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts');assert.ok((await iframe.getAttribute('src'))?.startsWith(config.previewOrigin));const frame=page.frameLocator('#generatedPreview');await frame.getByRole('heading',{name:/Catch the Stars/}).waitFor();
  const isolated=await frame.locator('body').evaluate(()=>{try{return {origin:location.origin,parentAccessible:!!parent.document.body}}catch{return {origin:location.origin,parentAccessible:false}}});assert.equal(isolated.parentAccessible,false);
  for(let i=0;i<5;i++)await frame.getByRole('button',{name:'Catch star',exact:true}).first().click();
  await page.waitForFunction(()=>window.FG.learning.active);const mathItem=await page.evaluate(()=>window.FG.learning.activeItem);
  if(mathItem.answerKind==='choice')await page.locator('.learning-preview-cover .math-choice-grid button').filter({hasText:mathItem.choices.find((c:any)=>c.value===mathItem.answer).label}).click();
  else{await page.locator('.learning-preview-cover .math-answer-input').fill(String(mathItem.answer));await page.locator('.learning-preview-cover button[type=submit]').click();}
  await page.waitForFunction(()=>!window.FG.learning.active);assert.equal(await page.evaluate(()=>window.FG.store.current().learning.totals.independent),1);
  await page.getByText('You caught 5 stars! Keep it or try your own next change.',{exact:true}).waitFor();await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();
  const working=await iframe.getAttribute('src');failNext=true;await page.fill('#reviseBuildPrompt','Catch six stars');await page.click('#reviseBuildForm button[type=submit]');await page.getByText('That build did not work. Your current game is safe.',{exact:true}).waitFor();assert.equal(await iframe.getAttribute('src'),working);
  await page.click('#retryBuild');await page.waitForFunction(()=>document.getElementById('builderStatus')?.textContent?.includes('preview is ready'),{},{timeout:30000}).catch(async e=>{console.error('original builder failure:',String(e));if(!page.isClosed())console.error('builder status:',await page.textContent('#builderStatus').catch(()=>'<closed>'));console.error('pipeline statuses:',(await repository.snapshot()).jobs.map(j=>({status:j.status,errorCode:j.errorCode})));throw e;});await page.getByRole('button',{name:'Try ready preview',exact:true}).click();await frame.getByText(/0 \/ 6 stars/).waitFor();await page.click('#keepBuild');await page.getByText('Kept! Find your playable game in My Creations.',{exact:true}).waitFor();await page.click('#compareBuild');await page.getByText('Before: 5 stars in 15 seconds. Now: 6 stars in 15 seconds.',{exact:true}).waitFor();await page.click('#undoBuild');await page.getByText('Previous kept version restored.',{exact:true}).waitFor();await frame.getByText(/0 \/ 5 stars/).waitFor();
  slowNext=true;await page.fill('#reviseBuildPrompt','Catch seven stars');await page.click('#reviseBuildForm button[type=submit]');await page.getByText('The builder is making a private candidate.',{exact:true}).waitFor();await page.click('#cancelBuild');await page.getByText('Build cancelled. Your current game is safe.',{exact:true}).waitFor();
  await page.reload();await page.waitForFunction(()=>window.FG?.builder);await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();await page.getByRole('button',{name:'🌟 Catch 5 Stars',exact:true}).click();await page.getByText('Test builder (mock) — this is not real AI generation.',{exact:true}).waitFor();await frame.getByText(/0 \/ 5 stars/).waitFor();await page.fill('#builtGameName','My Star Fork '+device);await page.click('#forkBuildForm button[type=submit]');await page.getByText('Saved as a new builder game. Your original version is unchanged.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);mkdirSync('test-results',{recursive:true});await frame.getByRole('heading',{name:/Catch the Stars/}).waitFor();await iframe.screenshot({path:`test-results/builder-preview-${device}.png`});await page.locator('#builderPanel').screenshot({path:`test-results/builder-${device}.png`});assert.deepEqual(errors,[]);
  // Cross-family access and anonymous job requests fail; preview contains no app cookie/credentials.
  const job=(await repository.snapshot()).jobs.find(j=>j.familyId==='family-'+device)!;const unauth=await fetch(config.appOrigin+'/v1/jobs/'+job.id);assert.equal(unauth.status,401);
  const foreignToken=signSession({subject:'other',familyId:'foreign-family',role:'designer',expiresAt:Date.now()+60000},config.sessionKey);const denied=await fetch(config.appOrigin+'/v1/jobs/'+job.id,{headers:{Cookie:'factory_session='+foreignToken}});assert.equal(denied.status,403);
  console.log(`PASS builder ${device}: real mocked novel mechanic, browser-gated artifact, sandbox isolation, failure preservation, retry, keep/undo, cancellation, reload and authorization`);await context.close();
 }
 // Static site contains neither server secrets, subscription credentials nor mock agent implementation.
 for(const file of readdirSync('dist/assets'))if(file.endsWith('.js')){const asset=readFileSync('dist/assets/'+file,'utf8');for(const secret of [config.sessionKey,config.previewKey,'class MockAgent','CODEX_ACCESS_TOKEN','OPENAI_API_KEY','factory_session='])assert.equal(asset.includes(secret),false,`Static asset leaked ${secret}`);}
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await new Promise<void>(r=>preview.close(()=>r()));}
}
void main().catch(err=>{console.error(err);process.exitCode=1;});
declare global { interface Window { FG:any } }
