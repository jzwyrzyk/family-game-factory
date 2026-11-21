import {GcsPrivateArtifacts} from './storage/artifacts';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {previewHandler} from './pipeline/http';
import {requireResourceAudience} from './pipeline/audience';
import {startBootstrap} from './bootstrap';
import {validateDevAccess,DevIapVerifier,assertDevProjectBinding,devCloudTarget,devServiceOrigin,type DevAccessConfig} from './dev-access';
import type {JWTVerifyGetKey} from 'jose';
export interface PreviewConfig {previewOrigin:string;previewKey:string;projectId:string;artifactBucket?:string;workspace:string;devAccess?:DevAccessConfig}
export function previewDevPolicy(config:PreviewConfig){
 return config.devAccess!==undefined||process.env.FACTORY_ENVIRONMENT==='development'?
  validateDevAccess(config.devAccess!,{projectId:config.projectId,workspace:config.workspace,familyId:config.devAccess?.syntheticFamilyId||'',artifactBucket:config.artifactBucket,iapService:'jems-dev-preview'}):undefined;
}
export function createPreview(config:PreviewConfig,repo:Pick<FirestoreRepository,'snapshot'>,iapKeys?:JWTVerifyGetKey){
 if(Object.keys(config).some(key=>!['previewOrigin','previewKey','projectId','artifactBucket','workspace','devAccess'].includes(key)))throw Error('PREVIEW_CONFIG_MUST_NOT_CONTAIN_GATEWAY_SECRETS');
 const origin=new URL(config.previewOrigin);if(origin.protocol!=='https:'||origin.origin!==config.previewOrigin)throw Error('HTTPS_ORIGIN_REQUIRED');
 const dev=previewDevPolicy(config),iap=dev?new DevIapVerifier(dev,iapKeys):undefined;
 if(iapKeys&&process.env.K_SERVICE)throw Error('DEV_TEST_KEYS_FORBIDDEN_IN_CLOUD');
 if(dev&&config.previewOrigin!==devServiceOrigin(devCloudTarget(dev),'preview'))throw Error('DEV_PREVIEW_ORIGIN_REQUIRED');
 const handler=previewHandler({revision:async(session,id)=>{const state=await repo.snapshot(),r=state.revisions.find(x=>x.id===id&&x.game);if(!r)throw Error('NOT_FOUND');requireResourceAudience(state,session,r);return r;}},config);
 return async(req:Parameters<typeof handler>[0],res:Parameters<typeof handler>[1])=>{
  if(req.headers.host!==origin.host){res.writeHead(403);res.end();return;}
  if(req.url==='/health'){
   try{await repo.snapshot();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:true,paidExecution:false}));}
   catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:false,paidExecution:false}));}return;
  }
  if(iap){try{await iap.verify(req.headers['x-goog-iap-jwt-assertion']);}catch{res.writeHead(403,{'Cache-Control':'no-store'});res.end();return;}}
  await handler(req,res);
 };
}
async function main(){
 if(process.env.FACTORY_BOOTSTRAP==='true'){startBootstrap();return;}
 if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_PREVIEW_CONFIG_REQUIRED');
 const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as PreviewConfig;
 const dev=previewDevPolicy(config);
 if(dev){if(process.env.K_SERVICE!=='jems-dev-preview')throw Error('DEV_PREVIEW_SERVICE_REQUIRED');await assertDevProjectBinding(dev);}
 const repo=new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 const handler=createPreview(config,repo);
 createServer((req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Private preview unavailable');});}).listen(Number(process.env.PORT)||8080);
}
if(process.argv.some(x=>/[/\\]preview-server\.ts$/.test(x)))void main().catch(()=>{console.error('Private preview startup failed; no credentials logged.');process.exitCode=1});
