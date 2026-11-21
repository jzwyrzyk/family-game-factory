#!/usr/bin/env node
// Owner-run, configuration-only rotation after the reviewed private workflow merge.
// Config, signing keys, and command diagnostics remain in memory and are never printed.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PROJECT, REGION, SERVICE, ORIGIN, CONFIG_SECRET, CONFIG_FILE, REPO,
  INSTALLATION, ensure, binding, normalizeSpec,
  runtimeAnnotations, sameTemplateAndRevision, servingRevision} from './repair_github_installation.mjs';

export const OLD_PIN = 'ca2989988fd1cd66d9a858cbf167dd4a995640fc';
// Independently reviewed private runner-readiness timeout repair.
export const REVIEWED_TREE = '649b0418884b7236e82a92fdae91ea426867b7e8';
export const RUNNER_APP = 5776342;
export const RUNNER_INSTALLATION = 182384961;
export const IMAGE = 'ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:83be22b96cdd83eaefa80c0ae321208bdff63f4ee926cc5ae28d064f91cee089';
const ORG = 'family-game-factory-lab';
const canonical = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k,x[k]])) : x);
const same = (a,b) => canonical(a) === canonical(b);
const atom = x => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(x) ? x : null;
const ready = s => s.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True');
const reconciled = s => s.metadata?.generation !== undefined && s.status?.observedGeneration !== undefined &&
  String(s.metadata.generation) === String(s.status.observedGeneration);
const stamp = s => ({metadata:s.metadata,spec:s.spec});
const providerRest = w => { const {attributeCondition,...rest}=w; return rest; };
const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function checkWif(wif, pin) {
  const condition = wif.attributeCondition;
  const claims = {repository_owner_id:'357047835',repository_id:'1458899834',
    ref:'refs/heads/main',workflow_ref:REPO+'/.github/workflows/factory-private.yml@refs/heads/main',
    workflow_sha:pin};
  ensure(wif.state === 'ACTIVE' && wif.disabled !== true && typeof condition === 'string' &&
    !condition.includes('||') && Object.entries(claims).every(([key,value]) =>
      new RegExp('assertion\\.'+key+'\\s*==\\s*[\'\"]'+escapeRE(value)+'[\'\"]').test(condition)) &&
    new Set(condition.match(/(?<![a-f0-9])[a-f0-9]{40}(?![a-f0-9])/g) || []).size === 1 &&
    (condition.match(/(?<![a-f0-9])[a-f0-9]{40}(?![a-f0-9])/g) || []).every(x => x === pin) &&
    condition.includes('factory-infrastructure'), 'WIF_TRUST_DRIFT');
  // The accepted provider's infrastructure clause is retained byte-for-byte.
  // Do not rewrite its existing sub/environment representation during a SHA rotation.
}

