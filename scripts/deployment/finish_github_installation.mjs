#!/usr/bin/env node
// Finish the existing, verified configuration-only stage; never create another version/revision.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PROJECT, REGION, SERVICE, ORIGIN, CONFIG_SECRET, CONFIG_FILE, INSTALLATION,
  ensure, binding, normalizeSpec, runtimeAnnotations, repairedConfig,
  sameTemplateAndRevision, servingRevision} from './repair_github_installation.mjs';

export const PREVIOUS = 'factory-gateway-00011-vdf';
export const OLD_CONFIG = '6';
export const NEW_CONFIG = '7';
const canonical = value => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
const same = (a,b) => canonical(a) === canonical(b);
const atom = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(value)
  ? value : null;
const ready = value => value.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True');
const reconciled = value => value.metadata?.generation !== undefined &&
  value.status?.observedGeneration !== undefined &&
  String(value.metadata.generation) === String(value.status.observedGeneration);
const conditions = value => (value.status?.conditions || []).slice(0,10)
  .map(c => ({type:atom(c.type),status:atom(c.status),reason:atom(c.reason)}));

export async function finish({cloud, transport = fetch, report = console.log, apply = false,
  wait = ms => new Promise(resolve => setTimeout(resolve,ms)), now = () => Date.now()}) {
  let stage = 'START', candidate, tag, tagAttempted = false, promotionAttempted = false;
  let mainHealthy = false, initial, lastService;
  const emit = (key,value) => report(key+'='+value);
  const step = value => { stage=value; emit('STEP',value); };
  const describe = () => {
    lastService=JSON.parse(cloud(['run','services','describe',SERVICE,'--region='+REGION,'--format=json']));
    return lastService;
  };
  const revision = name => JSON.parse(cloud(['run','revisions','describe',name,
    '--region='+REGION,'--format=json']));
  const readConfig = version => JSON.parse(cloud(['secrets','versions','access',version,
    '--secret='+CONFIG_SECRET]));
  const summary = s => emit('SERVICE_STATE',JSON.stringify({
    latestCreated:atom(s.status?.latestCreatedRevisionName),
    latestReady:atom(s.status?.latestReadyRevisionName),
    template:atom(s.spec?.template?.metadata?.name), reconciled:reconciled(s),
    traffic:(s.status?.traffic || []).map(t => ({revision:atom(t.revisionName),
      percent:Number(t.percent)||0,tag:atom(t.tag)})), conditions:conditions(s)}));
  const stamp = s => ({metadata:s.metadata,spec:s.spec});
  function unchanged(snapshot) {
    const fresh=describe();
    ensure(typeof snapshot.metadata?.resourceVersion === 'string' &&
      same(stamp(snapshot),stamp(fresh)), 'CONCURRENT_SERVICE_CHANGE');
    return fresh;
  }
  function update(args) {
    return cloud(['run','services','update-traffic',SERVICE,'--region='+REGION,
      ...args,'--quiet','--format=json']);
  }
  function adoption(s) {
    ensure(s.status?.latestCreatedRevisionName === candidate &&
      s.spec?.template?.metadata?.name === candidate, 'CANDIDATE_CHANGED');
    ensure([PREVIOUS,candidate].includes(servingRevision(s)), 'UNEXPECTED_SERVING_REVISION');
    ensure(same(s.spec.template,initial.spec.template) &&
      same(runtimeAnnotations(s.metadata),runtimeAnnotations(initial.metadata)),
      'SERVICE_RUNTIME_CHANGED');
  }
  async function settle() {
    const deadline=now()+20000;
    for(let attempt=0;attempt<7;attempt++) {
      const s=describe(); adoption(s);
      if(reconciled(s) && ready(s)) return s;
      if(attempt===6 || now()>=deadline) { summary(s); break; }
      await wait(2000);
    }
    ensure(false,'SERVICE_RECONCILIATION_INCOMPLETE');
  }
  async function health(origin, failure) {
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await transport(origin+'/health',{
          redirect:'error',signal:AbortSignal.timeout(20000)});
        const body=await response.json();
        if(response.status===200 && body.ready===true && body.paidExecution===true) return;
      } catch {}
      if(attempt<2) await wait(2000);
    }
    ensure(false,failure);
  }
  async function cleanup() {
    if(!tagAttempted) return;
    try {
      const s=describe();
      const entries=[...(s.spec?.traffic || []),...(s.status?.traffic || [])].filter(t => t.tag===tag);
      if(entries.length===0) { emit('TAG_CLEANUP','VERIFIED_ABSENT'); return; }
      ensure(entries.every(t => t.revisionName===candidate && !t.latestRevision),
        'TAG_BINDING_CHANGED');
      const beforeServing=servingRevision(s);
      unchanged(s);
      update(['--remove-tags='+tag]);
      const after=describe();
      ensure(![...(after.spec?.traffic || []),...(after.status?.traffic || [])].some(t => t.tag===tag) &&
        servingRevision(after)===beforeServing && same(after.spec.template,s.spec.template),
        'TAG_CLEANUP_UNVERIFIED');
      emit('TAG_CLEANUP','VERIFIED');
    } catch { emit('TAG_CLEANUP','PENDING_OWNER_REVIEW'); }
  }

  try {
    step('IDENTIFY_EXISTING_STAGE');
    initial=describe(); summary(initial);
    const created=initial.status?.latestCreatedRevisionName;
    const templated=initial.spec?.template?.metadata?.name;
    candidate=/^factory-gateway-appfix-[a-z0-9-]+$/.test(String(created)) ? created : templated;
    ensure(typeof candidate==='string' && candidate.length<=63 &&
      /^factory-gateway-appfix-[a-z0-9-]+$/.test(candidate), 'EXPECTED_STAGE_NOT_FOUND');
    adoption(initial);
    initial=await settle(); summary(initial);
    const old=revision(PREVIOUS), next=revision(candidate);
    emit('PREVIOUS_REVISION',PREVIOUS); emit('CANDIDATE_REVISION',candidate);
    emit('CANDIDATE_CONDITIONS',JSON.stringify(conditions(next)));
    const oldBinding=binding(old.spec,CONFIG_FILE,CONFIG_SECRET);
    const nextBinding=binding(next.spec,CONFIG_FILE,CONFIG_SECRET);
    const templateBinding=binding(initial.spec.template.spec,CONFIG_FILE,CONFIG_SECRET);
    emit('PREVIOUS_CONFIG_VERSION',oldBinding.version);
    emit('CANDIDATE_CONFIG_VERSION',nextBinding.version);
    emit('TEMPLATE_CONFIG_VERSION',templateBinding.version);
    ensure(oldBinding.version===OLD_CONFIG && nextBinding.version===NEW_CONFIG &&
      templateBinding.version===NEW_CONFIG, 'CONFIG_VERSION_MISMATCH');
    ensure(same(readConfig(NEW_CONFIG),repairedConfig(readConfig(OLD_CONFIG))),
      'CONFIG_CONTENT_MISMATCH');
    ensure(same(normalizeSpec(old.spec),normalizeSpec(next.spec)) &&
      same(runtimeAnnotations(old.metadata),runtimeAnnotations(next.metadata)) &&
      sameTemplateAndRevision(initial.spec.template.spec,next.spec) &&
      typeof old.status?.imageDigest==='string' && old.status.imageDigest.length>0 &&
      old.status.imageDigest===next.status?.imageDigest, 'UNEXPECTED_RUNTIME_CHANGE');
    const env=Object.fromEntries((next.spec.containers[0].env || [])
      .filter(e => Object.hasOwn(e,'value')).map(e => [e.name,e.value]));
    ensure(env.FACTORY_PRIVATE_CONFIG===CONFIG_FILE && env.FACTORY_BOOTSTRAP!=='true' &&
      ['FACTORY_ACTIONS_APPROVED','FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED',
        'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED'].every(k => env[k]==='true'),
      'ADULT_RUNTIME_UNEXPECTED');
    emit('EXISTING_STAGE','CONFIG_AND_RUNTIME_VERIFIED');
    if(servingRevision(initial)===candidate) {
      await health(ORIGIN,'LIVE_GATEWAY_HEALTH_FAILED');
      emit('REPAIR_STATUS','ALREADY_APPLIED'); return;
    }
    if(!apply) { emit('REPAIR_STATUS','EXISTING_STAGE_PLAN_VERIFIED'); return; }

    step('CHECK_EXISTING_REVISION_AT_ZERO_TRAFFIC');
    tag='appfix-check-'+randomBytes(6).toString('hex');
    ensure(![...(initial.spec.traffic || []),...(initial.status.traffic || [])]
      .some(t => t.tag===tag), 'TAG_ALREADY_EXISTS');
    unchanged(initial); tagAttempted=true;
    update(['--update-tags='+tag+'='+candidate]);
    const tagged=await settle();
    ensure(servingRevision(tagged)===PREVIOUS, 'TRAFFIC_CHANGED_BEFORE_CHECK');
    const routes=(tagged.status.traffic || []).filter(t => t.tag===tag);
    ensure(routes.length===1 && routes[0].revisionName===candidate &&
      !Number(routes[0].percent), 'TAGGED_REVISION_UNVERIFIED');
    const expectedHost=tag+'---'+new URL(ORIGIN).hostname;
    const taggedUrl=new URL(routes[0].url);
    ensure(taggedUrl.protocol==='https:' && taggedUrl.hostname===expectedHost &&
      !taggedUrl.port && !taggedUrl.username && !taggedUrl.password &&
      taggedUrl.pathname==='/' && !taggedUrl.search && !taggedUrl.hash,
      'TAGGED_URL_UNEXPECTED');
    await health(taggedUrl.origin,'STAGED_GATEWAY_HEALTH_FAILED');
    const checked=unchanged(tagged); adoption(checked);
    ensure(servingRevision(checked)===PREVIOUS, 'TRAFFIC_CHANGED_BEFORE_PROMOTION');
    emit('STAGED_GATEWAY_HEALTH','READY_ADULT_ENABLED');

    step('PROMOTE_EXISTING_VERIFIED_REVISION');
    promotionAttempted=true;
    update(['--to-revisions='+candidate+'=100']);
    const live=await settle();
    ensure(servingRevision(live)===candidate, 'PROMOTION_UNVERIFIED');
    await health(ORIGIN,'LIVE_GATEWAY_HEALTH_FAILED'); mainHealthy=true;
    emit('GATEWAY_HEALTH','READY_ADULT_ENABLED');
    emit('SERVING_REVISION',candidate); emit('INSTALLATION_ID',INSTALLATION);
    await cleanup();
    emit('REPAIR_STATUS','SUCCESS');
  } catch(error) {
    emit('FAILED_STAGE',stage);
    const code=error?.code || error?.cause?.code || error?.name;
    emit('ERROR_CODE',/^[A-Za-z0-9_]{1,80}$/.test(String(code)) ? code : 'UNCLASSIFIED');
    if(lastService) summary(lastService);
    if(promotionAttempted && !mainHealthy) {
      try {
        const actual=describe(); adoption(actual); unchanged(actual);
        update(['--to-revisions='+PREVIOUS+'=100']);
        ensure(servingRevision(describe())===PREVIOUS,'ROLLBACK_UNVERIFIED');
        emit('ROLLBACK_STATUS','PREVIOUS_REVISION_RESTORED');
      } catch { emit('ROLLBACK_STATUS','OWNER_REVIEW_REQUIRED'); }
    } else emit('PRODUCTION_TRAFFIC','NOT_PROMOTED_BY_FINISH');
    await cleanup();
    throw Object.assign(new Error(),{code:'FINISH_STOPPED'});
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const cloud=(args,input) => execFileSync('gcloud',[...args,'--project='+PROJECT],{
    input,encoding:'utf8',timeout:180000,stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024}).trim();
  finish({apply:process.argv.includes('--apply'),cloud}).catch(() => { process.exitCode=1; });
}
