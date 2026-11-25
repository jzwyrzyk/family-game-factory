import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AtomicStore} from '../server/beta/documents';
import {syncFixture} from './storage-sync-fixture';
import {storageConsent,continuityRequest} from '../server/beta/continuity';
import {fixtureKey} from './beta-fixture';

export async function storageEmulatorAcceptance(store:AtomicStore){
 const x=await syncFixture(store,'sync-native-'+randomUUID().slice(0,8));await x.activate();
 await x.call('commit',{operation:x.operation()});
 const simultaneous=await Promise.allSettled([x.call('commit',{operation:x.operation('one',1,{winner:'one'})}),x.call('commit',{operation:x.operation('two',1,{winner:'two'})})]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);
 const status=await x.call('status',{}) as any,feed=await x.call('changes',{after:'0',limit:100,epoch:status.epoch}) as any;
 assert.equal(feed.through,'2');assert.deepEqual(feed.records.map((r:any)=>r.version),[1,2]);
 const page=await x.call('page',{collection:'games',after:'',limit:20}) as any;assert.equal(page.records.length,1);assert.equal(page.records[0].version,2);
 const winning=simultaneous[0].status==='fulfilled'?'one':'two';assert.deepEqual(await x.call('lookup',{operation:winning}),(simultaneous.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value);
 await storageConsent(x.d,x.a.id,x.cookies,fixtureKey,{notice:x.d.config.continuity!.notice,profiles:[],domains:[],acknowledged:true});
 await assert.rejects(x.call('commit',{operation:x.operation('withdrawn',2)}),/CONSENT_REQUIRED/);
 await x.activate();await x.mutate('revoke-device',x.a.id,{deviceId:x.session.deviceId});
 await assert.rejects(continuityRequest(x.d,x.a.id,x.a.cookies,fixtureKey,'/v1/storage/status',{profile:x.profile}),/UNAUTHENTICATED/);
 console.log('Firestore continuity: native CAS contention, atomic feed/current indexes, idempotent receipt, grant withdrawal and device revocation passed.');
}
