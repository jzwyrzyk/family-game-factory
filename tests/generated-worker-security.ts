import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
import {renderGenerated} from '../server/sandbox/preview.cjs';
import {hash} from '../server/agent/generated';
// Audited attack probes only. Production source is never executed by this harness or on the gateway.
async function main(){const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});try{
 for(const [label,source]of [['infinite module','export function createGame(){while(true){}}'],['blocked network',`export function createGame(){fetch('https://fixture.invalid/leak');return {init:()=>({}),step:s=>s,draw:()=>[],outcome:()=>({status:'playing',score:0})}}`],['blocked DOM',`export function createGame(){document.cookie;return {}}`]]){
 const context=await browser.newContext(),page=await context.newPage();let requests=0;await context.route('**/*',r=>{requests++;return r.abort()});const code=transformSync(source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;const game={kind:'generated-module-v1',title:'Security fixture',instructions:'Audited probe, not a generated game.',source,controls:[],compiled:{code,sourceHash:hash(source),codeHash:hash(code),tests:{desktop:true,mobile:true,replay:true,isolation:true}}};
 await page.setContent('<button id="main">Original app still responds</button><iframe sandbox="allow-scripts" style="width:375px;height:650px"></iframe>');await page.locator('iframe').evaluate((el,html)=>(el as HTMLIFrameElement).srcdoc=html,renderGenerated(game,'security-probe','security-channel').html);const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Play!',exact:true}).click();await frame.locator('#status[data-state=error]').waitFor({timeout:3000});await page.click('#main');assert.equal(requests,0);const accessibleParent=await frame.locator('body').evaluate(()=>{try{return !!parent.document.body}catch{return false}});assert.equal(accessibleParent,false);console.log('PASS generated-worker boundary:',label,'stopped without network, parent access or UI freeze');await context.close();
 }
 }finally{await browser.close();}}
void main().catch(e=>{console.error(e);process.exitCode=1});
