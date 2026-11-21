import test from 'node:test';
import assert from 'node:assert/strict';
import {rotate} from './rotate_private_worker_pin.mjs';
import {PROJECT,SERVICE,ORIGIN,CONFIG_FILE,CONFIG_SECRET,REPO,PIN as OLD_PIN,
  INSTALLATION} from './repair_github_installation.mjs';

const TARGET='b'.repeat(40);
const TREE='26a00dc72d4b39d12aa1b54dadfd38765b21b662';
const PREVIOUS='factory-gateway-appfix-mwpzazq8-3406';
const IMAGE='ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:83be22b96cdd83eaefa80c0ae321208bdff63f4ee926cc5ae28d064f91cee089';
const copy=value=>structuredClone(value);
const flag=(args,key)=>{
  const index=args.findIndex(value=>value===key||value.startsWith(key+'='));
  return index<0?undefined:args[index]===key?args[index+1]:args[index].slice(key.length+1);
};
function config() {
  return {projectId:PROJECT,gatewayOrigin:ORIGIN,appOrigin:'https://jzwyrzyk.github.io',
    previewOrigin:'https://factory-preview-ola734esta-ul.a.run.app',
    repository:'jzwyrzyk/family-game-factory',repositoryId:'1458033181',
    approvedSha:'dcb887e6a51ba000fda1ccc42b9d198f8b9895f9',
    workerRepository:REPO,workerRepositoryId:'1458899834',workerWorkflow:'factory-private.yml',
    workerApprovedSha:OLD_PIN,githubAppId:'5765875',githubInstallationId:INSTALLATION,
    githubPrivateKeyFile:'/var/run/factory-github/key.pem',active:true,
    approval:{enabled:true,model:'fixture-model',maxOutputTokens:4000},
    sessionKey:'PRIVATE_SESSION_FIXTURE',previewKey:'PRIVATE_PREVIEW_FIXTURE',
    familyId:'family-fixture',workspace:'workspace-fixture',maxJobMicroUsd:120000,
    additionalSettings:{keep:['all','unchanged']}};
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
    status:{imageDigest:'sha256:'+'a'.repeat(64),conditions:[{type:'Ready',status:'True'},
      {type:'Active',status:name===PREVIOUS?'True':'False',reason:name===PREVIOUS?'Ready':'Retired'}]}};
}
function harness(options={}) {
  const old=revision(PREVIOUS,'7');
  const template={metadata:{name:PREVIOUS,annotations:copy(old.metadata.annotations)},spec:copy(old.spec)};
  delete template.spec.containers[0].name;
  const service={metadata:{name:SERVICE,generation:22,resourceVersion:'22',
    annotations:{'run.googleapis.com/ingress':'all'}},spec:{template,traffic:[{revisionName:PREVIOUS,percent:100}]},
    status:{url:ORIGIN,observedGeneration:22,latestCreatedRevisionName:PREVIOUS,
      latestReadyRevisionName:PREVIOUS,conditions:[{type:'Ready',status:'True'}],
      traffic:[{revisionName:PREVIOUS,percent:100}]}};
  const condition="assertion.repository_owner_id=='357047835' && assertion.repository_id=='1458899834' && "+
    "assertion.ref=='refs/heads/main' && "+
    "assertion.workflow_ref=='family-game-factory-lab/family-game-factory-worker/.github/workflows/factory-private.yml@refs/heads/main' && "+
    "assertion.workflow_sha=='"+OLD_PIN+"' && assertion.environment=='factory-infrastructure'";
  const provider={name:'projects/1054529152893/locations/global/workloadIdentityPools/fgf-github/providers/private-worker',
    state:'ACTIVE',attributeCondition:options.badWif?condition+' || true':condition,
    oidc:{issuerUri:'https://token.actions.githubusercontent.com'},
    attributeMapping:{'google.subject':'assertion.sub','attribute.repository':'assertion.repository'}};
  const initialProvider=copy(provider);
  const revisions=new Map([[PREVIOUS,old]]),configs=new Map([['7',config()]]);
  const variables={FACTORY_PRIVATE_WORKER_SHA:OLD_PIN,FACTORY_ACTIONS_APPROVED:'true',
    FACTORY_SANDBOX_IMAGE:IMAGE,FACTORY_RUNNER_APP_ID:'5776342'};
  const permissions={contents:'read',organization_self_hosted_runners:'write'};
  if(options.missingGrant) delete permissions.contents;
  const installation={id:182384961,app_id:5776342,account:{login:'family-game-factory-lab',
    id:357047835,type:'Organization'},target_id:357047835,target_type:'Organization',
    suspended_at:null,repository_selection:'selected',permissions};
  let candidate,tag,hasTargetTag=false,clock=Date.UTC(2026,10,21,9),failedWrite=false;
  const writes=[],cloudCalls=[],ghCalls=[],requests=[],lines=[];
  const serving=()=>service.status.traffic.find(t=>t.percent===100)?.revisionName;
  function reconcile() {
    service.metadata.generation++;
    service.metadata.resourceVersion=String(service.metadata.generation);
    service.status.observedGeneration=service.metadata.generation;
    service.spec.traffic=copy(service.status.traffic).map(({url,...row})=>row);
  }
  function cloud(args,input) {
    cloudCalls.push([...args]);
    const op=args.slice(0,3).join(' ');
    if(op==='run services describe') return JSON.stringify(service);
    if(op==='run revisions describe') {
      assert.ok(revisions.has(args[3])); return JSON.stringify(revisions.get(args[3]));
    }
    if(op==='secrets versions access') {
      assert.equal(flag(args,'--secret'),CONFIG_SECRET);
      assert.ok(configs.has(args[3])); return JSON.stringify(configs.get(args[3]));
    }
    if(op==='secrets versions add') {
      assert.equal(args[3],CONFIG_SECRET); assert.ok(args.includes('--data-file=-'));
      configs.set('8',JSON.parse(input)); writes.push('config-add');
      return JSON.stringify({name:'projects/1054529152893/secrets/'+CONFIG_SECRET+'/versions/8'});
    }
    if(args[0]==='iam'&&args[1]==='workload-identity-pools'&&args[2]==='providers') {
      assert.equal(args[4],'private-worker');
      assert.equal(flag(args,'--workload-identity-pool'),'fgf-github');
      assert.equal(flag(args,'--location'),'global');
      if(args[3]==='describe') return JSON.stringify(provider);
      assert.equal(args[3],'update-oidc');
      provider.attributeCondition=flag(args,'--attribute-condition');
      const isNew=provider.attributeCondition.includes(TARGET);
      writes.push(isNew?'wif-new':'wif-old');
      if(options.failedWrite==='wif'&&isNew&&!failedWrite) {
        failedWrite=true; throw Object.assign(new Error(),{code:'AMBIGUOUS_UPDATE_FIXTURE'});
      }
      return JSON.stringify(provider);
    }
    if(op==='run services update') {
      assert.equal(args[3],SERVICE); assert.ok(args.includes('--no-traffic'));
      assert.equal(flag(args,'--update-secrets'),CONFIG_FILE+'='+CONFIG_SECRET+':8');
      assert.equal(serving(),PREVIOUS);
      candidate=SERVICE+'-'+flag(args,'--revision-suffix');
      assert.ok(candidate.startsWith('factory-gateway-workerpin-'+TARGET.slice(0,8)+'-'));
      const next=revision(candidate,'8'); revisions.set(candidate,next);
      service.spec.template={metadata:copy(next.metadata),spec:copy(next.spec)};
      delete service.spec.template.spec.containers[0].name;
      service.status.latestCreatedRevisionName=candidate;
      // Retired zero-traffic revision need not become latestReady yet.
      reconcile(); writes.push('stage'); return JSON.stringify(service);
    }
    if(op==='run services update-traffic') {
      const add=flag(args,'--update-tags'),to=flag(args,'--to-revisions'),remove=flag(args,'--remove-tags');
      if(add) {
        const [name,revisionName]=add.split('='); tag=name;
        assert.equal(revisionName,candidate); assert.equal(serving(),PREVIOUS);
        service.status.traffic.push({tag,revisionName:candidate,
          url:'https://'+tag+'---'+new URL(ORIGIN).hostname});
        writes.push('tag-add');
      } else if(to) {
        const [name,percent]=to.split('='); assert.equal(percent,'100');
        assert.ok([PREVIOUS,candidate].includes(name));
        if(name===candidate) assert.ok(requests.some(r=>r.tagged&&r.healthy));
        service.status.traffic=service.status.traffic.filter(t=>t.tag);
        service.status.traffic.unshift({revisionName:name,percent:100});
        service.status.latestReadyRevisionName=name;
        writes.push(name===PREVIOUS?'rollback':'promote');
      } else if(remove) {
        assert.equal(remove,tag); service.status.traffic=service.status.traffic.filter(t=>t.tag!==tag);
        writes.push('tag-remove');
      } else assert.fail('Unexpected traffic mutation');
      reconcile(); return JSON.stringify(service);
    }
    assert.fail('Unexpected cloud operation '+args.slice(0,4).join(' '));
  }
  function gh(args,input) {
    ghCalls.push([...args]);
    if(args[0]==='variable'&&args[1]==='set') {
      assert.equal(args[2],'FACTORY_PRIVATE_WORKER_SHA'); assert.equal(flag(args,'--repo'),REPO);
      const value=flag(args,'--body'); assert.ok([OLD_PIN,TARGET].includes(value));
      variables.FACTORY_PRIVATE_WORKER_SHA=value; writes.push(value===TARGET?'var-new':'var-old');
      if(options.failedWrite==='variable'&&value===TARGET&&!failedWrite) {
        failedWrite=true; throw Object.assign(new Error(),{code:'AMBIGUOUS_UPDATE_FIXTURE'});
      }
      return '';
    }
    assert.equal(args[0],'api');
    const path=args[1];
    if(path==='orgs/family-game-factory-lab/installations?per_page=100')
      return JSON.stringify([{total_count:1,installations:[installation]}]);
    assert.ok(path.startsWith('repos/'+REPO+'/'));
    if(path.endsWith('/git/ref/heads/main'))
      return JSON.stringify({object:{type:'commit',sha:options.badMain?'c'.repeat(40):TARGET}});
    if(path.includes('/git/commits/')) return JSON.stringify({sha:TARGET,
      tree:{sha:options.badTree?'c'.repeat(40):TREE},parents:[{sha:OLD_PIN}]});
    if(path.includes('/git/matching-refs/')) return JSON.stringify(hasTargetTag?
      [{ref:'refs/tags/factory-execution-'+TARGET,object:{type:'commit',sha:TARGET}}]:[]);
    if(path.endsWith('/git/refs')) {
      assert.equal(flag(args,'--method')||flag(args,'-X'),'POST');
      assert.deepEqual(JSON.parse(input),{ref:'refs/tags/factory-execution-'+TARGET,sha:TARGET});
      hasTargetTag=true; writes.push('tag-create');
      return JSON.stringify({ref:'refs/tags/factory-execution-'+TARGET,object:{type:'commit',sha:TARGET}});
    }
    if(path.includes('/actions/variables/')) {
      const name=path.split('/').at(-1); assert.ok(Object.hasOwn(variables,name));
      return JSON.stringify({name,value:variables[name]});
    }
    if(path.includes('/git/ref/tags/')) return JSON.stringify({object:{type:'commit',sha:TARGET}});
    assert.fail('Unexpected GitHub operation '+path);
  }
  async function transport(url) {
    const tagged=url!==ORIGIN+'/health';
    assert.equal(url,tagged?'https://'+tag+'---'+new URL(ORIGIN).hostname+'/health':ORIGIN+'/health');
    const healthy=tagged?!options.stagedHealthFailure:
      !(options.mainHealthFailure&&serving()===candidate);
    requests.push({tagged,healthy,serving:serving()});
    if(tagged&&healthy&&options.concurrentChange) {
      service.spec.template.spec.containers[0].env.push({name:'CONCURRENT_SETTING',value:'preserve-me'});
      reconcile();
    }
    return {status:healthy?200:503,ok:healthy,json:async()=>({ready:healthy,paidExecution:healthy})};
  }
  return {targetPin:TARGET,apply:true,cloud,gh,transport,report:line=>lines.push(line),
    sleep:async ms=>{clock+=Math.max(ms||0,1000);},now:()=>clock,
    writes,cloudCalls,ghCalls,requests,lines,serving,service,variables,provider,initialProvider,configs,
    candidate:()=>candidate};
}

