/** Private, generation-environment-only conversational inference boundary.
 * REVIEW GATE: Never deploy this executable on Cloud Run or the public gateway,
 * and never move model credentials outside an owner-approved factory-generation
 * environment. This implements the HTTP contract; runtime hosting and access
 * approval remain separate, explicit owner operations.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {approved,validateCoachContext,type CoachProvider} from './service';
import {OpenAICoachProvider,type PrivateCoachConfig} from './private-provider';
import {validateCoachReply} from '../../src/studio/design';

export type VerifyCaller=(token:string)=>Promise<boolean>;
export function googleCallerVerifier(audience:string,approvedServiceAccount:string):VerifyCaller {
 if(!/^https:\/\/[^/?#]+$/.test(audience)||!/^[a-z0-9-]+@[a-z0-9.-]+\.gserviceaccount\.com$/.test(approvedServiceAccount))
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
}
export function privateCoachHandler(runtime:PrivateCoachRuntime){
 let active=0;
 const send=(res:ServerResponse,status:number,data:object)=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
 };
 return async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(!runtime.enabled||!approved(runtime.config)||!runtime.config.apiKey||runtime.config.apiKey.length<16)
    throw Error('COACH_UNAVAILABLE');
   if(req.headers.origin||req.method!=='POST'||new URL(req.url||'','http://private').pathname!=='/v1/private-coach/complete')
    throw Error('FORBIDDEN');
   if(req.headers['x-factory-request']!=='1'||!String(req.headers['content-type']||'').startsWith('application/json'))
    throw Error('FORBIDDEN');
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{40,12000})$/)?.[1];
   if(!token||!await runtime.verifyCaller(token))throw Error('FORBIDDEN');
   if(active>=(runtime.maxConcurrent||4))throw Error('RATE_LIMIT');
   let data='';
   for await(const chunk of req){
    data+=String(chunk);
    if(Buffer.byteLength(data,'utf8')>40000)throw Error('INVALID_REQUEST');
   }
   let input:any;
   try{input=JSON.parse(data);}catch{throw Error('INVALID_REQUEST');}
   if(!input||Object.keys(input).some(k=>!['version','context'].includes(k))||input.version!==1)throw Error('INVALID_REQUEST');
   const context=validateCoachContext(input.context);
   const serialized=JSON.stringify(context);
   if(serialized.length>runtime.config.maxInputChars)throw Error('INVALID_REQUEST');
   // Do not allow a direct caller to bypass the gateway's PII rejection.
   if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:sk-|ghp_|github_pat_)\S+|\b\d{3}[- .]\d{3}[- .]\d{4}\b/i.test(serialized))throw Error('PRIVATE_INFORMATION');
   active++;
   try{
    const {reply,usedMicroUsd}=await runtime.provider.complete(context,AbortSignal.timeout(25000));
    if(!Number.isSafeInteger(usedMicroUsd)||usedMicroUsd<0||usedMicroUsd>runtime.config.maxTurnMicroUsd)
     throw Error('COACH_PROVIDER_FAILED');
    const validated=validateCoachReply(reply,context);
    return send(res,200,{reply:validated,usedMicroUsd});
   }finally{active--;}
  }catch(error){
   const code=(error as Error).message;
   return send(res,code==='FORBIDDEN'?403:code==='INVALID_REQUEST'||code==='PRIVATE_INFORMATION'?400:
    code==='RATE_LIMIT'?429:code==='COACH_REFUSED'?422:503,{errorCode:
    ['FORBIDDEN','INVALID_REQUEST','PRIVATE_INFORMATION','RATE_LIMIT','COACH_REFUSED'].includes(code)?code:'COACH_UNAVAILABLE'});
  }
 };
}
function privateConfig(env:NodeJS.ProcessEnv):PrivateCoachConfig {
 return {
  enabled:env.FACTORY_COACH_APPROVED==='true',
  privacyApproved:env.FACTORY_COACH_PRIVACY_APPROVED==='true',
  moderationApproved:env.FACTORY_COACH_SAFEGUARDS_APPROVED==='true',
  zdrVerified:env.FACTORY_COACH_ZDR_VERIFIED==='true',
  privateExecutionApproved:env.FACTORY_COACH_PRIVATE_EXECUTION_APPROVED==='true',
  model:env.FACTORY_COACH_MODEL||'',
  apiKey:env.FACTORY_OPENAI_API_KEY||'',
  maxInputChars:Number(env.FACTORY_COACH_INPUT_CHARS||16000),
  maxOutputTokens:Number(env.FACTORY_COACH_OUTPUT_TOKENS||800),
  maxTurnMicroUsd:Number(env.FACTORY_COACH_MAX_MICRO_USD||0),
  inputMicroUsdPerMillion:Number(env.FACTORY_COACH_INPUT_PRICE||0),
  outputMicroUsdPerMillion:Number(env.FACTORY_COACH_OUTPUT_PRICE||0),
  pricesReviewedAt:env.FACTORY_COACH_PRICES_REVIEWED||''
 };
}
async function main(){
 // An extra fail-closed policy check. Environment strings alone do NOT certify
 // an approved runtime: deployment must independently attest private isolation.
 if(process.env.K_SERVICE||process.env.FACTORY_COACH_EXECUTION_ENV!=='factory-generation')
  throw Error('PRIVATE_GENERATION_RUNTIME_REQUIRED');
 const config=privateConfig(process.env);
 if(!approved(config)||!config.apiKey||config.apiKey.length<16)throw Error('COACH_APPROVAL_REQUIRED');
 const audience=process.env.FACTORY_COACH_PRIVATE_AUDIENCE||'';
 const caller=process.env.FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT||'';
 const verifyCaller=googleCallerVerifier(audience,caller);
 const handler=privateCoachHandler({config,enabled:true,verifyCaller,provider:new OpenAICoachProvider(config)});
 createServer((req,res)=>{void handler(req,res).catch(()=>{res.statusCode=503;res.end();});})
  .listen(Number(process.env.PORT)||8080,'127.0.0.1');
}
if(process.argv.some(x=>/[/\\]private-executor\.ts$/.test(x)))
 void main().catch(()=>{console.error('PRIVATE_COACH_STARTUP_BLOCKED');process.exitCode=1;});
