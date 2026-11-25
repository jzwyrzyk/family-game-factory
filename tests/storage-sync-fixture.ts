import {randomUUID} from 'node:crypto';
import {betaFixture,fixtureKey} from './beta-fixture';
import {storageConsent,continuityRequest} from '../server/beta/continuity';
import {internalCookies} from '../server/beta/access';
import {cookieValue} from '../server/trusted-devices';
import {signSession,verifySession} from '../server/pipeline/auth';
import {storageDomains} from '../src/storage/sync-contract';
import type {AtomicStore} from '../server/beta/documents';
import type {RecordOperation} from '../src/storage/record-contract';
export async function syncFixture(store?:AtomicStore,environment='sync-'+randomUUID().slice(0,8)){
 const fixture=await betaFixture(store,environment),{d,enroll,mutate}=fixture,a=await enroll('sync-a'),profile=randomUUID();
 const session=verifySession(cookieValue(internalCookies(a.raw),'factory_session'),fixtureKey);
 const cookies=a.cookies+'; __Host-factory_parent='+signSession({...session,role:'parent',expiresAt:Date.now()+600000},fixtureKey);
 await d.withFamily(a.id,async(tx,f)=>{f.profiles=[profile];tx.set(d.path(a.id),f);});
 const operation=(id='op1',expectedVersion=0,value:unknown={title:'Kept original'}):RecordOperation=>({id,scope:{family:a.id,profile},changes:[{collection:'games',id:'game1',expectedVersion,value}]});
 const call=(path:string,body:object)=>continuityRequest(d,a.id,a.cookies,fixtureKey,'/v1/storage/'+path,{profile,...body});
 const activate=async(domains=['games','artwork','conversation'] as (typeof storageDomains[number])[])=>{
  d.config.continuity={enabled:true,notice:'private-copies-test-v1',domains:[...storageDomains]};
  await mutate('storage-domains',a.id,{domains});
  return storageConsent(d,a.id,cookies,fixtureKey,{notice:d.config.continuity.notice,profiles:[profile],domains,acknowledged:true});
 };
 return {...fixture,a,profile,cookies,session,operation,call,activate};
}
