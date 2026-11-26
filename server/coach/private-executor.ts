/** Dedicated private Cloud Run inference boundary, separate from the public
 * gateway, untrusted game sandbox, preview and GitHub generation worker.
 * This service is PRIVATE behind Cloud Run IAM and additionally validates the
 * calling gateway identity. No model request can run unless all child privacy,
 * model approval and family allowance gates pass.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {approved,validateCoachContext,type CoachProvider} from './service';
import {OpenAICoachProvider,coachFailureEvent,tagCoachFailure,normalizePrivateCoachReply,type PrivateCoachConfig,type CoachFailureEvent,type CoachFailureStage} from './private-provider';
import {validateCoachReply} from '../../src/studio/design';
import {privateCoachOrigin} from './private-bridge';
import {speechApproved,speechConfig,validateAudio,type SpeechProvider,type SpeechConfig,AUDIO_MAX_BYTES} from './speech';
import {GooglePrivateSpeech} from './private-speech-provider';
import {GooglePrivateNarration} from './private-narration-provider';
import {narrationApproved,narrationConfig,validateNarrationText,validateNarrationAudio,NARRATION_DEADLINE_MS,type NarrationProvider,type NarrationConfig} from './narration';
import {readNarrationRequest} from './narration-transport';
import {adultPilotFlags} from '../adult-pilot';
import {readJsonBody} from '../http-json';

import {syntheticCoachReply} from './synthetic-scenario';
import {testGatewayPrincipal,testCoachOrigin,testHouseholdPrincipal,trialExpiry} from './test-identity';
export type VerifyCaller=(token:string)=>Promise<boolean>;
export function googleCallerVerifier(audience:string,approvedServiceAccount:string,env:NodeJS.ProcessEnv=process.env,keys?:JWTVerifyGetKey):VerifyCaller {
 const funded=env.K_SERVICE==='jems-test-coach'&&approvedServiceAccount===testHouseholdPrincipal;
 const expiresAt=funded?trialExpiry(env):Infinity;
 if(!/^https:\/\/[^/?#]+$/.test(audience)||(env.K_SERVICE==='jems-test-coach'?(audience!==testCoachOrigin(env)||!funded&&approvedServiceAccount!==testGatewayPrincipal):approvedServiceAccount!=='factory-gateway@family-game-factory-jzw.iam.gserviceaccount.com'))
  throw Error('PRIVATE_COACH_IDENTITY_REQUIRED');
 const googleKeys=keys??createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
 return async(token)=>{
  const {payload}=await jwtVerify(token,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience,algorithms:['RS256']});
  return Date.now()<expiresAt&&payload.email===approvedServiceAccount&&payload.email_verified===true;
 };
}
export interface PrivateCoachRuntime {
 config:PrivateCoachConfig;
 enabled:boolean;
 verifyCaller:VerifyCaller;
 provider:CoachProvider;
 syntheticCaller?:VerifyCaller;maxConcurrent?:number;
 audio?:SpeechProvider;
 audioConfig?:SpeechConfig;
 reportFailure?:(event:CoachFailureEvent)=>void|Promise<void>;
 narration?:NarrationProvider;
 narrationConfig?:NarrationConfig;
}
export function privateCoachHandler(runtime:PrivateCoachRuntime){
 let active=0;
 const send=(res:ServerResponse,status:number,data:object)=>{
  if(res.headersSent||res.writableEnded||res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(data));
 };
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const started=performance.now();
  let coachPost=false,stage:CoachFailureStage='caller_verification';
  // Recognize the one diagnostic route without changing the order or result of
  // the existing Origin, caller, method and body checks below.
  try{coachPost=req.method==='POST'&&new URL(req.url||'','http://private').pathname==='/v1/private-coach/complete';}catch{}
  const aborted=new AbortController();
  let failureSignal:AbortSignal|undefined=aborted.signal;
  res.once('close',()=>{if(!res.writableEnded)aborted.abort();});
  const acquire=()=>{
   aborted.signal.throwIfAborted();
   if(active>=(runtime.maxConcurrent||4))throw Error('RATE_LIMIT');
   active++;
  };
  try{
   if(req.headers.origin||req.headers['x-factory-request']!=='1')throw Error('FORBIDDEN');
   const path=new URL(req.url||'','http://private').pathname;
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{40,12000})$/)?.[1];
   if(path==='/v1/private-coach/synthetic/status'||path==='/v1/private-coach/synthetic'){
    if(!token||!runtime.syntheticCaller||!await runtime.syntheticCaller(token))throw Error('FORBIDDEN');
    if(path.endsWith('/status')&&req.method==='GET')return send(res,200,{available:true,mode:'fixture'});
    if(path.endsWith('/status')||req.method!=='POST'||!String(req.headers['content-type']??'').startsWith('application/json'))throw Error('FORBIDDEN');
    const input=await readJsonBody(req,128,{invalidJsonError:'INVALID_REQUEST'});
    if(!input||Object.keys(input).length!==2||input.version!==1||input.scenario!=='moon-hopper')throw Error('INVALID_REQUEST');
    return send(res,200,{reply:syntheticCoachReply,usedMicroUsd:0});
   }
   if(!token||!await runtime.verifyCaller(token))throw Error('FORBIDDEN');
   if(path==='/v1/private-coach/narration/status'||path==='/v1/private-coach/narration'){
    const ready=!!runtime.narration&&!!runtime.narrationConfig&&narrationApproved(runtime.narrationConfig);
    if(path.endsWith('/status')&&req.method==='GET')return send(res,200,{available:ready,mode:ready?'natural':'unavailable'});
    if(path.endsWith('/status')||req.method!=='POST'||!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('FORBIDDEN');
    if(!ready)throw Error('NARRATION_UNAVAILABLE');
    if(active>=(runtime.maxConcurrent||4))throw Error('RATE_LIMIT');
    const input:any=await readNarrationRequest(req,13000);
    if(!input||input.version!==1||Object.keys(input).some(k=>!['version','text'].includes(k)))throw Error('INVALID_NARRATION');
    const text=validateNarrationText(input.text),signal=AbortSignal.any([aborted.signal,AbortSignal.timeout(NARRATION_DEADLINE_MS)]);
    acquire();
    try {
     signal.throwIfAborted();const audio=validateNarrationAudio(await runtime.narration!.read(text,signal));signal.throwIfAborted();
     if(res.destroyed||res.writableEnded)return;
     res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':audio.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
     res.end(Buffer.from(audio));return;
    }finally{active--;}
   }
   stage='configuration';
   const configured=runtime.enabled&&approved(runtime.config)&&!!runtime.config.apiKey&&runtime.config.apiKey.length>=16;
   let readinessFailure:unknown,readinessSignal:AbortSignal|undefined;
   stage='readiness';
   const available=configured&&
    (!runtime.provider.readiness||await runtime.provider.readiness(readinessSignal=AbortSignal.any([aborted.signal,AbortSignal.timeout(3000)])).catch(error=>{readinessFailure=error;return false;}));
   // Both readiness probes authenticate the exact gateway identity.
   // No prompt, child ID, audio or provider request is included.
   if(path==='/v1/private-coach/status'&&req.method==='GET')
    return send(res,200,{available,mode:available?'model':'unavailable'});
   const voiceReady=!!runtime.audio&&!!runtime.audioConfig&&speechApproved(runtime.audioConfig);
   if(path==='/v1/private-coach/audio/status'&&req.method==='GET')
    return send(res,200,{available:voiceReady,mode:voiceReady?'private':'unavailable'});
   const isAudio=path==='/v1/private-coach/audio';
   stage='input_validation';
   if((path!=='/v1/private-coach/complete'&&!isAudio)||req.method!=='POST'||
    !String(req.headers['content-type']||'').startsWith('application/json'))throw Error('FORBIDDEN');
   if(isAudio?!voiceReady:!available){
    const error=Error(isAudio?'AUDIO_UNAVAILABLE':'COACH_UNAVAILABLE');
    if(!isAudio){
     stage=configured?'readiness':'configuration';
     if(readinessFailure!==undefined)tagCoachFailure(error,coachFailureEvent(readinessFailure,stage,0,readinessSignal));
    }
    throw error;
   }
   if(active>=(runtime.maxConcurrent||4))throw Error('RATE_LIMIT');
   const input=await readJsonBody(req,isAudio?440000:40000,{invalidJsonError:'INVALID_REQUEST'});
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
    acquire();
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
   // Recheck and increment without an await: other validated bodies may have
   // occupied the shared text/audio slots while this request was being read.
   acquire();
   try{
    stage='inference';
    const {reply,usedMicroUsd}=await runtime.provider.complete(context,
     failureSignal=AbortSignal.any([aborted.signal,AbortSignal.timeout(25000)]));
    stage='usage_validation';failureSignal=undefined;
    if(!Number.isSafeInteger(usedMicroUsd)||usedMicroUsd<0||usedMicroUsd>runtime.config.maxTurnMicroUsd)
     throw Error('COACH_PROVIDER_FAILED');
    stage='reply_validation';
    const validated=validateCoachReply(normalizePrivateCoachReply(reply,context),context);
    return send(res,200,{reply:validated,usedMicroUsd});
   }finally{active--;}
  }catch(error){
   const code=(error as Error).message;
   if(coachPost){
    try{
     const event=coachFailureEvent(error,stage,performance.now()-started,failureSignal);
     const report=runtime.reportFailure||((value:CoachFailureEvent)=>{console.error(JSON.stringify(value));});
     // Diagnostic output must not affect the request, even for an injected
     // reporter that throws synchronously or returns a rejected promise.
     void Promise.resolve(report(event)).catch(()=>{});
    }catch{}
   }
   return send(res,code==='FORBIDDEN'?403:code==='INVALID_REQUEST'||code==='PRIVATE_INFORMATION'||code==='INVALID_AUDIO'||code==='INVALID_NARRATION'?400:
    code==='RATE_LIMIT'?429:code==='COACH_REFUSED'||code==='AUDIO_NO_SPEECH'?422:503,{errorCode:
    ['FORBIDDEN','INVALID_REQUEST','PRIVATE_INFORMATION','INVALID_AUDIO','INVALID_NARRATION','RATE_LIMIT','COACH_REFUSED','AUDIO_NO_SPEECH'].includes(code)?code:'COACH_UNAVAILABLE'});
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
 if(env.K_SERVICE==='jems-test-coach'&&(env.FACTORY_COACH_PRIVATE_AUDIENCE!==testCoachOrigin(env)||env.FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT!==testGatewayPrincipal))throw Error('PRIVATE_COACH_IDENTITY_REQUIRED');
 if(!['factory-coach-private','jems-test-coach'].includes(env.K_SERVICE??'')||env.FACTORY_COACH_EXECUTION_ENV!=='dedicated-cloud-run')
  throw Error('DEDICATED_PRIVATE_CLOUD_RUN_REQUIRED');
 if(env.FACTORY_OPENAI_API_KEY||env.FACTORY_COACH_API_KEY)
  throw Error('GENERATION_OR_GATEWAY_KEY_FORBIDDEN_IN_PRIVATE_COACH');
 const config=privateConfig(env),audioConfig=speechConfig(env),readingConfig=narrationConfig(env);
 const requested=env.FACTORY_COACH_APPROVED==='true';
 const audioRequested=env.FACTORY_COACH_AUDIO_APPROVED==='true';
 const narrationRequested=env.FACTORY_NARRATION_APPROVED==='true';
 const test=env.K_SERVICE==='jems-test-coach';
 const syntheticCaller=test?googleCallerVerifier(testCoachOrigin(env),testGatewayPrincipal,env):undefined;
 if(test&&(audioRequested||narrationRequested))throw Error('TEST_TRIAL_AUTHORIZATION_REQUIRED');
 if(test&&requested)trialExpiry(env);
 if(!requested&&!audioRequested&&!narrationRequested){
  if(config.apiKey)throw Error('COACH_SECRET_FORBIDDEN_WHILE_INACTIVE');
  return {config,enabled:false,syntheticCaller,verifyCaller:async(_token:string)=>false,
   provider:new OpenAICoachProvider(config)};
 }
 if(requested&&(!approved(config)||!config.apiKey||config.apiKey.length<16))
  throw Error('COACH_APPROVAL_REQUIRED');
 if(!requested&&config.apiKey)throw Error('COACH_SECRET_FORBIDDEN_WHILE_INACTIVE');
 if(audioRequested&&!speechApproved(audioConfig))throw Error('AUDIO_APPROVAL_REQUIRED');
 if(narrationRequested&&!narrationApproved(readingConfig))throw Error('NARRATION_APPROVAL_REQUIRED');
 const audience=env.FACTORY_COACH_PRIVATE_AUDIENCE||'';
 const caller=env.FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT||'';
 if(privateCoachOrigin(audience,env)!==audience)throw Error('COACH_AUDIENCE_REQUIRED');
 return {config,enabled:requested,syntheticCaller,verifyCaller:googleCallerVerifier(audience,test?testHouseholdPrincipal:caller,env),
  provider:new OpenAICoachProvider(config),
  audioConfig,
  narrationConfig:readingConfig,
  narration:narrationRequested?new GooglePrivateNarration(readingConfig):undefined,
  audio:audioRequested?new GooglePrivateSpeech(audioConfig.projectId):undefined};
}
async function main(){
 const runtime=dedicatedCoachRuntime(process.env);
 const handler=privateCoachHandler(runtime);
 const port=Number(process.env.PORT||8080);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('INVALID_SERVICE_PORT');
 createServer((req,res)=>{void handler(req,res).catch(()=>{res.statusCode=503;res.end();});})
  .listen(port,'0.0.0.0');
}
if(process.argv.some(x=>/[/\\]private-executor\.(?:ts|mjs)$/.test(x)))
 void main().catch(()=>{console.error('PRIVATE_COACH_STARTUP_BLOCKED');process.exitCode=1;});
