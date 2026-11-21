/** Dedicated private Cloud Run inference boundary, separate from the public
 * gateway, untrusted game sandbox, preview and GitHub generation worker.
 * This service is PRIVATE behind Cloud Run IAM and additionally validates the
 * calling gateway identity. No model request can run unless all child privacy,
 * model approval and family allowance gates pass.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {approved,validateCoachContext,type CoachProvider} from './service';
import {OpenAICoachProvider,type PrivateCoachConfig} from './private-provider';
import {validateCoachReply} from '../../src/studio/design';
import {privateCoachOrigin} from './private-bridge';
import {speechApproved,speechConfig,validateAudio,type SpeechProvider,type SpeechConfig,AUDIO_MAX_BYTES} from './speech';
import {GooglePrivateSpeech} from './private-speech-provider';
import {adultPilotFlags} from '../adult-pilot';
import {validateDevProject,devServiceOrigin,assertDevProjectBinding,type DevCloudTarget} from '../dev-access';

export type VerifyCaller=(token:string)=>Promise<boolean>;
export function googleCallerVerifier(audience:string,approvedServiceAccount:string,development?:DevCloudTarget):VerifyCaller {
 const expected=development?`jems-dev-gateway@${development.projectId}.iam.gserviceaccount.com`:'factory-gateway@family-game-factory-jzw.iam.gserviceaccount.com';
 if(!/^https:\/\/[^/?#]+$/.test(audience)||approvedServiceAccount!==expected||
  (development&&audience!==devServiceOrigin(development,'coach')))
  throw Error('PRIVATE_COACH_IDENTITY_REQUIRED');
 const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return async(token)=>{
  const {payload}=await jwtVerify(token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience,algorithms:['RS256']});
  return payload.email===approvedServiceAccount&&payload.email_verified===true;
 };
}
export interface PrivateCoachRuntime {
 config:PrivateCoachConfig;
 enabled:boolean;
 verifyCaller:VerifyCaller;
 provider:CoachProvider;
 maxConcurrent?:number;
 audio?:SpeechProvider;
 audioConfig?:SpeechConfig;
}
export function privateCoachHandler(runtime:PrivateCoachRuntime){
 let active=0;
 const send=(res:ServerResponse,status:number,data:object)=>{
  if(res.headersSent||res.writableEnded||res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(data));
 };
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const aborted=new AbortController();
  res.once('close',()=>{if(!res.writableEnded)aborted.abort();});
  try{
   if(req.headers.origin||req.headers['x-factory-request']!=='1')throw Error('FORBIDDEN');
   const path=new URL(req.url||'','http://private').pathname;
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{40,12000})$/)?.[1];
   if(!token||!await runtime.verifyCaller(token))throw Error('FORBIDDEN');
   const available=runtime.enabled&&approved(runtime.config)&&
    !!runtime.config.apiKey&&runtime.config.apiKey.length>=16;
   // Both readiness probes authenticate the exact gateway identity.
   // No prompt, child ID, audio or provider request is included.
   if(path==='/v1/private-coach/status'&&req.method==='GET')
    return send(res,200,{available,mode:available?'model':'unavailable'});
   const voiceReady=!!runtime.audio&&!!runtime.audioConfig&&speechApproved(runtime.audioConfig);
   if(path==='/v1/private-coach/audio/status'&&req.method==='GET')
    return send(res,200,{available:voiceReady,mode:voiceReady?'private':'unavailable'});
   const isAudio=path==='/v1/private-coach/audio';
   if((path!=='/v1/private-coach/complete'&&!isAudio)||req.method!=='POST'||
    !String(req.headers['content-type']||'').startsWith('application/json'))throw Error('FORBIDDEN');
   if(isAudio?!voiceReady:!available)throw Error(isAudio?'AUDIO_UNAVAILABLE':'COACH_UNAVAILABLE');
   if(active>=(runtime.maxConcurrent||4))throw Error('RATE_LIMIT');
   let data='';
   for await(const chunk of req){
    data+=String(chunk);
    if(Buffer.byteLength(data,'utf8')>(isAudio?440000:40000))throw Error('INVALID_REQUEST');
   }
   let input:any;
   try{input=JSON.parse(data);}catch{throw Error('INVALID_REQUEST');}
   if(isAudio){
    if(!input||input.version!==1||
     Object.keys(input).length!==3||
     Object.keys(input).some(k=>!['version','audio','mime'].includes(k))||
     typeof input.audio!=='string'||typeof input.mime!=='string'||
     input.audio.length>428000||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio))
      throw Error('INVALID_AUDIO');
    const bytes=Buffer.from(input.audio,'base64');
    if(bytes.length>AUDIO_MAX_BYTES||bytes.toString('base64')!==input.audio)throw Error('INVALID_AUDIO');
    const mime=validateAudio(bytes,input.mime);
    active++;
    try{
     const text=await runtime.audio!.transcribe(bytes,mime,
      AbortSignal.any([aborted.signal,AbortSignal.timeout(15000)]));
     if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('AUDIO_NO_SPEECH');
     return send(res,200,{text});
    }finally{active--;}
   }
   if(!input||Object.keys(input).some(k=>!['version','context'].includes(k))||input.version!==1)throw Error('INVALID_REQUEST');
   const context=validateCoachContext(input.context);
   const serialized=JSON.stringify(context);
   if(serialized.length>runtime.config.maxInputChars)throw Error('INVALID_REQUEST');
   if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk-|ghp_|github_pat_)\S+|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(serialized))throw Error('PRIVATE_INFORMATION');
   active++;
   try{
    const {reply,usedMicroUsd}=await runtime.provider.complete(context,
     AbortSignal.any([aborted.signal,AbortSignal.timeout(25000)]));
    if(!Number.isSafeInteger(usedMicroUsd)||usedMicroUsd<0||usedMicroUsd>runtime.config.maxTurnMicroUsd)
     throw Error('COACH_PROVIDER_FAILED');
    const validated=validateCoachReply(reply,context);
    return send(res,200,{reply:validated,usedMicroUsd});
   }finally{active--;}
  }catch(error){
   const code=(error as Error).message;
   return send(res,code==='FORBIDDEN'?403:code==='INVALID_REQUEST'||code==='PRIVATE_INFORMATION'||code==='INVALID_AUDIO'?400:
    code==='RATE_LIMIT'?429:code==='COACH_REFUSED'||code==='AUDIO_NO_SPEECH'?422:503,{errorCode:
    ['FORBIDDEN','INVALID_REQUEST','PRIVATE_INFORMATION','INVALID_AUDIO','RATE_LIMIT','COACH_REFUSED','AUDIO_NO_SPEECH'].includes(code)?code:'COACH_UNAVAILABLE'});
  }
 };
}
function privateConfig(env:NodeJS.ProcessEnv):PrivateCoachConfig {
 return {
  adultPilot:adultPilotFlags(env),
  enabled:env.FACTORY_COACH_APPROVED==='true',
  privacyApproved:env.FACTORY_COACH_PRIVACY_APPROVED==='true',
  moderationApproved:env.FACTORY_COACH_SAFEGUARDS_APPROVED==='true',
  zdrVerified:env.FACTORY_COACH_ZDR_VERIFIED==='true',
  privateExecutionApproved:env.FACTORY_COACH_PRIVATE_EXECUTION_APPROVED==='true',
  model:env.FACTORY_COACH_MODEL||'',
  apiKey:env.FACTORY_COACH_PRIVATE_OPENAI_API_KEY||'',
  maxInputChars:Number(env.FACTORY_COACH_INPUT_CHARS||16000),
  maxOutputTokens:Number(env.FACTORY_COACH_OUTPUT_TOKENS||800),
  maxTurnMicroUsd:Number(env.FACTORY_COACH_MAX_MICRO_USD||0),
  inputMicroUsdPerMillion:Number(env.FACTORY_COACH_INPUT_PRICE||0),
  outputMicroUsdPerMillion:Number(env.FACTORY_COACH_OUTPUT_PRICE||0),
  pricesReviewedAt:env.FACTORY_COACH_PRICES_REVIEWED||''
 };
}
/** Validate deployment wiring without printing configuration or touching
 * secrets. A first, keyless, fully inactive Cloud Run revision can start.
 * Later activation requires independently verified ZDR, consent, safeguarding,
 * a dedicated scoped API key, current prices and the approved gateway identity.
 */
