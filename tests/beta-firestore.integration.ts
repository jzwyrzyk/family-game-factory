import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Firestore} from '@google-cloud/firestore';
import {betaFixture} from './beta-fixture';
import {firestoreStore} from '../server/beta/documents';
import {defaultCapabilities} from '../server/beta/model';

async function main(){
 if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw Error('Local Firestore emulator required.');
 const db=new Firestore({projectId:'demo-jems-private-family'}),store=firestoreStore(db);
 try{
  const {d,enroll,mutate}=await betaFixture(store,'emulator-'+randomUUID().slice(0,8)),a=await enroll('emulator-a'),b=await enroll('emulator-b');
  for(const f of [a,b])await mutate('policy',f.id,{capabilities:defaultCapabilities(),monthlyCents:100,paused:false,generationPaused:false});
  const request=(id:string)=>d.repository(id).transaction(s=>{s.ledgers[id].reserved+=650000;});
  const result=await Promise.allSettled([request(a.id),request(b.id)]);assert.equal(result.filter(v=>v.status==='fulfilled').length,1);
  const f=result[0].status==='fulfilled'?a:b;
  await d.repository(f.id).transaction(s=>{s.ledgers[f.id].reserved=0;s.ledgers[f.id].used=30000;});
  const m=new Date().toISOString().slice(0,7);
  assert.deepEqual(await store.run(tx=>tx.get(d.root+'/usage/'+m)),{used:30000,reserved:0});
  assert.equal((await d.repository(f.id===a.id?b.id:a.id).snapshot()).ledgers[f.id],undefined);
  await mutate('suspend',f.id);console.log('Firestore emulator passed real SDK transactions, independent family authorization, concurrent reservation and settlement.');
 }finally{await db.terminate();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
