import {createPrivateKey} from 'node:crypto';
import {SignJWT} from 'jose';
export function installationTokenProvider(config:{appId:string;installationId:string;repositoryId:number},privateKey:()=>string,transport:typeof fetch=fetch){let cached:{token:string;expires:number}|undefined;return async()=>{
 if(cached&&cached.expires>Date.now()+60000)return cached.token;
 if(!/^\d+$/.test(config.appId)||!/^\d+$/.test(config.installationId)||!Number.isInteger(config.repositoryId))throw Error('GITHUB_APP_CONFIGURATION_REQUIRED');
 const jwt=await new SignJWT({}).setProtectedHeader({alg:'RS256'}).setIssuer(config.appId).setIssuedAt(Math.floor(Date.now()/1000)-30).setExpirationTime('8m').sign(createPrivateKey(privateKey()));
 const r=await transport(`https://api.github.com/app/installations/${config.installationId}/access_tokens`,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+jwt,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({repository_ids:[config.repositoryId],permissions:{actions:'write',contents:'read'}})});if(!r.ok)throw Error('GITHUB_APP_TOKEN_FAILED');const data=await r.json();if(typeof data.token!=='string'||!Number.isFinite(Date.parse(data.expires_at)))throw Error('GITHUB_APP_TOKEN_INVALID');cached={token:data.token,expires:Date.parse(data.expires_at)};return cached.token;
};}
