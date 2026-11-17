/**
 * Private IAM-only, stateless conversation inference endpoint.
 * There is deliberately no browser CORS, family login or uploaded audio.
 * The authenticated gateway validates the family and reserves the budget.
 * This service validates the Google workload token independently.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {boundedContext,approved,type CoachConfig,type CoachProvider} from './service';
import {validateCoachReply} from '../../src/studio/design';
import {coachConfig} from './http';
import {validPrivateCoachOrigin} from './broker';
import {VertexChildCoachProvider} from './vertex';

export interface PrivateCoachHostConfig{
 origin:string;gatewayServiceAccount:string;coach:CoachConfig;
}
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogleGateway(token:string,settings:PrivateCoachHostConfig):Promise<boolean>{
 if(!token||token.length>6000||!validPrivateCoachOrigin(settings.origin))return false;
 if(!/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(settings.gatewayServiceAccount))return false;
 const {payload}=await jwtVerify(token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],
  audience:settings.origin,algorithms:['RS256']});
 return payload.email===settings.gatewayServiceAccount&&payload.email_verified===true;
}
export function privateCoachHandler(settings:PrivateCoachHostConfig,provider:CoachProvider,
 verify:(token:string,settings:PrivateCoachHostConfig)=>Promise<boolean>=verifyGoogleGateway){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(status:number,payload:unknown)=>{
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   res.end(JSON.stringify(payload));
  };
  try{
   if(!approved(settings.coach)||!validPrivateCoachOrigin(settings.origin))throw Error('COACH_UNAVAILABLE');
   if(req.method!=='POST'||req.url!=='/internal/coach/turn'||
    !req.headers['content-type']?.startsWith('application/json'))throw Error('FORBIDDEN');
   const token=req.headers.authorization?.match(/^Bearer ([-\w.]+)$/)?.[1];
   if(!token||!await verify(token,settings))throw Error('FORBIDDEN');
   let text='';for await(const chunk of req){
    text+=chunk;
    if(Buffer.byteLength(text)>35000)throw Error('INVALID_REQUEST');
   }
   const raw=JSON.parse(text);
   if(!raw||Object.keys(raw).length!==1||!Object.hasOwn(raw,'context'))throw Error('INVALID_REQUEST');
   const context=boundedContext(raw.context);
   const output=await provider.complete(context,AbortSignal.timeout(18000));
   if(!Number.isSafeInteger(output.usedMicroUsd)||output.usedMicroUsd<0||
     output.usedMicroUsd>settings.coach.maxTurnMicroUsd)throw Error('COACH_PROVIDER_FAILED');
   const reply=validateCoachReply(output.reply,context);
   send(200,{reply,usedMicroUsd:output.usedMicroUsd});
  }catch(err){
   const code=(err as Error).message;
   // Never expose model text, profile data, authorization tokens or provider diagnostics.
   send(code==='FORBIDDEN'?403:code==='COACH_UNAVAILABLE'?503:
    code==='COACH_REFUSED'?422:code==='RATE_LIMIT'?429:400,
    {errorCode:['COACH_UNAVAILABLE','COACH_REFUSED','RATE_LIMIT'].includes(code)?code:'COACH_REQUEST_FAILED'});
  }
 };
}
async function main(){
 // Private coach runs only after a separately approved IAM/deployment/retention review.
 const env=process.env,config=coachConfig(env),origin=env.FACTORY_COACH_BROKER_ORIGIN||'';
 const gatewayServiceAccount=env.FACTORY_COACH_GATEWAY_SA||'';
 const projectId=env.FACTORY_COACH_VERTEX_PROJECT||'';
 if(!approved(config)||!validPrivateCoachOrigin(origin)||
  !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(gatewayServiceAccount)||
  !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)||env.FACTORY_COACH_API_KEY)
  throw Error('PRIVATE_COACH_REVIEW_REQUIRED');
 const provider=new VertexChildCoachProvider(config,{
  projectId,model:config.model,maxOutputTokens:config.maxOutputTokens,
  inputMicroUsdPerMillion:config.inputMicroUsdPerMillion,
  outputMicroUsdPerMillion:config.outputMicroUsdPerMillion,
  maxTurnMicroUsd:config.maxTurnMicroUsd
 });
 createServer((req,res)=>{
  void privateCoachHandler({origin,gatewayServiceAccount,coach:config},provider)(req,res)
   .catch(()=>{if(!res.headersSent)res.writeHead(503);res.end();});
 }).listen(Number(env.PORT)||8080);
}
if(process.argv.some(x=>/[/\\]private-http\.ts$/.test(x)))void main().catch(()=>{
 console.error('Private coach refused startup. No provider or identity secrets were logged.');
 process.exitCode=1;
});
