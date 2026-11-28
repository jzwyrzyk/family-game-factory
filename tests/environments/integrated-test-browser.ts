// Loopback TLS exercises served bytes and ordinary household UI only. No deployed or funded receipt is emitted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:https';
import {chromium} from 'playwright';
import {protectedHousehold} from '../../server/beta/owner-host';
import {syntheticHttpsTunnel} from '../beta-https';
import {fingerprint} from '../../scripts/environments/test-frontend.cjs';
import {householdJourneys} from '../../scripts/environments/test-browser.cjs';

async function main(){
 const target={household:'owner.test.example',hub:'family.test.example',preview:'untrusted.test.example'},origin='https://'+target.household;
 const dir=mkdtempSync(join(tmpdir(),'jems-uat-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/key','-out',dir+'/cert','-days','1','-subj','/CN=owner.test.example'],{stdio:'ignore'});
 const host=protectedHousehold({platformMode:'HOUSEHOLD',householdPrivateHost:{audience:'/projects/1/global/backendServices/2',subject:'synthetic'},
    appOrigin:origin,gatewayOrigin:origin,previewOrigin:'https://'+target.preview,familyId:'fixture',workspace:'test'},'dist-family-beta',async(_,res)=>{
    res.writeHead(401,{'content-type':'application/json'});res.end('{"errorCode":"UNAUTHENTICATED"}');
 },async t=>{assert.equal(t,'synthetic');return 'synthetic';});
 const server=createServer({cert:readFileSync(dir+'/cert'),key:readFileSync(dir+'/key')},(req,res)=>{
   if(req.headers.authorization==='Bearer synthetic')req.headers['x-goog-iap-jwt-assertion']='synthetic';
   void host(req,res);
 });
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const port=(server.address() as {port:number}).port, tunnel=await syntheticHttpsTunnel(port,[target.household]);
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,proxy:tunnel.proxy});
 try{
  const original=browser.newContext.bind(browser);
  browser.newContext=options=>original({...options,proxy:tunnel.proxy,ignoreHTTPSErrors:true});
  const ctx=await browser.newContext();
  try{
   const denied=await ctx.request.get(origin+'/');assert.equal(denied.status(),403);await denied.dispose();
   const identity=await fingerprint('dist-family-beta','f'.repeat(40),async route=>{
    const r=await ctx.request.get(origin+route,{headers:{authorization:'Bearer synthetic'}});try{assert.equal(r.status(),200,route);return await r.body();}finally{await r.dispose();}
   });
   assert(identity.files.length>=396);console.log('Rehearsed actual protected served files',identity.files.length,identity.frontendSha256);
  }finally{await ctx.close();}
  const journeys=await householdJourneys(browser,target,'synthetic');
  console.log('Rehearsed household journeys',Object.keys(journeys).sort().join(', '));
 }finally{await browser.close();await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));rmSync(dir,{recursive:true,force:true});}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
