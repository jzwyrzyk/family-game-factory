/** Durable identity for one explicit initial Build. No credentials, preview
 * capability or executable code belongs in this record.
 */
export interface BuildRequestIdentity {
 gameId:string;baseRevisionId:string|null;prompt:string;clientRequestId:string;
}
export interface BuildSubmission extends BuildRequestIdentity {operation:'build';payloadHash:string}
export interface PendingBuildSubmission {owner:string;workspace:string;api:string;request:BuildSubmission}

/** Fixed field order is shared with the gateway's authenticated lookup. */
export function buildIdentityText(request:BuildRequestIdentity):string {
 return JSON.stringify(['build',request.clientRequestId,request.gameId,request.baseRevisionId,request.prompt]);
}
const id=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value);
export function validateBuildSubmission(value:unknown):BuildSubmission {
 const request=value as BuildSubmission;
 if(!request||Object.keys(request).some(key=>!['operation','gameId','baseRevisionId','prompt','clientRequestId','payloadHash'].includes(key))||
  request.operation!=='build'||!id(request.gameId)||!id(request.clientRequestId)||
  request.baseRevisionId!==null&&!id(request.baseRevisionId)||typeof request.prompt!=='string'||
  request.prompt.trim().length<5||request.prompt.length>2000||typeof request.payloadHash!=='string'||
  !/^[a-f0-9]{64}$/.test(request.payloadHash))throw Error('INVALID_SAVED_SUBMISSION');
 return {...request};
}
export async function identifyBuildRequest(request:BuildRequestIdentity):Promise<BuildSubmission> {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(buildIdentityText(request)));
 const payloadHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 return validateBuildSubmission({...request,operation:'build',payloadHash});
}
