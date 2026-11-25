/** Pure versioned recovery format, hashes and scope validation. No browser storage or network. */
export const RECOVERY_DB='jems-recovery-vault-v1';
const CHUNK=96_000, MAX_BYTES=96*1024*1024;
export interface RecoveryScope {origin:string;audience:string;owners:string[]}
export interface RecoveryPart {name:string;sha256:string;size:number;chunks:string[]}
export interface RecoveryPoint {schema:'jems.complete-backup.v1';id:string;scope:RecoveryScope;createdAt:string;label:string;parts:RecoveryPart[];checksum:string}
export interface RecoveryArchive {manifest:RecoveryPoint;chunks:Record<string,string>}
export interface RestoreReceipt {id:string;pointId:string;scope:string;phase:'prepared'|'art-restored'|'complete';rollbackId:string;updatedAt:string}
export const recoveryHash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function recoveryScopeKey(scope:RecoveryScope):string {
 if(!scope||typeof scope.origin!=='string'||new URL(scope.origin).origin!==scope.origin||!Array.isArray(scope.owners)||scope.owners.length<1||scope.owners.length>6||new Set(scope.owners).size!==scope.owners.length||scope.owners.some(x=>typeof x!=='string'||!x||x.length>120)||scope.audience!=='family'&&!/^adult:[a-f0-9-]{36}$/i.test(scope.audience)||scope.audience!=='family'&&(scope.owners.length!==1||scope.owners[0]!==scope.audience)||scope.audience==='family'&&scope.owners.some(x=>x.startsWith('adult:')))throw Error('Recovery ownership is invalid.');
 return JSON.stringify([scope.origin,scope.audience]);
}
function body(point:RecoveryPoint){const {checksum,...rest}=point;return rest;}
export async function buildRecoveryArchive(scope:RecoveryScope,label:string,values:Record<string,string>,id:string=crypto.randomUUID(),createdAt=new Date().toISOString()):Promise<RecoveryArchive>{
 recoveryScopeKey(scope);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||typeof label!=='string'||label.length>80||!Number.isFinite(Date.parse(createdAt)))throw Error('Recovery point details are invalid.');
 const entries=Object.entries(values).sort(([a],[b])=>a.localeCompare(b));if(!entries.length||entries.length>32)throw Error('Recovery point has unsupported contents.');
 const chunks:Record<string,string>={},parts:RecoveryPart[]=[];let total=0;
 for(const [name,text] of entries){if(!/^[a-zA-Z0-9:_-]{1,160}$/.test(name)||typeof text!=='string')throw Error('Recovery source is invalid.');const size=new TextEncoder().encode(text).byteLength;total+=size;if(total>MAX_BYTES)throw Error('This recovery point is too large. Keep the original records and use a smaller approved scope.');const ids:string[]=[];for(let i=0;i<text.length;){let end=Math.min(text.length,i+CHUNK);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;const chunk=text.slice(i,end),sha=await recoveryHash(chunk);chunks[sha]=chunk;ids.push(sha);i=end;}parts.push({name,size,sha256:await recoveryHash(text),chunks:ids});}
 const manifest:RecoveryPoint={schema:'jems.complete-backup.v1',id,scope:structuredClone(scope),createdAt,label,parts,checksum:''};manifest.checksum=await recoveryHash(JSON.stringify(body(manifest)));return {manifest,chunks};
}
export async function validateRecoveryArchive(archive:RecoveryArchive,scope:RecoveryScope):Promise<Record<string,string>>{
 const point=archive?.manifest;if(!point||point.schema!=='jems.complete-backup.v1'||recoveryScopeKey(point.scope)!==recoveryScopeKey(scope)||!hash(point.checksum)||!Array.isArray(point.parts)||!point.parts.length||point.parts.length>32||!Number.isFinite(Date.parse(point.createdAt))||!/^[a-zA-Z0-9_-]{1,100}$/.test(point.id)||typeof point.label!=='string'||point.label.length>80||await recoveryHash(JSON.stringify(body(point)))!==point.checksum)throw Error('This recovery point is damaged, belongs to another family or uses an unsupported version.');
 if(!archive.chunks||typeof archive.chunks!=='object'||Array.isArray(archive.chunks))throw Error('Recovery chunks are invalid.');if(point.parts.some(part=>!part||!Array.isArray(part.chunks)||part.chunks.length>Math.ceil(MAX_BYTES/CHUNK)))throw Error('The recovery manifest is incomplete.');const referenced=new Set(point.parts.flatMap(part=>Array.isArray(part?.chunks)?part.chunks:[]));if(Object.keys(archive.chunks).length!==referenced.size||Object.keys(archive.chunks).some(key=>!referenced.has(key)||!hash(key)))throw Error('Recovery contains unverified extra records.');
 const values:Record<string,string>={},seen=new Set<string>();let total=0;
 for(const part of point.parts){if(!part||!/^[a-zA-Z0-9:_-]{1,160}$/.test(part.name)||seen.has(part.name)||!hash(part.sha256)||!Number.isInteger(part.size)||part.size<0||!Array.isArray(part.chunks)||part.chunks.length>Math.ceil(MAX_BYTES/CHUNK))throw Error('The recovery manifest is incomplete.');seen.add(part.name);total+=part.size;if(total>MAX_BYTES)throw Error('Recovery size exceeds the supported limit.');let value='';for(const id of part.chunks){const chunk=archive.chunks?.[id];if(!hash(id)||typeof chunk!=='string'||chunk.length>CHUNK||await recoveryHash(chunk)!==id)throw Error('An original record or image is missing or damaged. Nothing was replaced.');if(value.length+chunk.length>part.size)throw Error('Recovery content exceeds its declared size.');value+=chunk;}if(new TextEncoder().encode(value).byteLength!==part.size||await recoveryHash(value)!==part.sha256)throw Error('Recovery checksum does not match. Nothing was replaced.');values[part.name]=value;}
 return values;
}
