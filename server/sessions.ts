import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Repository} from './pipeline/types';
import {signSession} from './pipeline/auth';
export interface Invitation {hash:string;familyId:string;expiresAt:number;used:boolean;purpose?:'trusted-device'}
export function sessionHandler(repo:Repository,config:{appOrigin:string;familyId:string;sessionKey:string}){return async(req:IncomingMessage,res:ServerResponse)=>{
 const cors={'Access-Control-Allow-Origin':config.appOrigin,'Access-Control-Allow-Credentials':'true','Vary':'Origin','Cache-Control':'no-store'};
 try{
  if(req.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Allow-Headers':'Content-Type,X-Factory-Request','Access-Control-Allow-Methods':'POST'});res.end();return;}
  if(req.method!=='POST'||req.headers['x-factory-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw Error('FORBIDDEN');let raw='';for await(const c of req){raw+=c;if(raw.length>1000)throw Error('LIMIT');}const input=JSON.parse(raw);if(Object.keys(input).some(k=>k!=='invitation')||typeof input.invitation!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(input.invitation))throw Error('INVALID_INVITATION');
  const hash=createHash('sha256').update(input.invitation).digest('hex');await repo.transaction(state=>{const invite=state.invitations?.find(x=>x.hash===hash&&x.familyId===config.familyId);if(!invite||invite.used||invite.expiresAt<=Date.now()||invite.purpose==='trusted-device')throw Error('INVALID_INVITATION');invite.used=true;return true;});
  const expiresAt=Date.now()+7*86400000,token=signSession({subject:'family-designer',familyId:config.familyId,role:'designer',expiresAt},config.sessionKey);
  res.writeHead(200,{...cors,'Content-Type':'application/json','Set-Cookie':`factory_session=${token}; Path=/v1; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=604800`});res.end(JSON.stringify({connected:true,expiresAt}));
 }catch{res.writeHead(403,{...cors,'Content-Type':'application/json'});res.end(JSON.stringify({errorCode:'INVALID_INVITATION'}));}
};}
