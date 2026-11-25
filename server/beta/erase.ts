import {Firestore} from '@google-cloud/firestore';
import {Storage} from '@google-cloud/storage';
import {readFile} from 'node:fs/promises';
import {uuid,workspaceOf,defaultCapabilities,type Family} from './model';

export function deletionTarget(f:Family,id:string,requestId:string){
 if(!uuid(id)||!uuid(requestId)||f.id!==id||f.status!=='revoked'||f.request?.kind!=='deletion'||
  f.request.id!==requestId||!['deleting','completed'].includes(f.request.state)||!f.request.approvedAt)throw Error('VERIFIED_DELETION_CASE_REQUIRED');
 return workspaceOf(f);
}
// Dedicated operations identity. Gateway and administrator dashboard cannot list object bytes.
export async function processDeletion(db:Firestore,storage:Storage,config:{environment:string;artifactBucket:string},id:string,requestId:string,apply:boolean){
 if(!/^[-a-z0-9]{1,30}$/.test(config.environment)||!uuid(id)||!uuid(requestId))throw Error('INVALID_CASE');
 const root=db.doc('factoryBeta/'+config.environment),family=root.collection('families').doc(id);
 const snapshot=await family.get();if(!snapshot.exists)throw Error('INVALID_CASE');
 const f=snapshot.data() as Family,workspace=deletionTarget(f,id,requestId);
 if(!apply)return {authorized:true,workspace,apply:false};
 const prefix='factory/'+workspace+'/',bucket=storage.bucket(config.artifactBucket);
 // Include noncurrent object generations. Bucket soft-delete holds and backup retention are tracked separately.
 for(;;){
  const [files]=await bucket.getFiles({prefix,versions:true,autoPaginate:false,maxResults:100});
  if(!files.length)break;
  for(const file of files){if(!file.name.startsWith(prefix)||!file.metadata.generation)throw Error('OBJECT_SCOPE_UNCONFIRMED');
   await file.delete({ifGenerationMatch:file.metadata.generation,ignoreNotFound:true});}
 }
 await db.recursiveDelete(db.doc('factoryWorkspaces/'+workspace));
 for(const collection of ['verification','jobs']){
  for(;;){const page=await root.collection(collection).where('familyId','==',id).limit(300).get();if(page.empty)break;
   const batch=db.batch();for(const row of page.docs)batch.delete(row.ref);await batch.commit();}
 }
 for(const path of ['acknowledgments','metadata','usage'])await db.recursiveDelete(family.collection(path));
 await db.runTransaction(async tx=>{
  const current=(await tx.get(family)).data() as Family;deletionTarget(current,id,requestId);
  tx.set(family,{id,workspace,status:'revoked',guardian:{id:'retired',contactRef:'retired'},profiles:[],capabilities:defaultCapabilities(),
   allowance:0,paused:true,generationPaused:true,plays:[],createdAt:current.createdAt,request:{...current.request,state:'completed'}});
 });
 return {authorized:true,workspace,apply:true};
}
async function main(){
 const [mode,id,requestId]=process.argv.slice(2);
 if(!['--check','--apply-verified-case'].includes(mode)||!process.env.JEMS_PRIVACY_OPERATIONS_CONFIG)throw Error('OPERATIONS_CONFIGURATION_REQUIRED');
 const cfg=JSON.parse(await readFile(process.env.JEMS_PRIVACY_OPERATIONS_CONFIG,'utf8'));
 if(typeof cfg.projectId!=='string'||typeof cfg.artifactBucket!=='string'||!cfg.projectId||!cfg.artifactBucket)throw Error('OPERATIONS_CONFIGURATION_REQUIRED');
 const result=await processDeletion(new Firestore({projectId:cfg.projectId}),new Storage({projectId:cfg.projectId}),cfg,id,requestId,mode==='--apply-verified-case');
 console.log(JSON.stringify({verified:result.authorized,applied:result.apply}));
}
if(process.argv[1]?.endsWith('/beta/erase.ts'))void main().catch(()=>{console.error('Privacy case incomplete. The case can be checked and retried.');process.exitCode=1;});