export async function rotate({targetPin,apply=false,cloud,gh,transport=fetch,report=console.log,
  sleep=ms => new Promise(resolve => setTimeout(resolve,ms)),now=() => Date.now()}) {
  let stage='START', initial, lastService, oldRevision, candidate, candidateRevision, newVersion;
  let previous, oldConfigVersion;
  let ownTag, tagAttempted=false, promotionAttempted=false, mainHealthy=false;
  let initialWif, nextCondition, initialVariable, wifAttempted=false, variableAttempted=false;
  const emit=(key,value) => report(key+'='+value);
  const step=value => { stage=value; emit('STEP',value); };
  const api=(path,body) => JSON.parse(gh(['api',path,...(body ? ['--method','POST','--input','-'] : [])],
    body ? JSON.stringify(body) : undefined));
  const variable=name => api('repos/'+REPO+'/actions/variables/'+name).value;
  const setVariable=value => gh(['variable','set','FACTORY_PRIVATE_WORKER_SHA','--repo',REPO,'--body',value]);
  const describe=() => (lastService=JSON.parse(cloud(['run','services','describe',SERVICE,
    '--region='+REGION,'--format=json'])));
  const revision=name => JSON.parse(cloud(['run','revisions','describe',name,'--region='+REGION,'--format=json']));
  const readConfig=version => JSON.parse(cloud(['secrets','versions','access',version,'--secret='+CONFIG_SECRET]));
  const provider=() => JSON.parse(cloud(['iam','workload-identity-pools','providers','describe','private-worker',
    '--location=global','--workload-identity-pool=fgf-github','--format=json']));
  const writeProvider=condition => cloud(['iam','workload-identity-pools','providers','update-oidc','private-worker',
    '--location=global','--workload-identity-pool=fgf-github','--attribute-condition='+condition,
    '--quiet','--format=json']);
  const traffic=args => cloud(['run','services','update-traffic',SERVICE,'--region='+REGION,
    ...args,'--quiet','--format=json']);
  const summary=s => emit('SERVICE_STATE',JSON.stringify({latestCreated:atom(s.status?.latestCreatedRevisionName),
    latestReady:atom(s.status?.latestReadyRevisionName),template:atom(s.spec?.template?.metadata?.name),
    reconciled:reconciled(s),traffic:(s.status?.traffic || []).map(t => ({revision:atom(t.revisionName),
      percent:Number(t.percent)||0,tag:atom(t.tag)})),conditions:(s.status?.conditions || []).slice(0,10)
      .map(c => ({type:atom(c.type),status:atom(c.status),reason:atom(c.reason)}))}));
  const unchanged=s => {
    const fresh=describe();
    ensure(typeof s.metadata?.resourceVersion === 'string' && same(stamp(s),stamp(fresh)),
      'CONCURRENT_SERVICE_CHANGE');
    return fresh;
  };
  const mainRef=() => {
    const ref=api('repos/'+REPO+'/git/ref/heads/main');
    ensure(ref.object?.type === 'commit' && ref.object.sha === targetPin,'MAIN_PIN_CHANGED');
  };
  const tagState=() => {
    const name='refs/tags/factory-execution-'+targetPin;
    const refs=api('repos/'+REPO+'/git/matching-refs/tags/factory-execution-'+targetPin);
    ensure(Array.isArray(refs),'TAG_RESPONSE_INVALID');
    const exact=refs.filter(r => r.ref === name);
    ensure(exact.length <= 1,'TAG_AMBIGUOUS');
    if(exact.length) ensure(exact[0].object?.type === 'commit' && exact[0].object.sha === targetPin,
      'IMMUTABLE_TAG_MISMATCH');
    return exact.length === 1;
  };
  async function health(origin,code) {
    for(let i=0;i<3;i++) {
      try {
        const r=await transport(origin+'/health',{redirect:'error',signal:AbortSignal.timeout(20000)});
        const body=await r.json();
        if(r.status === 200 && body.ready === true && body.paidExecution === true) return;
      } catch {}
      if(i<2) await sleep(2000);
    }
    ensure(false,code);
  }
  function runtime(s) {
    ensure(s.status?.latestCreatedRevisionName === candidate && s.spec?.template?.metadata?.name === candidate &&
      [previous,candidate].includes(servingRevision(s)) &&
      same(runtimeAnnotations(initial.metadata),runtimeAnnotations(s.metadata)), 'STAGED_SERVICE_CHANGED');
    const mounted=binding(s.spec.template.spec,CONFIG_FILE,CONFIG_SECRET);
    ensure(mounted.version === newVersion && sameTemplateAndRevision(s.spec.template.spec,candidateRevision.spec),
      'STAGED_TEMPLATE_CHANGED');
  }
  async function settle() {
    for(let i=0;i<12;i++) {
      const s=describe(); runtime(s);
      if(ready(s) && reconciled(s)) return s;
      if(i<11) await sleep(2000);
    }
    ensure(false,'SERVICE_RECONCILIATION_INCOMPLETE');
  }
  async function providerReadback(condition) {
    for(let i=0;i<12;i++) {
      const current=provider();
      ensure(same(providerRest(current),providerRest(initialWif)),'WIF_CONFIGURATION_CHANGED');
      if(current.attributeCondition === condition) return current;
      ensure([initialWif.attributeCondition,nextCondition].includes(current.attributeCondition),
        'CONCURRENT_WIF_CHANGE');
      if(i<11) await sleep(2000);
    }
    ensure(false,'WIF_UPDATE_UNVERIFIED');
  }
  async function cleanupTag() {
    if(!tagAttempted) return;
    try {
      const s=describe();
      const tags=[...(s.spec?.traffic || []),...(s.status?.traffic || [])].filter(t => t.tag === ownTag);
      if(!tags.length) { emit('TAG_CLEANUP','VERIFIED_ABSENT'); return; }
      ensure(tags.every(t => t.revisionName === candidate && !t.latestRevision),'TAG_BINDING_CHANGED');
      const before=servingRevision(s); unchanged(s);
      traffic(['--remove-tags='+ownTag]);
      const after=describe();
      ensure(servingRevision(after) === before && same(after.spec.template,s.spec.template) &&
        ![...(after.spec?.traffic || []),...(after.status?.traffic || [])].some(t => t.tag === ownTag),
        'TAG_CLEANUP_UNVERIFIED');
      emit('TAG_CLEANUP','VERIFIED');
    } catch { emit('TAG_CLEANUP','PENDING_OWNER_REVIEW'); }
  }
  function verifyRevision(next,expectedConfig) {
    const mounted=binding(next.spec,CONFIG_FILE,CONFIG_SECRET);
    ensure(same(readConfig(mounted.version),expectedConfig),'STAGED_CONFIG_CONTENT_MISMATCH');
    ensure(same(normalizeSpec(oldRevision.spec),normalizeSpec(next.spec)) &&
      same(runtimeAnnotations(oldRevision.metadata),runtimeAnnotations(next.metadata)) &&
      oldRevision.status.imageDigest === next.status?.imageDigest,'UNEXPECTED_RUNTIME_CHANGE');
    return mounted.version;
  }
  try {
    step('VERIFY_REVIEWED_RELEASE');
    ensure(/^[a-f0-9]{40}$/.test(String(targetPin)) && targetPin !== OLD_PIN,'TARGET_PIN_INVALID');
    ensure(/^[a-f0-9]{40}$/.test(REVIEWED_TREE),'REVIEWED_TREE_REQUIRED');
    mainRef();
    const commit=api('repos/'+REPO+'/git/commits/'+targetPin);
    ensure(commit.sha === targetPin && commit.tree?.sha === REVIEWED_TREE,'UNREVIEWED_COMMIT_TREE');
    let hasTag=tagState();
    initialVariable=variable('FACTORY_PRIVATE_WORKER_SHA');
    ensure([OLD_PIN,targetPin].includes(initialVariable),'PRIVATE_VARIABLE_DRIFT');
    ensure(variable('FACTORY_ACTIONS_APPROVED') === 'true','ACTIONS_APPROVAL_CHANGED');
    ensure(variable('FACTORY_SANDBOX_IMAGE') === IMAGE,'SANDBOX_IMAGE_DRIFT');
    ensure(String(variable('FACTORY_RUNNER_APP_ID')) === String(RUNNER_APP),'RUNNER_APP_CHANGED');
    const pages=JSON.parse(gh(['api','orgs/'+ORG+'/installations?per_page=100','--paginate','--slurp']));
    ensure(Array.isArray(pages),'INSTALLATION_RESPONSE_INVALID');
    const installations=pages.flatMap(p => p.installations || []).filter(i => i.app_id === RUNNER_APP);
    ensure(installations.length === 1 && installations[0].id === RUNNER_INSTALLATION &&
      installations[0].account?.login === ORG && !installations[0].suspended_at &&
      ['read','write'].includes(installations[0].permissions?.contents) &&
      installations[0].permissions?.organization_self_hosted_runners === 'write','RUNNER_APP_GRANTS_MISSING');
    emit('RUNNER_APP_PERMISSIONS','VERIFIED');

    step('READ_CURRENT_RUNTIME');
    initial=describe(); summary(initial);
    ensure(ready(initial) && reconciled(initial),'CURRENT_SERVICE_NOT_RECONCILED');
    previous=servingRevision(initial);
    oldRevision=revision(previous);
    oldConfigVersion=binding(oldRevision.spec,CONFIG_FILE,CONFIG_SECRET).version;
    ensure(ready(oldRevision) &&
      typeof oldRevision.status?.imageDigest === 'string' && oldRevision.status.imageDigest.length>0,
      'PREVIOUS_RUNTIME_UNEXPECTED');
    const current=readConfig(oldConfigVersion);
    ensure(current.projectId === PROJECT && current.gatewayOrigin === ORIGIN && current.workerRepository === REPO &&
      current.workerRepositoryId === '1458899834' && current.workerWorkflow === 'factory-private.yml' &&
      [OLD_PIN,targetPin].includes(current.workerApprovedSha) && String(current.githubInstallationId) === INSTALLATION &&
      current.active === true && current.approval?.enabled === true && !current.localFile,'CURRENT_CONFIG_UNEXPECTED');
    const next={...current,workerApprovedSha:targetPin};
    const env=Object.fromEntries((oldRevision.spec.containers[0].env || [])
      .filter(e => Object.hasOwn(e,'value')).map(e => [e.name,e.value]));
    ensure(env.FACTORY_PRIVATE_CONFIG === CONFIG_FILE && env.FACTORY_BOOTSTRAP !== 'true' &&
      ['FACTORY_ACTIONS_APPROVED','FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED',
        'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'].every(k => env[k] === 'true'),'ADULT_RUNTIME_CHANGED');
    const latest=initial.status?.latestCreatedRevisionName;
    if(current.workerApprovedSha === targetPin) {
      // Verify the current release on an idempotent invocation. There is no
      // historical baseline here from which to claim the prior exact delta.
      ensure(latest === previous && initial.spec?.template?.metadata?.name === previous &&
        binding(initial.spec.template.spec,CONFIG_FILE,CONFIG_SECRET).version === oldConfigVersion &&
        sameTemplateAndRevision(initial.spec.template.spec,oldRevision.spec),'CURRENT_TEMPLATE_DRIFT');
      ensure(hasTag && initialVariable === targetPin,'CURRENT_RELEASE_TRUST_MISMATCH');
      initialWif=provider(); checkWif(initialWif,targetPin);
      unchanged(initial);
      await health(ORIGIN,'LIVE_GATEWAY_HEALTH_FAILED');
      unchanged(initial); mainRef();
      ensure(tagState() && variable('FACTORY_PRIVATE_WORKER_SHA') === targetPin &&
        variable('FACTORY_ACTIONS_APPROVED') === 'true' &&
        variable('FACTORY_SANDBOX_IMAGE') === IMAGE,'FINAL_GITHUB_TRUST_DRIFT');
      const verifiedWif=provider(); checkWif(verifiedWif,targetPin);
      ensure(same(verifiedWif,initialWif),'CONCURRENT_WIF_CHANGE');
      mainHealthy=true;
      emit('CURRENT_RELEASE','CONFIG_TRUST_AND_HEALTH_VERIFIED');
      emit('GATEWAY_HEALTH','READY_ADULT_ENABLED'); emit('SERVING_REVISION',previous);
      emit('CONFIG_VERSION',oldConfigVersion); emit('PRIVATE_WORKER_SHA',targetPin);
      emit('ROTATION_STATUS','ALREADY_APPLIED'); return;
    }
    if(latest === previous) {
      ensure(initial.spec?.template?.metadata?.name === previous &&
        binding(initial.spec.template.spec,CONFIG_FILE,CONFIG_SECRET).version === oldConfigVersion &&
        sameTemplateAndRevision(initial.spec.template.spec,oldRevision.spec),'CURRENT_TEMPLATE_DRIFT');
    } else {
      ensure(typeof latest === 'string' && latest.startsWith(SERVICE+'-workerpin-'+targetPin.slice(0,8)+'-') &&
        latest.length<=63 && /^[a-z0-9-]+$/.test(latest),'UNEXPECTED_PENDING_REVISION');
      candidate=latest; candidateRevision=revision(candidate);
      newVersion=verifyRevision(candidateRevision,next); runtime(initial);
      emit('EXISTING_STAGE','REUSED');
    }
    initialWif=provider();
    const wifPin=initialWif.attributeCondition?.includes(OLD_PIN) ? OLD_PIN : targetPin;
    checkWif(initialWif,wifPin);
    nextCondition=initialWif.attributeCondition.split(OLD_PIN).join(targetPin);
    checkWif({...initialWif,attributeCondition:nextCondition},targetPin);
    emit('PREVIOUS_REVISION',previous); emit('PREVIOUS_CONFIG_VERSION',oldConfigVersion);
    emit('TARGET_PRIVATE_SHA',targetPin); emit('ONLY_CONFIG_FIELD_CHANGED','workerApprovedSha');
    if(!apply) { emit('ROTATION_STATUS','PLAN_VERIFIED'); return; }

    step('ENSURE_IMMUTABLE_EXECUTION_TAG');
    mainRef(); unchanged(initial);
    if(!hasTag) {
      api('repos/'+REPO+'/git/refs',{ref:'refs/tags/factory-execution-'+targetPin,sha:targetPin});
      hasTag=tagState();
    }
    ensure(hasTag,'EXECUTION_TAG_UNVERIFIED');
    if(!candidate) {
      step('STAGE_PINNED_GATEWAY_CONFIG');
      unchanged(initial);
      const added=JSON.parse(cloud(['secrets','versions','add',CONFIG_SECRET,'--data-file=-','--format=json'],JSON.stringify(next)));
      newVersion=String(added.name || '').split('/').at(-1);
      ensure(/^[0-9]+$/.test(newVersion) && same(readConfig(newVersion),next),'NEW_CONFIG_VERSION_UNVERIFIED');
      emit('NEW_CONFIG_VERSION',newVersion); unchanged(initial);
      const suffix='workerpin-'+targetPin.slice(0,8)+'-'+now().toString(36)+'-'+randomBytes(2).toString('hex');
      candidate=SERVICE+'-'+suffix;
      cloud(['run','services','update',SERVICE,'--region='+REGION,
        '--update-secrets='+CONFIG_FILE+'='+CONFIG_SECRET+':'+newVersion,
        '--revision-suffix='+suffix,'--no-traffic','--quiet','--format=json']);
      candidateRevision=revision(candidate);
      ensure(verifyRevision(candidateRevision,next) === newVersion,'STAGED_CONFIG_VERSION_MISMATCH');
    }
    let checked=await settle();
    if(servingRevision(checked) === previous) {
      step('VERIFY_TAGGED_CANDIDATE');
      ownTag='workerpin-check-'+randomBytes(6).toString('hex');
      ensure(![...(checked.spec.traffic || []),...(checked.status.traffic || [])].some(t => t.tag === ownTag),
        'TAG_COLLISION');
      unchanged(checked); tagAttempted=true; traffic(['--update-tags='+ownTag+'='+candidate]);
      checked=await settle();
      ensure(servingRevision(checked) === previous,'TRAFFIC_CHANGED_BEFORE_CHECK');
      const routes=(checked.status.traffic || []).filter(t => t.tag === ownTag);
      ensure(routes.length === 1 && routes[0].revisionName === candidate && !Number(routes[0].percent),'TAG_UNVERIFIED');
      const url=new URL(routes[0].url);
      ensure(url.protocol === 'https:' && url.hostname === ownTag+'---'+new URL(ORIGIN).hostname &&
        !url.port && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,'TAG_URL_UNEXPECTED');
      await health(url.origin,'STAGED_GATEWAY_HEALTH_FAILED');
      checked=unchanged(checked); runtime(checked);
      emit('STAGED_GATEWAY_HEALTH','READY_ADULT_ENABLED');
    } else await health(ORIGIN,'LIVE_GATEWAY_HEALTH_FAILED');

    step('ROTATE_PRIVATE_WORKER_TRUST');
    mainRef(); ensure(tagState(),'EXECUTION_TAG_UNVERIFIED'); unchanged(checked);
    ensure(variable('FACTORY_ACTIONS_APPROVED') === 'true','ACTIONS_APPROVAL_CHANGED');
    ensure(variable('FACTORY_PRIVATE_WORKER_SHA') === initialVariable,'CONCURRENT_VARIABLE_CHANGE');
    ensure(same(provider(),initialWif),'CONCURRENT_WIF_CHANGE');
    if(initialWif.attributeCondition !== nextCondition) {
      wifAttempted=true; writeProvider(nextCondition);
    }
    await providerReadback(nextCondition);
    if(initialVariable !== targetPin) {
      ensure(variable('FACTORY_PRIVATE_WORKER_SHA') === initialVariable,'CONCURRENT_VARIABLE_CHANGE');
      variableAttempted=true; setVariable(targetPin);
    }
    ensure(variable('FACTORY_PRIVATE_WORKER_SHA') === targetPin,'PRIVATE_VARIABLE_UPDATE_UNVERIFIED');
    emit('WORKER_TRUST','MAIN_TAG_VARIABLE_WIF_VERIFIED');

    step('PROMOTE_VERIFIED_GATEWAY');
    checked=unchanged(checked); runtime(checked); mainRef();
    if(servingRevision(checked) !== candidate) {
      promotionAttempted=true; traffic(['--to-revisions='+candidate+'=100']);
    }
    const live=await settle();
    ensure(servingRevision(live) === candidate,'PROMOTION_UNVERIFIED');
    await health(ORIGIN,'LIVE_GATEWAY_HEALTH_FAILED'); mainHealthy=true;
    mainRef(); ensure(tagState() && variable('FACTORY_PRIVATE_WORKER_SHA') === targetPin &&
      variable('FACTORY_ACTIONS_APPROVED') === 'true','FINAL_GITHUB_TRUST_DRIFT');
    checkWif(await providerReadback(nextCondition),targetPin);
    ensure(binding(revision(candidate).spec,CONFIG_FILE,CONFIG_SECRET).version === newVersion,
      'FINAL_CONFIG_BINDING_CHANGED');
    emit('GATEWAY_HEALTH','READY_ADULT_ENABLED'); emit('SERVING_REVISION',candidate);
    emit('CONFIG_VERSION',newVersion); emit('PRIVATE_WORKER_SHA',targetPin);
    await cleanupTag(); emit('ROTATION_STATUS','SUCCESS');
  } catch(error) {
    emit('FAILED_STAGE',stage);
    const code=error?.code || error?.cause?.code || error?.name;
    emit('ERROR_CODE',/^[A-Za-z0-9_]{1,80}$/.test(String(code)) ? code : 'UNCLASSIFIED');
    if(lastService) summary(lastService);
    if(!mainHealthy) {
      if(promotionAttempted) {
        try {
          const s=describe(); runtime(s); unchanged(s);
          traffic(['--to-revisions='+previous+'=100']);
          ensure(servingRevision(describe()) === previous,'TRAFFIC_ROLLBACK_UNVERIFIED');
          emit('TRAFFIC_ROLLBACK','PREVIOUS_REVISION_RESTORED');
        } catch { emit('TRAFFIC_ROLLBACK','OWNER_REVIEW_REQUIRED'); }
      }
      if(variableAttempted) {
        try {
          const value=variable('FACTORY_PRIVATE_WORKER_SHA');
          ensure([initialVariable,targetPin].includes(value),'CONCURRENT_VARIABLE_CHANGE');
          if(value !== initialVariable) setVariable(initialVariable);
          ensure(variable('FACTORY_PRIVATE_WORKER_SHA') === initialVariable,'VARIABLE_ROLLBACK_UNVERIFIED');
          emit('VARIABLE_ROLLBACK','VERIFIED');
        } catch { emit('VARIABLE_ROLLBACK','OWNER_REVIEW_REQUIRED'); }
      }
      if(wifAttempted) {
        try {
          const current=provider();
          ensure(same(providerRest(current),providerRest(initialWif)) &&
            [initialWif.attributeCondition,nextCondition].includes(current.attributeCondition),'CONCURRENT_WIF_CHANGE');
          if(current.attributeCondition !== initialWif.attributeCondition) writeProvider(initialWif.attributeCondition);
          await providerReadback(initialWif.attributeCondition); emit('WIF_ROLLBACK','VERIFIED');
        } catch { emit('WIF_ROLLBACK','OWNER_REVIEW_REQUIRED'); }
      }
    }
    await cleanupTag();
    emit('MAIN_REF_ROLLBACK','NOT_PERFORMED');
    emit('ROTATION_STATUS','INCOMPLETE');
    throw Object.assign(new Error(),{code:'ROTATION_STOPPED'});
  }
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run=program => (args,input) => execFileSync(program,args,{input,encoding:'utf8',timeout:180000,
    stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024}).trim();
  const cloud=(args,input) => run('gcloud')([...args,'--project='+PROJECT],input);
  const index=process.argv.indexOf('--private-sha');
  rotate({targetPin:index<0 ? undefined : process.argv[index+1],apply:process.argv.includes('--apply'),cloud,gh:run('gh')})
    .catch(() => { process.exitCode=1; });
}