test('rotates only worker pin after tagged health and preserves keys, spending, image, and WIF clauses',async()=>{
  const h=harness(); await rotate(h);
  assert.equal(h.serving(),h.candidate());
  assert.equal(h.variables.FACTORY_PRIVATE_WORKER_SHA,TARGET);
  assert.deepEqual(h.configs.get('8'),{...config(),workerApprovedSha:TARGET});
  assert.deepEqual(h.provider,{...h.initialProvider,
    attributeCondition:h.initialProvider.attributeCondition.replace(OLD_PIN,TARGET)});
  assert.ok(h.requests.some(r=>r.tagged&&r.healthy&&r.serving===PREVIOUS));
  assert.ok(h.writes.includes('promote'));
  assert.ok(!h.service.status.traffic.some(t=>t.tag));
  assert.ok(!h.ghCalls.some(a=>a.some(v=>v.includes('/dispatches'))));
  assert.ok(!h.lines.join('\n').includes('PRIVATE_SESSION_FIXTURE'));
});

test('plan verifies current evidence without cloud or GitHub mutations',async()=>{
  const h=harness(); await rotate({...h,apply:false});
  assert.deepEqual(h.writes,[]); assert.equal(h.serving(),PREVIOUS);
});

test('missing runner App permission stops before any mutation',async()=>{
  const h=harness({missingGrant:true}); await assert.rejects(rotate(h));
  assert.deepEqual(h.writes,[]);
});

