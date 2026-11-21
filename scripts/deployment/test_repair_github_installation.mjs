import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {binding, normalizeSpec, repairedConfig, repair, PROJECT, SERVICE,
  ORIGIN, CONFIG_FILE, CONFIG_SECRET, REPO, PIN, INSTALLATION} from './repair_github_installation.mjs';

const OLD = SERVICE+'-old';
const PEM = generateKeyPairSync('rsa', {modulusLength:2048}).privateKey
  .export({format:'pem',type:'pkcs8'}).toString();
const copy = value => structuredClone(value);
const config = () => ({projectId:PROJECT, gatewayOrigin:ORIGIN,
  workerRepository:REPO, workerRepositoryId:'1458899834',
  workerWorkflow:'factory-private.yml', workerApprovedSha:PIN,
  githubAppId:'5765875', githubInstallationId:'182105358',
  githubPrivateKeyFile:'/var/run/factory-github/key.pem',
  active:true, approval:{enabled:true,model:'fixture-model',maxOutputTokens:4000},
  sessionKey:'PRIVATE_SESSION_FIXTURE', previewKey:'PRIVATE_PREVIEW_FIXTURE',
  familyId:'family-fixture', workspace:'workspace-fixture', maxJobMicroUsd:120000,
  customFutureSetting:{retain:['unchanged']}});

function spec(version='7', name='config-active') {
  return {serviceAccountName:'factory-gateway@'+PROJECT+'.iam.gserviceaccount.com',
    containerConcurrency:8, timeoutSeconds:60,
    containers:[{image:'example.test/gateway@sha256:'+'a'.repeat(64),
      resources:{limits:{cpu:'1',memory:'512Mi'}},
      env:[{name:'FACTORY_PRIVATE_CONFIG',value:CONFIG_FILE},
        ...['FACTORY_ACTIONS_APPROVED','FACTORY_ADULT_PILOT_MODE',
          'FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED']
          .map(name => ({name,value:'true'}))],
      volumeMounts:[{name,mountPath:'/var/run/factory-config'},
        {name:'key-mount',mountPath:'/var/run/factory-github'}]}],
    volumes:[{name:'orphan',secret:{secretName:CONFIG_SECRET,items:[{key:'2',path:'config.json'}]}},
      {name,secret:{secretName:CONFIG_SECRET,items:[{key:version,path:'config.json'}]}},
      {name:'key-mount',secret:{secretName:'factory-github-app-private-key',
        items:[{key:'3',path:'key.pem'}]}}]};
}

