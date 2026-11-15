import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {FirestoreRepository} from './pipeline/firestore';
import {previewHandler} from './pipeline/http';
import {requireFamily} from './contracts/api';
interface PreviewConfig {previewOrigin:string;previewKey:string;projectId:string;workspace:string}
async function main(){
 if(!process.env.FACTORY_PRIVATE_CONFIG)throw Error('PRIVATE_PREVIEW_CONFIG_REQUIRED');const config=JSON.parse(await readFile(process.env.FACTORY_PRIVATE_CONFIG,'utf8')) as PreviewConfig;if(new URL(config.previewOrigin).protocol!=='https:')throw Error('HTTPS_REQUIRED');
 const repo=new FirestoreRepository(new Firestore({projectId:config.projectId}),config.workspace);const handler=previewHandler({revision:async(session,id)=>{const r=(await repo.snapshot()).revisions.find(x=>x.id===id&&x.game);if(!r)throw Error('NOT_FOUND');requireFamily(session,r);return r;}},config);
 createServer((req,res)=>{if(req.headers.host!==new URL(config.previewOrigin).host){res.writeHead(403);res.end();return;}void handler(req,res);}).listen(Number(process.env.PORT)||8080);
}
void main().catch(()=>{console.error('Private preview startup failed; no credentials logged.');process.exitCode=1});
