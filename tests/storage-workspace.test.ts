import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FixtureDocuments,type Documents} from '../server/beta/documents';
import {readWorkspace,writeWorkspace} from '../server/pipeline/workspace-state';

test('workspace transactions retain unchanged chunks and perform no writes for unchanged state',async()=>{
 const db=new FixtureDocuments(),writes:string[]=[];
 const instrument=(tx:Documents):Documents=>({...tx,set(path,value){writes.push(path);tx.set(path,value);},delete(path){writes.push('delete:'+path);tx.delete(path);}});
 await db.run(async tx=>{
  const loaded=await readWorkspace(tx,'synthetic');
  loaded.state.audit=Array.from({length:1500},(_,i)=>({at:i,familyId:'synthetic',event:'queued',jobId:'r'+i,detail:'Synthetic 🙂 '.repeat(40)})) as any;
  await writeWorkspace(instrument(tx),loaded);
 });
 const original=await db.run(tx=>readWorkspace(tx,'synthetic'));
 assert.ok(original.chunks>=3);
 writes.length=0;
 await db.run(async tx=>{const loaded=await readWorkspace(tx,'synthetic');await writeWorkspace(instrument(tx),loaded);});
 assert.deepEqual(writes,[]);
 await db.run(async tx=>{
  const loaded=await readWorkspace(tx,'synthetic');
  (loaded.state.audit.at(-1) as any).detail+=' changed';
  await writeWorkspace(instrument(tx),loaded);
 });
 assert.deepEqual(writes,[original.root,original.root+'/chunks/'+(original.chunks-1)]);
 const changed=await db.run(tx=>readWorkspace(tx,'synthetic'));
 assert.ok((changed.state.audit.at(-1) as any).detail.endsWith(' changed'));
 assert.deepEqual(changed.originalParts.slice(0,-1),original.originalParts.slice(0,-1));
 writes.length=0;
 await assert.rejects(db.run(async tx=>{
  const loaded=await readWorkspace(tx,'synthetic');loaded.state.audit=[];
  await writeWorkspace(instrument(tx),loaded);throw Error('transaction interrupted');
 }));
 assert.deepEqual((await db.run(tx=>readWorkspace(tx,'synthetic'))).state,changed.state);
 await db.run(async tx=>{const loaded=await readWorkspace(tx,'synthetic');loaded.state.audit=[];await writeWorkspace(tx,loaded);});
 assert.equal((await db.run(tx=>readWorkspace(tx,'synthetic'))).chunks,1);
 assert.equal(await db.run(tx=>tx.get(original.root+'/chunks/1')),undefined);
});
