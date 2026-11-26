import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer,request} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {betaFixture} from './beta-fixture';
import {exportApproved,exportReceiptPage,exportWorkspace,pendingReservations} from '../server/beta/portability';
import {ownerPreview,ownerPreviewGrant} from '../server/beta/owner-preview';
import {FixtureDocuments} from '../server/beta/documents';
import {readWorkspace,writeWorkspace} from '../server/pipeline/workspace-state';
import {newTrustedDevice} from '../server/trusted-devices';
import type {BuiltRevision} from '../server/pipeline/types';

test('parent portability is case-bound and paginated without playback credentials or another family’s rows',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('export-owner'),b=await enroll('export-other');
 const state=(id:string)=>d.withFamily(id,async(_tx,f)=>f);
 const other=await state(b.id);assert.throws(()=>exportApproved(other,Date.now()));
 await mutate('request-export',a.id);const f=await state(a.id);assert.throws(()=>exportApproved(f,Date.now()));
 await mutate('release-export',a.id,{requestId:f.request!.id,receipt:'synthetic-export-release'});const approved=await state(a.id);exportApproved(approved,Date.now());
 assert.throws(()=>exportApproved(approved,Date.now()+86500000));assert.throws(()=>exportApproved(other,Date.now()));
 await d.db.run(async tx=>{for(let i=0;i<50;i++)tx.create(d.path(a.id)+'/acknowledgments/'+randomUUID(),{familyId:a.id,guardianId:approved.guardian.id,deviceId:'synthetic',sessionDigest:'excluded-play-credential',at:i,notice:'synthetic',terms:'synthetic'});});
 const page=(id:string,after:string)=>d.withFamily(id,(tx,f)=>exportReceiptPage(tx,d.path(id),f,'acknowledgments',after));
 const first=await page(a.id,''),last=await page(a.id,first.next!);assert.equal(first.rows.length,48);assert.equal(last.rows.length,3);
 assert.equal((await page(b.id,'')).rows.length,1);assert.ok(!JSON.stringify([...first.rows,...last.rows]).includes('sessionDigest'));
 const snapshot=await d.repository(a.id).snapshot(),data=exportWorkspace(approved,snapshot,Date.now());
 assert.ok(data.devices.length);assert.ok(!JSON.stringify(data).includes('secretHash'));assert.deepEqual(pendingReservations(snapshot),[]);
});

test('protected household preview binds the original workspace, active owner device and exact origin',async()=>{
 const db=new FixtureDocuments(),cfg={workspace:'original-home',familyId:'owner-family',appOrigin:'https://owner.example',previewKey:'independent-household-preview-signature-key'};
 const origin='https://isolated.example',now=Date.now(),device=newTrustedDevice(cfg.familyId,'Original tablet',now).device;
 const revision:BuiltRevision={id:randomUUID(),familyId:cfg.familyId,projectId:'retained-dragon',parentId:null,game:{kind:'star-catcher-v1',target:5,seconds:15}};
 await db.run(async tx=>{const workspace=await readWorkspace(tx,cfg.workspace);workspace.state.devices=[device];workspace.state.revisions.push(revision);await writeWorkspace(tx,workspace);});
 const token=await ownerPreviewGrant({...cfg,previewOrigin:origin},{familyId:cfg.familyId,role:'designer',deviceId:device.id,expiresAt:now+600000,subject:'family-designer'},revision);
 assert.ok(!token.url.includes('?'));const handler=ownerPreview(cfg,origin,db,()=>undefined),server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const deliver=(from:string)=>new Promise<number>((ok,fail)=>{
  const q=request({host:'127.0.0.1',port:(server.address() as AddressInfo).port,path:'/household-preview',method:'POST',headers:{Host:'isolated.example',Origin:from,'Content-Type':'application/x-www-form-urlencoded'}},r=>{r.resume();ok(r.statusCode!);});
  q.on('error',fail);q.end(new URLSearchParams({grant:token.grant,channel:randomUUID()}).toString());
 });
 try{assert.equal(await deliver('https://workshop.example'),403);assert.equal(await deliver(cfg.appOrigin),200);
  await db.run(async tx=>{const w=await readWorkspace(tx,cfg.workspace);w.state.devices![0].revokedAt=Date.now();await writeWorkspace(tx,w);});
  assert.equal(await deliver(cfg.appOrigin),403);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});

test('a pending erasure holds access and preserves permanent revocation',async()=>{
 const {d,enroll,mutate}=await betaFixture();
 for(const revoked of [false,true]){
  const family=await enroll('erasure-'+revoked);
  if(revoked)await mutate('revoke',family.id);
  await mutate('request-deletion',family.id);
  const state=()=>d.withFamily(family.id,async(_tx,f)=>f);
  assert.equal((await state()).status,revoked?'revoked':'suspended');
  for(const action of ['resume','recover'])await assert.rejects(mutate(action,family.id),/DELETION_PENDING/);
  await mutate('confirm-deletion',family.id,{requestId:(await state()).request!.id,receipt:'confirmed-deletion-'+revoked});
  assert.equal((await state()).status,'revoked');
 }
});