function harness(options={}) {
  const writes=[], requests=[], lines=[], saved=new Map([['7',config()]]);
  const annotations={'run.googleapis.com/cpu-throttling':'true',
    'autoscaling.knative.dev/maxScale':'1', 'run.googleapis.com/client-name':'old-cli'};
  const oldRevision={metadata:{name:OLD,annotations:copy(annotations)},spec:spec(),
    status:{conditions:[{type:'Ready',status:'True'}],imageDigest:'sha256:'+'a'.repeat(64)}};
  const revisions=new Map([[OLD,oldRevision]]);
  let service={metadata:{resourceVersion:'1',annotations:{'run.googleapis.com/ingress':'all'}},
    spec:{template:{metadata:{annotations:copy(annotations)},spec:copy(oldRevision.spec)}},
    status:{url:ORIGIN,latestCreatedRevisionName:OLD,latestReadyRevisionName:OLD,
      traffic:[{revisionName:OLD,percent:100}]}};
  let stagedName;
  const json = value => JSON.stringify(value);
  function cloud(args,input) {
    const op=args.slice(0,3).join(' ');
    if(op==='run services describe') return json(service);
    if(op==='run revisions describe') return json(revisions.get(args[3]));
    if(op==='secrets versions access') {
      const secret=args.find(x=>x.startsWith('--secret=')).slice(9);
      if(secret==='factory-github-app-private-key') return PEM;
      assert.equal(secret,CONFIG_SECRET);
      assert.ok(saved.has(args[3]));
      return json(saved.get(args[3]));
    }
    if(op==='secrets versions add') {
      assert.equal(args[3],CONFIG_SECRET);
      assert.ok(args.includes('--data-file=-'));
      assert.ok(lines.includes('CORRECTED_APP_CONNECTION=VERIFIED'));
      writes.push('secret-add'); saved.set('8',JSON.parse(input));
      return json({name:'projects/'+PROJECT+'/secrets/'+CONFIG_SECRET+'/versions/8'});
    }
    if(op==='run services update') {
      assert.ok(args.includes('--no-traffic'));
      assert.ok(args.includes('--update-secrets='+CONFIG_FILE+'='+CONFIG_SECRET+':8'));
      assert.ok(!args.some(x=>x.startsWith('--set-secrets')));
      assert.equal(service.status.traffic[0].revisionName,OLD);
      writes.push('stage');
      stagedName=SERVICE+'-'+args.find(x=>x.startsWith('--revision-suffix=')).split('=')[1];
      const staged=copy(oldRevision);
      staged.metadata.name=stagedName;
      staged.metadata.annotations['run.googleapis.com/client-name']='new-cli';
      staged.spec=spec('8','config-new-name');
      if(options.drift==='env') staged.spec.containers[0].env[1].value='false';
      if(options.drift==='key') staged.spec.volumes.find(v=>v.name==='key-mount').secret.items[0].key='4';
      if(options.drift==='image') staged.spec.containers[0].image='example.test/changed@sha256:'+'b'.repeat(64);
      revisions.set(stagedName,staged);
      service.spec.template.spec=copy(staged.spec);
      service.spec.template.metadata.annotations=copy(staged.metadata.annotations);
      service.metadata.resourceVersion='2';
      service.status.latestCreatedRevisionName=stagedName;
      service.status.latestReadyRevisionName=stagedName;
      return json(service);
    }
    if(op==='run services update-traffic') {
      const destination=args.find(x=>x.startsWith('--to-revisions=')).split('=')[1];
      assert.ok([OLD,stagedName].includes(destination));
      if(destination===stagedName) assert.ok(lines.includes('RUNTIME_PRESERVED=VERIFIED'));
      writes.push(destination===OLD?'rollback':'promote');
      service.status.traffic=[{revisionName:destination,percent:100}];
      service.metadata.resourceVersion=String(Number(service.metadata.resourceVersion)+1);
      return json(service);
    }
    assert.fail('Unexpected cloud operation: '+op);
  }
  async function transport(url,init={}) {
    requests.push({url,method:init.method||'GET'});
    const reply=(status,body)=>({status,json:async()=>copy(body)});
    if(url===ORIGIN+'/health') return reply(options.healthFailure?503:200,
      {ready:!options.healthFailure,paidExecution:!options.healthFailure});
    assert.ok(url.startsWith('https://api.github.com/'));
    assert.ok(!url.endsWith('/dispatches'));
    if(url.endsWith('/installation')) return reply(200,{id:Number(INSTALLATION),
      account:{login:'family-game-factory-lab'},permissions:{actions:'write',contents:'read'}});
    if(url.endsWith('/access_tokens')) {
      assert.ok(url.includes('/installations/'+INSTALLATION+'/'));
      assert.deepEqual(JSON.parse(init.body),{
        repository_ids:[1458899834],permissions:{actions:'write',contents:'read'}});
      return options.denyToken?reply(403,{message:'SENSITIVE_PROVIDER_ERROR_FIXTURE'}):
        reply(201,{token:'PRIVATE_TOKEN_FIXTURE'});
    }
    if(url.endsWith('/factory-private.yml')) return reply(200,{state:'active'});
    if(url.includes('/git/ref/')) return reply(200,{object:{type:'commit',sha:PIN}});
    assert.fail('Unexpected API URL');
  }
  return {cloud,transport,report:line=>lines.push(line),writes,requests,lines,saved,
    current:()=>service,oldRevision};
}

test('repair changes only installation ID and preserves unknown future settings and keys',()=>{
  const before=config(),snapshot=copy(before);
  const after=repairedConfig(before);
  assert.deepEqual(after,{...snapshot,githubInstallationId:INSTALLATION});
  assert.deepEqual(before,snapshot);
  assert.throws(()=>repairedConfig({...before,active:false}),{code:'ACTIVE_CONFIG_UNEXPECTED'});
});

