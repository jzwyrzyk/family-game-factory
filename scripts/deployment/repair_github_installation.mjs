#!/usr/bin/env node
// Targeted owner-run repair. Config and credentials stay in memory.
import {execFileSync} from 'node:child_process';
import {createPrivateKey, randomBytes, sign} from 'node:crypto';
import {posix} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PROJECT = 'family-game-factory-jzw';
export const REGION = 'us-east5';
export const SERVICE = 'factory-gateway';
export const ORIGIN = 'https://factory-gateway-ola734esta-ul.a.run.app';
export const CONFIG_SECRET = 'factory-gateway-private-config';
export const CONFIG_FILE = '/var/run/factory-config/config.json';
export const REPO = 'family-game-factory-lab/family-game-factory-worker';
export const PIN = '52729ad231179d633b2f15fa910aa2b23273a2d6';
export const INSTALLATION = '182382304';
export const ensure = (ok, code) => {
  if (!ok) throw Object.assign(new Error(), {code});
};
const canonical = value => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
const same = (a,b) => canonical(a) === canonical(b);

export function binding(spec, file, expected) {
  ensure(spec?.containers?.length === 1, 'CONTAINER_UNCLEAR');
  ensure(typeof file === 'string' && posix.isAbsolute(file), 'SECRET_PATH_INVALID');
  const mounts = (spec.containers[0].volumeMounts || [])
    .filter(m => m.mountPath === posix.dirname(file));
  ensure(mounts.length === 1, 'SECRET_MOUNT_UNCLEAR');
  const volumes = (spec.volumes || []).filter(v => v.name === mounts[0].name);
  ensure(volumes.length === 1, 'SECRET_VOLUME_UNCLEAR');
  const secret = volumes[0].secret;
  const items = secret?.items || [];
  ensure(secret?.secretName === expected && items.length === 1 &&
    items[0].path === posix.basename(file) && /^[0-9]+$/.test(String(items[0].key)),
    'PINNED_SECRET_UNCLEAR');
  return {secret:expected, version:String(items[0].key), volume:volumes[0].name};
}

export function normalizeSpec(spec) {
  const result = structuredClone(spec);
  const active = binding(result, CONFIG_FILE, CONFIG_SECRET);
  const container = result.containers[0];
  const mounted = new Set((container.volumeMounts || []).map(m => m.name));
  // gcloud may retain unmounted historical config volumes. They are not consumed.
  result.volumes = (result.volumes || []).filter(v =>
    mounted.has(v.name) || v.secret?.secretName !== CONFIG_SECRET);
  const volume = result.volumes.find(v => v.name === active.volume);
  volume.name = 'JEMS_CONFIG_MOUNT';
  volume.secret.items[0].key = 'JEMS_CONFIG_VERSION';
  const mount = container.volumeMounts.find(m => m.name === active.volume);
  mount.name = 'JEMS_CONFIG_MOUNT';
  result.volumes.sort((a,b) => a.name.localeCompare(b.name));
  container.volumeMounts.sort((a,b) => a.mountPath.localeCompare(b.mountPath));
  return result;
}

export function runtimeAnnotations(metadata) {
  const ignored = new Set(['run.googleapis.com/client-name',
    'run.googleapis.com/client-version', 'run.googleapis.com/operation-id']);
  return Object.fromEntries(Object.entries(metadata?.annotations || {}).filter(([k]) =>
    (k.startsWith('run.googleapis.com/') || k.startsWith('autoscaling.knative.dev/')) &&
    !ignored.has(k)));
}

export function repairedConfig(old) {
  ensure(old?.projectId === PROJECT && old.gatewayOrigin === ORIGIN &&
    old.workerRepository === REPO && old.workerRepositoryId === '1458899834' &&
    old.workerWorkflow === 'factory-private.yml' && old.workerApprovedSha === PIN &&
    old.active === true && old.approval?.enabled === true && !old.localFile,
    'ACTIVE_CONFIG_UNEXPECTED');
  return {...old, githubInstallationId:INSTALLATION};
}

export function servingRevision(service) {
  const serving = (service.status?.traffic || []).filter(t => Number(t.percent) > 0);
  ensure(service.status?.url === ORIGIN && serving.length === 1 &&
    serving[0].percent === 100 && typeof serving[0].revisionName === 'string',
    'SERVING_REVISION_UNCLEAR');
  return serving[0].revisionName;
}

