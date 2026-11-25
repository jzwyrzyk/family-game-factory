import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import type {AddressInfo} from 'node:net';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {readWorkspace,writeWorkspace} from '../server/pipeline/workspace-state';
import type {Repository} from '../server/pipeline/types';
import {fixture,signing,familyId,workspace,appOrigin,sourceAudience,targetAudience} from './household-recovery-fixture';
import {syntheticHttpsTunnel} from './beta-https';

/** Real browser fetch, TLS, cookies and production recovery/session handlers.
 * The CONNECT tunnel changes no HTTP headers; only persisted state is synthetic. */
async function main(){
 const f=await fixture(true),sourceOrigin=appOrigin,targetOrigin='https://new-owner.example';
 f.config.appOrigin=targetOrigin;f.config.gatewayOrigin=targetOrigin;f.config.householdPrivateHost!.sourceOrigin=sourceOrigin;
 f.config.householdRecovery!.adultMappings=[{sourceOrigin,sourceAudience,targetAudience}];
 const repo:Repository={snapshot:()=>f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true),transaction:update=>f.db.run(async tx=>{const loaded=await readWorkspace(tx,workspace,f.artifacts),result=update(loaded.state);await writeWorkspace(tx,loaded,f.artifacts,{splitGamePayloads:true});return result;})};
 const status=trustedDeviceHandler(repo,{appOrigin:targetOrigin,familyId,sessionKey:signing,adultPilot:{enabled:true,ownerApproved:true,profileAccessVerified:true}});
 const bundle=await build({stdin:{contents:"export {requestAdultRecovery,transferredAdultMappings} from './src/storage/adult-transfer-recovery'; export {activateAdultSession} from './src/adult-pilot/session'; export {setAdultWorkspace} from './src/adult-pilot/storage';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'recoveryTest',platform:'browser',define:{'import.meta.env.MODE':'"test"'}});
 const directory=mkdtempSync(join(tmpdir(),'jems-household-recovery-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',directory+'/key','-out',directory+'/cert','-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const seen:{path:string;method:string;origin:string|undefined;request:string|string[]|undefined;json:boolean;cookie:boolean;proof:boolean;status?:number}[]=[];
 const server=createServer({key:readFileSync(directory+'/key'),cert:readFileSync(directory+'/cert')},(req,res)=>{
  const path=new URL(req.url!,targetOrigin).pathname;
  if(path.startsWith('/v1/')){
   const observed={path,method:req.method!,origin:req.headers.origin,request:req.headers['x-factory-request'],json:!!req.headers['content-type']?.startsWith('application/json'),cookie:!!req.headers.cookie,proof:req.headers['x-factory-adult-session']===f.sessions[1].proof,status:0};seen.push(observed);res.on('finish',()=>{observed.status=res.statusCode;});
   void (path==='/v1/sessions/status'?status(req,res):f.route.handler(req,res));return;
  }
  res.writeHead(200,{'Content-Type':path==='/test.js'?'text/javascript':'text/html'});res.end(path==='/test.js'?bundle.outputFiles[0].text:'<!doctype html><html><body><script src="/test.js"></script></body></html>');
 });
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const tunnel=await syntheticHttpsTunnel((server.address() as AddressInfo).port,[new URL(targetOrigin).host]);
 const engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await engine.launch({proxy:tunnel.proxy,...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH??process.env.BETA_CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  // tsx names nested callbacks in serialized evaluate functions.
  await context.addInitScript('globalThis.__name=(value)=>value;');
  for(const part of f.sessions[1].cookies.split('; ')){const at=part.indexOf('=');await context.addCookies([{name:part.slice(0,at),value:part.slice(at+1),url:targetOrigin,httpOnly:true,secure:true,sameSite:'Strict'}]);}
  const page=await context.newPage();await page.goto(targetOrigin);
  await page.evaluate(({profile,proof,expiresAt,sourceOrigin,familyId,workspace})=>{
   const api=(window as any).recoveryTest;(window as any).FG={store:{current:()=>({id:profile})}};
   api.activateAdultSession(location.origin,{active:true,profileId:profile,sessionToken:proof,expiresAt});api.setAdultWorkspace(profile);
   localStorage.setItem('jems-recovery-origin-transfer-v1',JSON.stringify({schema:'jems.recovery-origin-transfer.v1',sourceOrigin,targetOrigin:location.origin,familyId,workspace,archiveSha256:'b'.repeat(64)}));
  },{profile:targetAudience,proof:f.sessions[1].proof,expiresAt:f.sessions[1].session.expiresAt,sourceOrigin,familyId,workspace});
  const before=await repo.snapshot();
  const result=await page.evaluate(async({sourceAudience,sourceOrigin})=>{
   const api=(window as any).recoveryTest,mappings=await api.transferredAdultMappings();
   const selected={sourceAudience,sourceOrigin},point=await api.requestAdultRecovery('/v1/recovery/generated/capture',{...selected,requestId:'actual-browser-first-capture'});
   const listed=await api.requestAdultRecovery('/v1/recovery/generated/list',{...selected,after:''});
   const preview=await api.requestAdultRecovery('/v1/recovery/generated/preview',{...selected,pointId:point.pointId});
   const restored=await api.requestAdultRecovery('/v1/recovery/generated/restore',{...selected,pointId:point.pointId,checksum:preview.checksum,approved:true,attemptId:'actual-browser-reviewed-restore'});
   return {mappings,point,listed,preview,restored};
  },{sourceAudience,sourceOrigin});
  assert.equal(result.mappings.length,1);assert.equal(result.mappings[0].targetAudience,targetAudience);assert.equal(result.point.revisions,1);assert.equal(result.listed.copies.length,1);assert.equal(result.preview.playbackOnly,true);assert.equal(result.restored.added,1);
  const requests=seen.filter(row=>row.path.startsWith('/v1/recovery/'));assert.equal(requests.length,5);
  for(const request of requests){assert.equal(request.method,'POST');assert.equal(request.origin,targetOrigin);assert.equal(request.request,'1');assert.equal(request.json,true);assert.equal(request.cookie,true);assert.equal(request.proof,true);assert.equal(request.status,200);}
  assert.ok(seen.some(row=>row.path==='/v1/sessions/status'&&row.method==='GET'&&row.origin===undefined&&row.status===200),'browser GET status does not supply a fabricated Origin');
  const after=await repo.snapshot();assert.deepEqual(after.revisions.slice(0,before.revisions.length),before.revisions);assert.deepEqual(after.revisions.at(-1)!.game,f.game);assert.deepEqual(after.jobs,before.jobs);assert.deepEqual(after.ledgers,before.ledgers);
  const denied=await page.evaluate(async({profile,proof})=>{
   const url='/v1/recovery/adult/mappings',body=JSON.stringify({profile}),headers={'Content-Type':'application/json','X-Factory-Adult-Session':proof};
   return [await fetch(url,{headers}),await fetch(url,{method:'POST',headers,body}),await fetch(url,{method:'POST',headers:{...headers,'X-Factory-Request':'1'},body:JSON.stringify({profile:'adult:00000000-0000-0000-0000-000000000999'})})].map(response=>response.status);
  },{profile:targetAudience,proof:f.sessions[1].proof});assert.deepEqual(denied,[403,403,403]);
  await f.mutate(s=>{s.adultPilotSessions.find((g:any)=>g.profileId===targetAudience).revokedAt=Date.now();});
  const writesBefore=seen.filter(row=>row.path==='/v1/recovery/generated/capture').length;
  assert.equal(await page.evaluate(async()=>{try{await (window as any).recoveryTest.requestAdultRecovery('/v1/recovery/generated/capture',{requestId:'revoked-browser-attempt'});return false;}catch{return true;}}),true);
  assert.equal(seen.filter(row=>row.path==='/v1/recovery/generated/capture').length,writesBefore,'revoked real session preflight stops the POST');
  const receipt={browser:engine===chromium?'chromium':'webkit',realHttps:true,headerRewriting:false,actualFamilyFetch:true,actualHouseholdHandler:true,mappingCaptureListPreviewRestore:true,strictPostGate:true,revokedPreflightDenied:true};
  mkdirSync('test-results/household-recovery',{recursive:true});writeFileSync(`test-results/household-recovery/${receipt.browser}.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{await browser?.close();await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
