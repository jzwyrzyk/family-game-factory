import test from 'node:test';
import assert from 'node:assert/strict';
import {finish} from './finish_github_installation.mjs';
import {PROJECT, SERVICE, ORIGIN, CONFIG_FILE, CONFIG_SECRET, REPO, PIN,
  INSTALLATION} from './repair_github_installation.mjs';

const PREVIOUS='factory-gateway-00011-vdf';
const CANDIDATE='factory-gateway-appfix-existing-reviewed';
const clone=value=>structuredClone(value);

function configuration() {
  return {projectId:PROJECT,gatewayOrigin:ORIGIN,workerRepository:REPO,
    workerRepositoryId:'1458899834',workerWorkflow:'factory-private.yml',workerApprovedSha:PIN,
    githubAppId:'5765875',githubInstallationId:'182105358',
    githubPrivateKeyFile:'/var/run/factory-github/key.pem',active:true,
    approval:{enabled:true,model:'fixture-model',maxOutputTokens:4000},
    sessionKey:'PRIVATE_SESSION_FIXTURE',previewKey:'PRIVATE_PREVIEW_FIXTURE',
    workspace:'workspace-fixture',familyId:'family-fixture',maxJobMicroUsd:120000};
}
function revision(name,version) {
  return {metadata:{name,annotations:{'run.googleapis.com/cpu-throttling':'true',
    'autoscaling.knative.dev/maxScale':'1'}},
    spec:{serviceAccountName:'factory-gateway@'+PROJECT+'.iam.gserviceaccount.com',
      timeoutSeconds:60,containerConcurrency:8,
      containers:[{name:'gateway-1',image:'example.test/gateway@sha256:'+'a'.repeat(64),
        resources:{limits:{cpu:'1',memory:'512Mi'}},
        env:[{name:'FACTORY_PRIVATE_CONFIG',value:CONFIG_FILE},
          ...['FACTORY_ACTIONS_APPROVED','FACTORY_ADULT_PILOT_MODE',
            'FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED']
            .map(name=>({name,value:'true'}))],
        volumeMounts:[{name:'config-'+version,mountPath:'/var/run/factory-config'},
          {name:'key-mount',mountPath:'/var/run/factory-github'}]}],
      volumes:[{name:'config-'+version,secret:{secretName:CONFIG_SECRET,
        items:[{key:version,path:'config.json'}]}},
        {name:'key-mount',secret:{secretName:'factory-github-app-private-key',
          items:[{key:'3',path:'key.pem'}]}}]},
    status:{imageDigest:'sha256:'+'a'.repeat(64),conditions:[
      {type:'Ready',status:'True'},
      {type:'Active',status:name===PREVIOUS?'True':'False',reason:name===PREVIOUS?'Ready':'Retired'},
      {type:'ResourcesAvailable',status:'True'},{type:'ContainerHealthy',status:'True'}]}};
}

function harness(options={}) {
  const candidate=options.unknownCandidate?'factory-gateway-unrelated':CANDIDATE;
  const previous=revision(PREVIOUS,'6'),staged=revision(candidate,'7');
  const old=configuration(),next={...clone(old),githubInstallationId:INSTALLATION};
  if(options.configDrift) next.maxJobMicroUsd=900000;
  const revisions=new Map([[PREVIOUS,previous],[candidate,staged]]);
  const configs=new Map([['6',old],['7',next]]);
  const template={metadata:{name:candidate,annotations:clone(staged.metadata.annotations)},
    spec:clone(staged.spec)};
  delete template.spec.containers[0].name;
  const service={metadata:{name:SERVICE,generation:12,resourceVersion:'12',
    annotations:{'run.googleapis.com/ingress':'all'}},
    spec:{template,traffic:[{revisionName:PREVIOUS,percent:100}]},
    status:{url:ORIGIN,observedGeneration:12,latestCreatedRevisionName:candidate,
      // Cloud Run can leave latestReady at the prior serving revision.
      latestReadyRevisionName:PREVIOUS,conditions:[{type:'Ready',status:'True'}],
      traffic:[{revisionName:PREVIOUS,percent:100}]}};
  const writes=[],calls=[],requests=[],lines=[];
  let clock=Date.UTC(2026,10,21,8),tag;
  const flag=(args,key)=>{
    const index=args.findIndex(value=>value===key||value.startsWith(key+'='));
    if(index<0) return undefined;
    return args[index]===key?args[index+1]:args[index].slice(key.length+1);
  };
  const serving=()=>service.status.traffic.find(t=>t.percent===100)?.revisionName;
  function reconcile() {
    service.metadata.generation++;
    service.metadata.resourceVersion=String(service.metadata.generation);
    service.status.observedGeneration=service.metadata.generation;
    service.spec.traffic=clone(service.status.traffic).map(({url,...entry})=>entry);
  }
  function cloud(args) {
    calls.push([...args]);
    const op=args.slice(0,3).join(' ');
    if(op==='run services describe') return JSON.stringify(service);
    if(op==='run revisions describe') {
      assert.ok(revisions.has(args[3]),'Only known existing revisions may be read');
      return JSON.stringify(revisions.get(args[3]));
    }
    if(op==='secrets versions access') {
      assert.equal(flag(args,'--secret'),CONFIG_SECRET);
      assert.ok(configs.has(args[3]));
      return JSON.stringify(configs.get(args[3]));
    }
    assert.equal(op,'run services update-traffic','No secret or revision creation is permitted');
    const update=flag(args,'--update-tags'),target=flag(args,'--to-revisions'),remove=flag(args,'--remove-tags');
    if(update) {
      const parts=update.split('='); tag=parts[0];
      assert.equal(parts[1],candidate);
      assert.equal(serving(),PREVIOUS,'Tagging must retain prior production traffic');
      writes.push('add-tag');
      service.status.traffic.push({tag,revisionName:options.concurrentTag?'factory-gateway-other':candidate,
        url:'https://'+tag+'---'+new URL(ORIGIN).hostname});
      reconcile();
      return JSON.stringify(service);
    }
    if(target) {
      const [name,percent]=target.split('=');
      assert.equal(percent,'100'); assert.ok([PREVIOUS,candidate].includes(name));
      if(name===candidate) assert.ok(requests.some(r=>r.tagged&&r.ready),
        'Tagged revision must pass health before promotion');
      writes.push(name===PREVIOUS?'rollback':'promote');
      service.status.traffic=service.status.traffic.filter(t=>t.tag);
      service.status.traffic.unshift({revisionName:name,percent:100});
      service.status.latestReadyRevisionName=name;
      reconcile();
      return JSON.stringify(service);
    }
    if(remove) {
      assert.equal(remove,tag,'Only the helper-owned temporary tag may be removed');
      writes.push('remove-tag');
      if(options.cleanupFailure) throw Object.assign(new Error(),{code:'CLEANUP_FIXTURE_FAILED'});
      service.status.traffic=service.status.traffic.filter(t=>t.tag!==remove);
      reconcile();
      return JSON.stringify(service);
    }
    assert.fail('Unexpected traffic mutation');
  }
  async function transport(url) {
    const tagged=url!==ORIGIN+'/health';
    if(tagged) assert.equal(url,'https://'+tag+'---'+new URL(ORIGIN).hostname+'/health');
    else assert.equal(url,ORIGIN+'/health');
    const healthy=tagged?!options.taggedHealthFailure:
      !(options.mainHealthFailure&&serving()===candidate);
    requests.push({url,tagged,ready:healthy,serving:serving()});
    return {status:healthy?200:503,ok:healthy,
      json:async()=>({ready:healthy,paidExecution:healthy})};
  }
  return {cloud,transport,report:line=>lines.push(line),
    wait:async ms=>{clock+=Math.max(ms||0,1000);},now:()=>clock,
    writes,calls,requests,lines,serving,service};
}

