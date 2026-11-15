import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireFamily,requirePublish,validateGenerationRequest,transition,UnconfiguredAIProvider,type VerifiedSession,type GenerationJob } from '../server/contracts/api';
const session:VerifiedSession={subject:'pseudonymous-parent',familyId:'family-a',role:'parent',expiresAt:Date.now()+100000};
test('private resources require verified unexpired family scope, publishing additionally requires parent approval and tests',()=>{
 const resource={id:'private-version',familyId:'family-a'};assert.equal(requireFamily(session,resource),session);
 for(const bad of [null,{...session,familyId:'family-b'},{...session,expiresAt:0}])assert.throws(()=>requireFamily(bad,resource),/Forbidden/);
 const evidence={testsPassed:true,artifactValidated:true,parentApproved:true};requirePublish(session,resource,evidence);
 assert.throws(()=>requirePublish({...session,role:'designer'},resource,evidence));assert.throws(()=>requirePublish(session,resource,{...evidence,testsPassed:false}));assert.throws(()=>requirePublish(session,resource,{...evidence,parentApproved:false}));
});
test('generation rejects client-selected security fields and oversized requests',()=>{
 const request={version:1,baseRevisionId:'revision-1',prompt:'A flying donut game',idempotencyKey:'request-123'};assert.deepEqual(validateGenerationRequest(request),request);
 for(const bad of [{...request,familyId:'other-family'},{...request,secret:'key'},{...request,prompt:'x'.repeat(2001)},{...request,idempotencyKey:'../../secret'}])assert.throws(()=>validateGenerationRequest(bad));
});
test('job lifecycle requires validation before ready; cancellation is terminal',()=>{
 const job:GenerationJob={id:'job',familyId:'family-a',state:'queued',baseRevisionId:'revision-1',idempotencyKey:'request-123'};
 assert.throws(()=>transition(job,'ready'));const cancelled=transition(job,'cancelled');assert.throws(()=>transition(cancelled,'running'));
 const validating=transition(transition(job,'running'),'validating');assert.throws(()=>transition(validating,'ready'),/artifact/);
 assert.equal(transition({...validating,artifact:{objectKey:'private/artifact',sha256:'a'.repeat(64)}},'ready').state,'ready');
});
test('unconfigured AI adapter does not pretend to generate a game',async()=>{await assert.rejects(new UnconfiguredAIProvider().propose(),/not configured/)});