test('secret resolution selects mounted numeric version, never first historical volume',()=>{
  assert.deepEqual(binding(spec(),CONFIG_FILE,CONFIG_SECRET),
    {secret:CONFIG_SECRET,version:'7',volume:'config-active'});
});

test('ambiguous and unpinned secret mounts are rejected',()=>{
  const duplicate=spec();
  duplicate.containers[0].volumeMounts.push({name:'orphan',mountPath:'/var/run/factory-config'});
  assert.throws(()=>binding(duplicate,CONFIG_FILE,CONFIG_SECRET),{code:'SECRET_MOUNT_UNCLEAR'});
  assert.throws(()=>binding(spec('latest'),CONFIG_FILE,CONFIG_SECRET),{code:'PINNED_SECRET_UNCLEAR'});
});

test('normalization permits config mount churn while retaining unrelated credential and env changes',()=>{
  const before=spec(),after=spec('8','config-renamed');
  assert.deepEqual(normalizeSpec(before),normalizeSpec(after));
  after.volumes.find(v=>v.name==='key-mount').secret.items[0].key='4';
  assert.notDeepEqual(normalizeSpec(before),normalizeSpec(after));
  const env=spec('8','config-renamed');
  env.containers[0].env[1].value='false';
  assert.notDeepEqual(normalizeSpec(before),normalizeSpec(env));
});

test('default plan verifies corrected credentials without cloud writes or game dispatch',async()=>{
  const h=harness(); await repair(h);
  assert.deepEqual(h.writes,[]);
  assert.ok(h.lines.includes('REPAIR_STATUS=PLAN_VERIFIED'));
  assert.ok(h.requests.every(r=>!r.url.endsWith('/dispatches')));
});

test('corrected token denial stops before every cloud write and keeps diagnostics sanitized',async()=>{
  const h=harness({denyToken:true});
  await assert.rejects(repair({...h,apply:true}),{code:'REPAIR_STOPPED'});
  assert.deepEqual(h.writes,[]);
  assert.ok(h.lines.includes('ERROR_CODE=GITHUB_HTTP_403'));
  assert.ok(!h.lines.join('\n').includes('SENSITIVE_PROVIDER_ERROR_FIXTURE'));
});

test('successful repair stages without traffic, preserves all config, then promotes verified revision',async()=>{
  const h=harness(); await repair({...h,apply:true});
  assert.deepEqual(h.writes,['secret-add','stage','promote']);
  assert.deepEqual(h.saved.get('8'),{...config(),githubInstallationId:INSTALLATION});
  assert.ok(h.lines.includes('REPAIR_STATUS=SUCCESS'));
  assert.notEqual(h.current().status.traffic[0].revisionName,OLD);
  for(const secret of ['PRIVATE_TOKEN_FIXTURE','PRIVATE_SESSION_FIXTURE','PRIVATE_PREVIEW_FIXTURE',PEM])
    assert.ok(!h.lines.join('\n').includes(secret));
});

test('staged environment, signing-key, or image drift stops before promotion',async()=>{
  for(const drift of ['env','key','image']) {
    const h=harness({drift});
    await assert.rejects(repair({...h,apply:true}),{code:'REPAIR_STOPPED'});
    assert.deepEqual(h.writes,['secret-add','stage']);
    assert.equal(h.current().status.traffic[0].revisionName,OLD);
    assert.ok(h.lines.includes('ERROR_CODE=UNEXPECTED_RUNTIME_CHANGE'));
  }
});

test('post-promotion health failure restores exactly the previous serving revision',async()=>{
  const h=harness({healthFailure:true});
  await assert.rejects(repair({...h,apply:true}),{code:'REPAIR_STOPPED'});
  assert.deepEqual(h.writes,['secret-add','stage','promote','rollback']);
  assert.equal(h.current().status.traffic[0].revisionName,OLD);
  assert.ok(h.lines.includes('ROLLBACK_STATUS=PREVIOUS_REVISION_RESTORED'));
});