export async function repair({apply = false, cloud, transport = fetch, report = console.log}) {
  let stage = 'START', previous, promoted = false, target;
  const emit = (key,value) => report(key + '=' + value);
  const step = value => { stage = value; emit('STEP',value); };
  const describe = () => JSON.parse(cloud(['run','services','describe',SERVICE,
    '--region='+REGION,'--format=json']));
  const revision = name => JSON.parse(cloud(['run','revisions','describe',name,
    '--region='+REGION,'--format=json']));
  const readSecret = b => cloud(['secrets','versions','access',b.version,'--secret='+b.secret]);
  const ready = r => r.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True');
  async function health() {
    const response = await transport(ORIGIN+'/health', {
      redirect:'error', signal:AbortSignal.timeout(20000)});
    const body = await response.json();
    ensure(response.status === 200 && body.ready === true && body.paidExecution === true,
      'GATEWAY_HEALTH_FAILED');
  }
  async function github(path, auth, body) {
    const response = await transport('https://api.github.com'+path, {
      method:body ? 'POST' : 'GET', redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+auth, Accept:'application/vnd.github+json',
        'User-Agent':'jems-installation-repair', 'X-GitHub-Api-Version':'2022-11-28',
        ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})});
    ensure(response.status === (body ? 201 : 200), 'GITHUB_HTTP_'+response.status);
    return response.json();
  }
  try {
    step('READ_SERVING_CONFIG');
    const original = describe();
    previous = servingRevision(original);
    ensure(original.status.latestCreatedRevisionName === previous &&
      original.status.latestReadyRevisionName === previous, 'PENDING_REVISION_EXISTS');
    const oldRevision = revision(previous);
    ensure(ready(oldRevision), 'SERVING_REVISION_NOT_READY');
    const oldBinding = binding(oldRevision.spec, CONFIG_FILE, CONFIG_SECRET);
    const templateBinding = binding(original.spec.template.spec, CONFIG_FILE, CONFIG_SECRET);
    ensure(templateBinding.version === oldBinding.version, 'SERVICE_TEMPLATE_CONFIG_DRIFT');
    ensure(typeof oldRevision.status.imageDigest === 'string' &&
      oldRevision.status.imageDigest.length > 0, 'SERVING_IMAGE_DIGEST_UNVERIFIED');
    const current = JSON.parse(readSecret(oldBinding));
    const next = repairedConfig(current);
    const env = Object.fromEntries((oldRevision.spec.containers[0].env || [])
      .filter(e => Object.hasOwn(e,'value')).map(e => [e.name,e.value]));
    ensure(env.FACTORY_PRIVATE_CONFIG === CONFIG_FILE && env.FACTORY_BOOTSTRAP !== 'true' &&
      ['FACTORY_ACTIONS_APPROVED','FACTORY_ADULT_PILOT_MODE',
        'FACTORY_ADULT_PILOT_OWNER_APPROVED','FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED']
        .every(k => env[k] === 'true'), 'ADULT_RUNTIME_UNEXPECTED');
    ensure(same(normalizeSpec(original.spec.template.spec), normalizeSpec(oldRevision.spec)),
      'SERVICE_TEMPLATE_DRIFT');
    emit('PREVIOUS_REVISION',previous);
    emit('PREVIOUS_CONFIG_VERSION',oldBinding.version);

    step('VERIFY_CORRECT_INSTALLATION');
    ensure(!(current.githubPrivateKey && current.githubPrivateKeyFile), 'KEY_SOURCE_AMBIGUOUS');
    const pem = current.githubPrivateKey || readSecret(binding(oldRevision.spec,
      current.githubPrivateKeyFile, 'factory-github-app-private-key'));
    const key = createPrivateKey(pem);
    ensure(key.asymmetricKeyType === 'rsa' && /^[0-9]+$/.test(String(current.githubAppId)),
      'APP_KEY_CONFIGURATION_INVALID');
    const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const now = Math.floor(Date.now()/1000);
    const content = encode({alg:'RS256',typ:'JWT'})+'.'+
      encode({iat:now-30,exp:now+480,iss:String(current.githubAppId)});
    const jwt = content+'.'+sign('RSA-SHA256',Buffer.from(content),key).toString('base64url');
    const installation = await github('/repos/'+REPO+'/installation',jwt);
    ensure(String(installation.id) === INSTALLATION &&
      installation.account?.login === 'family-game-factory-lab' && !installation.suspended_at &&
      installation.permissions?.actions === 'write' &&
      ['read','write'].includes(installation.permissions?.contents), 'INSTALLATION_UNEXPECTED');
    const issued = await github('/app/installations/'+INSTALLATION+'/access_tokens',jwt,
      {repository_ids:[1458899834], permissions:{actions:'write',contents:'read'}});
    ensure(typeof issued.token === 'string' && issued.token.length > 0, 'TOKEN_MISSING');
    const [workflow, main, tag] = await Promise.all([
      github('/repos/'+REPO+'/actions/workflows/factory-private.yml',issued.token),
      github('/repos/'+REPO+'/git/ref/heads/main',issued.token),
      github('/repos/'+REPO+'/git/ref/tags/factory-execution-'+PIN,issued.token)]);
    ensure(workflow.state === 'active', 'WORKFLOW_NOT_ACTIVE');
    ensure([main,tag].every(r => r.object?.type === 'commit' && r.object.sha === PIN),
      'WORKER_PIN_DRIFT');
    emit('CORRECTED_APP_CONNECTION','VERIFIED');
    if (current.githubInstallationId === INSTALLATION) {
      await health(); emit('REPAIR_STATUS','ALREADY_APPLIED'); return;
    }
    emit('ONLY_CONFIG_FIELD_CHANGED','githubInstallationId');
    if (!apply) { emit('REPAIR_STATUS','PLAN_VERIFIED'); return; }

    step('CREATE_CORRECTED_CONFIG_VERSION');
    const fresh = describe();
    ensure(servingRevision(fresh) === previous &&
      fresh.metadata.resourceVersion === original.metadata.resourceVersion &&
      same(fresh.spec,original.spec), 'SERVICE_CHANGED_DURING_PREFLIGHT');
    const created = JSON.parse(cloud(['secrets','versions','add',CONFIG_SECRET,
      '--data-file=-','--format=json'], JSON.stringify(next)));
    const newVersion = String(created.name || '').split('/').at(-1);
    ensure(/^[0-9]+$/.test(newVersion), 'NEW_SECRET_VERSION_UNVERIFIED');
    ensure(same(JSON.parse(readSecret({secret:CONFIG_SECRET,version:newVersion})),next),
      'NEW_SECRET_CONTENT_MISMATCH');
    emit('NEW_CONFIG_VERSION',newVersion);

    step('STAGE_GATEWAY_CONFIG');
    const beforeStage = describe();
    ensure(servingRevision(beforeStage) === previous &&
      beforeStage.metadata.resourceVersion === original.metadata.resourceVersion &&
      same(beforeStage.spec,original.spec), 'SERVICE_CHANGED_BEFORE_STAGING');
    const suffix = 'appfix-'+Date.now().toString(36)+'-'+randomBytes(2).toString('hex');
    target = SERVICE+'-'+suffix;
    cloud(['run','services','update',SERVICE,'--region='+REGION,
      '--update-secrets='+CONFIG_FILE+'='+CONFIG_SECRET+':'+newVersion,
      '--revision-suffix='+suffix,'--no-traffic','--quiet','--format=json']);
    const staged = describe();
    ensure(servingRevision(staged) === previous &&
      staged.status.latestCreatedRevisionName === target &&
      staged.status.latestReadyRevisionName === target, 'STAGING_NOT_READY');
    const newRevision = revision(target);
    const newBinding = binding(newRevision.spec, CONFIG_FILE, CONFIG_SECRET);
    ensure(ready(newRevision) && newBinding.version === newVersion, 'STAGED_CONFIG_MISMATCH');
    ensure(same(normalizeSpec(oldRevision.spec), normalizeSpec(newRevision.spec)) &&
      same(runtimeAnnotations(oldRevision.metadata), runtimeAnnotations(newRevision.metadata)) &&
      same(runtimeAnnotations(original.metadata), runtimeAnnotations(staged.metadata)) &&
      oldRevision.status.imageDigest === newRevision.status.imageDigest,
      'UNEXPECTED_RUNTIME_CHANGE');
    emit('RUNTIME_PRESERVED','VERIFIED');

    step('PROMOTE_VERIFIED_REVISION');
    const beforePromote = describe();
    ensure(servingRevision(beforePromote) === previous &&
      beforePromote.metadata.resourceVersion === staged.metadata.resourceVersion &&
      same(beforePromote.spec, staged.spec), 'SERVICE_CHANGED_BEFORE_PROMOTION');
    promoted = true;
    cloud(['run','services','update-traffic',SERVICE,'--region='+REGION,
      '--to-revisions='+target+'=100','--quiet','--format=json']);
    const live = describe();
    ensure(servingRevision(live) === target &&
      live.status.latestCreatedRevisionName === target, 'PROMOTION_UNVERIFIED');
    await health();
    emit('GATEWAY_HEALTH','READY_ADULT_ENABLED');
    emit('SERVING_REVISION',target);
    emit('INSTALLATION_ID',INSTALLATION);
    emit('REPAIR_STATUS','SUCCESS');
  } catch (error) {
    emit('FAILED_STAGE',stage);
    const code = error?.code || error?.cause?.code || error?.name;
    emit('ERROR_CODE',/^[A-Za-z0-9_]{1,80}$/.test(String(code)) ? code : 'UNCLASSIFIED');
    if (promoted && previous) {
      try {
        const actual = describe();
        const live = servingRevision(actual);
        ensure(live === target || live === previous, 'CONCURRENT_TRAFFIC_CHANGE');
        cloud(['run','services','update-traffic',SERVICE,'--region='+REGION,
          '--to-revisions='+previous+'=100','--quiet','--format=json']);
        ensure(servingRevision(describe()) === previous, 'ROLLBACK_UNVERIFIED');
        emit('ROLLBACK_STATUS','PREVIOUS_REVISION_RESTORED');
      } catch { emit('ROLLBACK_STATUS','OWNER_REVIEW_REQUIRED'); }
    } else emit('TRAFFIC_STATUS','NOT_CHANGED_BY_REPAIR');
    throw Object.assign(new Error(), {code:'REPAIR_STOPPED'});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cloud = (args, input) => execFileSync('gcloud', [...args,'--project='+PROJECT], {
    input, encoding:'utf8', timeout:180000, stdio:['pipe','pipe','pipe'], maxBuffer:8*1024*1024
  }).trim();
  repair({apply:process.argv.includes('--apply'),cloud}).catch(() => { process.exitCode = 1; });
}
