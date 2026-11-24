import {familyPreview} from './beta/preview';
import {platformMode} from './beta/model';
import {firestoreStore} from './beta/documents';
import {GcsPrivateArtifacts} from './storage/artifacts';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {previewHandler} from './pipeline/http';
import {requireResourceAudience} from './pipeline/audience';
import {startBootstrap} from './bootstrap';
export interface PreviewConfig {previewOrigin:string;previewKey:string;projectId:string;artifactBucket?:string;workspace:string}
export function createPreview(config:PreviewConfig,repo:Pick<FirestoreRepository,'snapshot'>){
 if(Object.keys(config).some(key=>!['previewOrigin','previewKey','projectId','artifactBucket','workspace'].includes(key)))throw Error('PREVIEW_CONFIG_MUST_NOT_CONTAIN_GATEWAY_SECRETS');
 const origin=new URL(config.previewOrigin);if(origin.protocol!=='https:'||origin.origin!==config.previewOrigin)throw Error('HTTPS_ORIGIN_REQUIRED');
 const handler=previewHandler({revision:async(session,id)=>{const state=await repo.snapshot(),r=state.revisions.find(x=>x.id===id&&x.game);if(!r)throw Error('NOT_FOUND');requireResourceAudience(state,session,r);return r;}},config);
 return async(req:Parameters<typeof handler>[0],res:Parameters<typeof handler>[1])=>{
  if(req.headers.host!==origin.host){res.writeHead(403);res.end();return;}
  if(req.url==='/health'){
   try{await repo.snapshot();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:true,paidExecution:false}));}
   catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:false,paidExecution:false}));}return;
  }
  await handler(req,res);
 };
}
async function main(){
 if(process.env.FACTORY_BOOTSTRAP==='true'){startBootstrap();return;}
 if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_PREVIEW_CONFIG_REQUIRED');
 const raw=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8'));
 if(platformMode(raw.platformMode)==='PRIVATE_FAMILY_BETA'){
  if(Object.keys(raw).some(k=>!['platformMode','environment','hubOrigin','previewOrigin','previewKey','projectId','artifactBucket'].includes(k))||!raw.projectId||!raw.artifactBucket)throw Error('PREVIEW_CONFIGURATION_REQUIRED');
  const handle=familyPreview(raw,firestoreStore(new Firestore({projectId:raw.projectId})),w=>new GcsPrivateArtifacts(raw.artifactBucket,w));
  createServer((req,res)=>{void handle(req,res);}).listen(Number(process.env.PORT)||8080);return;
 }
 const {platformMode:_householdMode,...config}=raw as PreviewConfig&{platformMode?:string};
 const repo=new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace,config.artifactBucket?new GcsPrivateArtifacts(config.artifactBucket,config.workspace):undefined);
 const handler=createPreview(config,repo);
 createServer((req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Private preview unavailable');});}).listen(Number(process.env.PORT)||8080);
}
if(process.argv.some(x=>/[/\\]preview-server\.ts$/.test(x)))void main().catch(()=>{console.error('Private preview startup failed; no credentials logged.');process.exitCode=1});