test('unexpected main, unreviewed tree, or broader WIF each stops before any mutation',async()=>{
  for(const bad of ['badMain','badTree','badWif']) {
    const h=harness({[bad]:true}); await assert.rejects(rotate(h));
    assert.deepEqual(h.writes,[],bad);
  }
});

test('staged health failure never promotes and retains old effective pins',async()=>{
  const h=harness({stagedHealthFailure:true}); await assert.rejects(rotate(h));
  assert.ok(h.writes.includes('stage')); assert.ok(!h.writes.includes('promote'));
  assert.equal(h.serving(),PREVIOUS);
  assert.equal(h.variables.FACTORY_PRIVATE_WORKER_SHA,OLD_PIN);
  assert.deepEqual(h.provider,h.initialProvider);
});

test('ambiguous WIF or variable update failures recover old pins and old production traffic',async()=>{
  for(const failedWrite of ['wif','variable']) {
    const h=harness({failedWrite}); await assert.rejects(rotate(h));
    assert.ok(h.writes.includes(failedWrite==='wif'?'wif-new':'var-new'));
    assert.equal(h.serving(),PREVIOUS,failedWrite);
    assert.equal(h.variables.FACTORY_PRIVATE_WORKER_SHA,OLD_PIN,failedWrite);
    assert.deepEqual(h.provider,h.initialProvider,failedWrite);
  }
});

test('failed live health rolls back traffic and both worker trust pins',async()=>{
  const h=harness({mainHealthFailure:true}); await assert.rejects(rotate(h));
  assert.ok(h.writes.includes('promote')); assert.ok(h.writes.includes('rollback'));
  assert.equal(h.serving(),PREVIOUS);
  assert.equal(h.variables.FACTORY_PRIVATE_WORKER_SHA,OLD_PIN);
  assert.deepEqual(h.provider,h.initialProvider);
});

test('concurrent staged configuration change is preserved and prevents promotion',async()=>{
  const h=harness({concurrentChange:true}); await assert.rejects(rotate(h));
  assert.ok(!h.writes.includes('promote')); assert.equal(h.serving(),PREVIOUS);
  assert.ok(h.service.spec.template.spec.containers[0].env.some(e=>e.name==='CONCURRENT_SETTING'));
});