export function dedicatedCoachRuntime(env:NodeJS.ProcessEnv){
 const development=devCoachTarget(env);
 if(env.K_SERVICE!==(development?'jems-dev-coach':'factory-coach-private')||env.FACTORY_COACH_EXECUTION_ENV!=='dedicated-cloud-run')
  throw Error('DEDICATED_PRIVATE_CLOUD_RUN_REQUIRED');
 if(env.FACTORY_OPENAI_API_KEY||env.FACTORY_COACH_API_KEY)
  throw Error('GENERATION_OR_GATEWAY_KEY_FORBIDDEN_IN_PRIVATE_COACH');
 const config=privateConfig(env),audioConfig=speechConfig(env);
 if(development&&audioConfig.projectId&&audioConfig.projectId!==development.projectId)throw Error('DEV_SPEECH_PROJECT_REQUIRED');
 const requested=env.FACTORY_COACH_APPROVED==='true';
 const audioRequested=env.FACTORY_COACH_AUDIO_APPROVED==='true';
 if(!requested&&!audioRequested){
  if(config.apiKey)throw Error('COACH_SECRET_FORBIDDEN_WHILE_INACTIVE');
  return {config,enabled:false,verifyCaller:async(_token:string)=>false,
   provider:new OpenAICoachProvider(config)};
 }
 if(requested&&(!approved(config)||!config.apiKey||config.apiKey.length<16))
  throw Error('COACH_APPROVAL_REQUIRED');
 if(!requested&&config.apiKey)throw Error('COACH_SECRET_FORBIDDEN_WHILE_INACTIVE');
 if(audioRequested&&!speechApproved(audioConfig))throw Error('AUDIO_APPROVAL_REQUIRED');
 const audience=env.FACTORY_COACH_PRIVATE_AUDIENCE||'';
 const caller=env.FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT||'';
 if(privateCoachOrigin(audience,development)!==audience)throw Error('COACH_AUDIENCE_REQUIRED');
 return {config,enabled:requested,verifyCaller:googleCallerVerifier(audience,caller,development),
  ...(development?{maxConcurrent:1}:{}),
  provider:new OpenAICoachProvider(config),
  audioConfig,
  audio:audioRequested?new GooglePrivateSpeech(audioConfig.projectId):undefined};
}
export function devCoachTarget(env:NodeJS.ProcessEnv):DevCloudTarget|undefined{
 const requested=env.FACTORY_ENVIRONMENT==='development'||env.FACTORY_DEV_PROJECT_ID!==undefined||env.FACTORY_DEV_PROJECT_NUMBER!==undefined||env.FACTORY_DEV_REGION!==undefined;
 if(!requested)return undefined;
 if(env.FACTORY_ENVIRONMENT!=='development')throw Error('DEV_ACCESS_CONFIG_REQUIRED');
 const project=validateDevProject(env.FACTORY_DEV_PROJECT_ID||'',env.FACTORY_DEV_PROJECT_NUMBER||'');
 const target={...project,region:env.FACTORY_DEV_REGION||''};devServiceOrigin(target,'coach');return target;
}
async function main(){
 const development=devCoachTarget(process.env);
 if(development)await assertDevProjectBinding(development);
 const runtime=dedicatedCoachRuntime(process.env);
 const handler=privateCoachHandler(runtime);
 const port=Number(process.env.PORT||8080);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('INVALID_SERVICE_PORT');
 createServer((req,res)=>{void handler(req,res).catch(()=>{res.statusCode=503;res.end();});})
  .listen(port,'0.0.0.0');
}
if(process.argv.some(x=>/[/\\]private-executor\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('PRIVATE_COACH_STARTUP_BLOCKED');process.exitCode=1;});
