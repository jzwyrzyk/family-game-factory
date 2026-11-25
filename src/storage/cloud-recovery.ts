import {recoveryHash,validateRecoveryArchive,type RecoveryArchive,type RecoveryScope} from './recovery-vault';
import {assertRecordValue,operationFingerprint,type DurableRecord,type RecordOperation,type RecordReceipt} from './record-contract';
export const BACKUP_DOMAINS=['profiles','games','creative','learning','artwork','conversation','rewards','notifications','backups'] as const;
export interface CloudRecoveryTransport {
 status():Promise<{version:1;family:string;profile:string;epoch:string;domains:readonly string[];guardian?:boolean;profiles:string[]}>;
 lookup(id:string):Promise<RecordReceipt|null>;commit(operation:RecordOperation):Promise<RecordReceipt>;
 read(collection:string,id:string,version?:number):Promise<DurableRecord|null>;
 page?(collection:string,after:string,limit:number):Promise<{records:DurableRecord[];next:string|null}>;
 changes(after:string,limit:number,epoch:string):Promise<{through:string;records:DurableRecord[];hasMore:boolean}>;
}
interface CloudPoint {schema:'jems.cloud-recovery.v1';manifest:RecoveryArchive['manifest'];chunks:{hash:string;ids?:string[];index?:number;count?:number}[]}
export async function requireCloudRecovery(transport:CloudRecoveryTransport){const status=await transport.status();if(status.version!==1||status.guardian!==true||typeof status.family!=='string'||typeof status.profile!=='string'||BACKUP_DOMAINS.some(domain=>!status.domains.includes(domain)))throw Error('A grown-up must approve all included data and recovery copies before using cloud recovery.');return status;}
async function commitOnce(transport:CloudRecoveryTransport,op:RecordOperation){const receipt=await transport.lookup(op.id)??await transport.commit(op);if(receipt.operation!==op.id||receipt.fingerprint!==await operationFingerprint(op)||JSON.stringify(receipt.versions)!==JSON.stringify(op.changes.map(c=>({id:c.id,collection:c.collection,version:1}))))throw Error('The cloud recovery receipt did not match. Keep the local copy.');}
/** Explicit, resumable metadata upload only. Every server operation rechecks
 * current family, device, guardian and each independently approved domain. */
export async function uploadCloudRecovery(archive:RecoveryArchive,transport:CloudRecoveryTransport):Promise<void>{
 await validateRecoveryArchive(archive,archive.manifest.scope);const status=await requireCloudRecovery(transport),scope={family:status.family,profile:status.profile},point:CloudPoint={schema:'jems.cloud-recovery.v1',manifest:archive.manifest,chunks:[]};
 if(archive.manifest.scope.audience!=='family'||!archive.manifest.scope.owners.includes(status.profile)||archive.manifest.scope.owners.some(owner=>!status.profiles?.includes(owner)))throw Error('This copy belongs to another workspace.');
 const entries=Object.entries(archive.chunks).sort(([a],[b])=>a.localeCompare(b));for(const [index,[hash,text]]of entries.entries())point.chunks.push({hash,index,count:Math.ceil(text.length/24000)});assertRecordValue(point);
 for(const [index,[hash,text]]of entries.entries())for(let start=0,n=0;start<text.length;start+=24000,n++){const id=`${archive.manifest.id}-${index}-${n}`;await commitOnce(transport,{id:'backup-'+id,scope,changes:[{collection:'recovery-chunks',id,expectedVersion:0,value:{schema:'jems.cloud-recovery-chunk.v1',point:archive.manifest.id,hash,text:text.slice(start,start+24000)}}]});}
 // The final immutable root is visible only after all original chunks have receipts.
 await commitOnce(transport,{id:'backup-'+archive.manifest.id+'-complete',scope,changes:[{collection:'recovery-points',id:archive.manifest.id,expectedVersion:0,value:point}]});
}
export async function readCloudRecovery(id:string,scope:RecoveryScope,transport:Pick<CloudRecoveryTransport,'read'>):Promise<RecoveryArchive>{
 const root=await transport.read('recovery-points',id,1);if(!root||root.deleted)throw Error('This cloud recovery point is unavailable.');
 const point=root.value as CloudPoint;
 if(point?.schema==='jems.cloud-recovery.v1'){
  if(point.manifest?.id!==id||!Array.isArray(point.chunks)||point.chunks.length>1200||new Set(point.chunks.map(x=>x.hash)).size!==point.chunks.length)throw Error('Cloud recovery manifest is damaged.');const chunks:Record<string,string>={};
  for(const part of point.chunks){if(!/^[a-f0-9]{64}$/.test(part.hash)||part.ids!==undefined&&(!Array.isArray(part.ids)||part.ids.length>5)||part.ids===undefined&&(!Number.isInteger(part.index)||part.index!<0||part.index!>=1200||!Number.isInteger(part.count)||part.count!<0||part.count!>5))throw Error('Cloud recovery chunk references are invalid.');const ids=part.ids??Array.from({length:part.count!},(_,n)=>`${id}-${part.index}-${n}`);let text='';for(const chunkId of ids){const row=await transport.read('recovery-chunks',chunkId,1),chunk=row?.value as {schema:string;point:string;hash:string;text:string};if(!row||row.deleted||chunk?.schema!=='jems.cloud-recovery-chunk.v1'||chunk.point!==id||chunk.hash!==part.hash||typeof chunk.text!=='string'||chunk.text.length>24000)throw Error('An original cloud record or picture is unavailable.');text+=chunk.text;}chunks[part.hash]=text;}
  const archive={manifest:point.manifest,chunks};await validateRecoveryArchive(archive,scope);return archive;
 }
 // Scheduled snapshots retain the entire validated archive in source groups.
 const saved=root.value as {schema:string;sources:{key:string;chunks:number;sha256:string;isNull:boolean}[]};
 if(saved?.schema!=='jems.recovery-point.v1'||!Array.isArray(saved.sources)||saved.sources.length>32)throw Error('Unsupported cloud recovery version.');const groups:Record<string,string>={};
 for(const [index,source] of saved.sources.entries()){if(!/^archive-\d{2}$/.test(source.key)||source.isNull||!Number.isInteger(source.chunks)||source.chunks<0||source.chunks>500)throw Error('Scheduled recovery source is invalid.');let text='';for(let n=0;n<source.chunks;n++){const row=await transport.read('recovery-chunks',`${id}-${index}-${n}`,1),chunk=(row?.value as {text?:unknown})?.text;if(!row||row.deleted||typeof chunk!=='string'||chunk.length>32000)throw Error('Scheduled recovery original is missing.');text+=chunk;}if(await recoveryHash(JSON.stringify(text))!==source.sha256)throw Error('Scheduled recovery integrity failed.');groups[source.key]=text;}
 const archive=JSON.parse(Object.keys(groups).sort().map(key=>groups[key]).join(''));await validateRecoveryArchive(archive,scope);return archive;
}
export async function listCloudRecovery(transport:CloudRecoveryTransport,after:string|null=null){const status=await requireCloudRecovery(transport);if(transport.page){const page=await transport.page('recovery-points',after??'',4);return {records:page.records.filter(r=>!r.deleted),next:page.next};}const page=await transport.changes(after??'0',10,status.epoch);return {records:page.records.filter(r=>!r.deleted&&r.collection==='recovery-points'),next:page.hasMore?page.through:null};}