test('finishes existing retired stage using tagged health while previous revision stays at 100%',async()=>{
  const h=harness(); await finish({...h,apply:true});
  assert.equal(h.serving(),CANDIDATE);
  assert.deepEqual(h.writes,['add-tag','promote','remove-tag']);
  assert.ok(h.requests.some(r=>r.tagged&&r.ready&&r.serving===PREVIOUS));
  assert.ok(h.requests.some(r=>!r.tagged&&r.ready&&r.serving===CANDIDATE));
  assert.ok(!h.service.status.traffic.some(t=>t.tag));
  assert.ok(h.calls.every(c=>!['secrets versions add','run services update'].includes(c.slice(0,3).join(' '))));
  assert.ok(!h.lines.join('\n').includes('PRIVATE_SESSION_FIXTURE'));
});

test('plan mode inspects existing candidate without any cloud mutation',async()=>{
  const h=harness(); await finish(h);
  assert.deepEqual(h.writes,[]);
  assert.equal(h.serving(),PREVIOUS);
});

test('extra config difference stops before tagging or promotion',async()=>{
  const h=harness({configDrift:true});
  await assert.rejects(finish({...h,apply:true}));
  assert.deepEqual(h.writes,[]); assert.equal(h.serving(),PREVIOUS);
});

test('tagged health failure retains previous production and cleans the owned tag',async()=>{
  const h=harness({taggedHealthFailure:true});
  await assert.rejects(finish({...h,apply:true}));
  assert.equal(h.serving(),PREVIOUS);
  assert.ok(h.writes.includes('add-tag'));
  assert.ok(!h.writes.includes('promote'));
  assert.ok(!h.service.status.traffic.some(t=>t.tag));
});

test('canonical health failure after promotion rolls back to exact previous revision',async()=>{
  const h=harness({mainHealthFailure:true});
  await assert.rejects(finish({...h,apply:true}));
  assert.equal(h.serving(),PREVIOUS);
  assert.deepEqual(h.writes.filter(x=>x==='promote'||x==='rollback'),['promote','rollback']);
});

test('tag cleanup failure leaves a healthy promoted gateway serving',async()=>{
  const h=harness({cleanupFailure:true}); await finish({...h,apply:true});
  assert.equal(h.serving(),CANDIDATE);
  assert.ok(h.writes.includes('remove-tag'));
  assert.ok(!h.writes.includes('rollback'));
  assert.ok(h.lines.some(line=>/CLEANUP/.test(line)));
});

test('unknown candidate name stops without writes',async()=>{
  const h=harness({unknownCandidate:true});
  await assert.rejects(finish({...h,apply:true}));
  assert.deepEqual(h.writes,[]); assert.equal(h.serving(),PREVIOUS);
});

test('concurrent tag remapping is rejected before any promotion',async()=>{
  const h=harness({concurrentTag:true});
  await assert.rejects(finish({...h,apply:true}));
  assert.equal(h.serving(),PREVIOUS);
  assert.ok(h.writes.includes('add-tag'));
  assert.ok(!h.writes.includes('promote'));
});
