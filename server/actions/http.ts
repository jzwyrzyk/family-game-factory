import type {IncomingMessage,ServerResponse} from 'node:http';
import type {ActionCoordinator} from './coordinator';
import type {GitHubOIDCVerifier} from './identity';
import {readJsonBody} from '../http-json';
function requestRejected(error:unknown){
 if(!(error instanceof Error))return false;
 const code=(error as Error&{code?:string|number}).code;
 // Firestore/gRPC retries and JWKS transport failures are service uncertainty,
 // not evidence that an otherwise trusted worker lost its authorization.
 if([4,8,10,13,14,'deadline-exceeded','resource-exhausted','aborted','internal','unavailable','ERR_JWKS_TIMEOUT'].includes(code!))return false;
 return error instanceof SyntaxError||/^[A-Z][A-Z0-9_]*(?::[^\n]*)?$/.test(error.message)||
  typeof code==='string'&&/^(?:ERR_JWT_|ERR_JWS_|ERR_JOSE_ALG_NOT_ALLOWED$|ERR_JWKS_NO_MATCHING_KEY$|ERR_JWKS_MULTIPLE_MATCHING_KEYS$)/.test(code);
}
export function workerHandler(coordinator:ActionCoordinator,verifier:Pick<GitHubOIDCVerifier,'verify'>){return async(req:IncomingMessage,res:ServerResponse)=>{try{const match=new URL(req.url!,'http://worker').pathname.match(/^\/v1\/worker\/jobs\/([\w-]+)\/(claim|report|status)$/);if(!match)throw Error('NOT_FOUND');const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error('WORKER_FORBIDDEN');const identity=await verifier.verify(token);const body=await readJsonBody(req,10*1024*1024,{limitError:'BODY_LIMIT',emptyObject:true});let result;
 if(match[2]==='status'&&req.method==='GET')result=await coordinator.status(match[1],identity);else{if(req.method!=='POST'||match[2]==='status'||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['attempt','stage','report'].includes(k))||!Number.isInteger(body.attempt)||(identity.dispatchAttempt!==undefined&&identity.dispatchAttempt!==body.attempt)||!['generate','test','review'].includes(body.stage)||match[2]==='report'&&(!body.report||typeof body.report!=='object'||Array.isArray(body.report)))throw Error('INVALID_REQUEST');result=match[2]==='claim'?await coordinator.claim(match[1],body.attempt,body.stage,identity,typeof req.headers['x-factory-model-policy']==='string'?req.headers['x-factory-model-policy']:undefined):await coordinator.report(match[1],body.attempt,body.stage,identity,body.report);}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch(error){const rejected=requestRejected(error);res.writeHead(rejected?403:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({errorCode:rejected?'WORKER_REQUEST_REJECTED':'WORKER_UNAVAILABLE'}));}};}
