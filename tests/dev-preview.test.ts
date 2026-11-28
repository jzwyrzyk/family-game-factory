import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {offlineBuild} from '../tools/offline-build';
import {addPreviewBanner,assertDisconnectedConfig,DISCONNECTED_CONFIG,PREVIEW_MANIFEST,PREVIEW_REPOSITORY,previewHeaders,previewPolicyMeta,previewPort,previewSource,verifyPreviewArtifact,writePreviewManifest,type PreviewSource} from '../scripts/development/preview-contract';
import {previewOutput} from '../scripts/development/preview';

const source: PreviewSource = {repository:PREVIEW_REPOSITORY,sha:'a'.repeat(40),treeSha:'b'.repeat(40),dirty:false,workingTreeSha256:'c'.repeat(64)};
async function temporary(run:(root:string)=>Promise<void>) {
  const root=await mkdtemp(path.join(tmpdir(),'jems-dev-preview-'));
  try {await run(root);} finally {await rm(root,{recursive:true,force:true});}
}
async function fixture(root:string,identity:PreviewSource=source) {
  await mkdir(root,{recursive:true});
  await writeFile(path.join(root,'index.html'),addPreviewBanner(`<!doctype html><html><head>${previewPolicyMeta()}</head><body><main>Preview</main></body></html>`,identity));
  await writeFile(path.join(root,'factory-config.json'),JSON.stringify(DISCONNECTED_CONFIG));
  await writeFile(path.join(root,'build-info.json'),JSON.stringify({...identity,environment:'preview'}));
  await writeFile(path.join(root,'sw.js'),'/* offline fixture */');
  await writeFile(path.join(root,'app.js'),'document.body.dataset.preview="test";');
  return writePreviewManifest(root,identity,{pr:123,runId:'456'});
}

test('preview rejects remote selectors, hidden extra configuration and environment changes',async()=>temporary(async root=>{
  for(const value of [null,{}, {version:1,mode:'remote',apiBaseUrl:'https://factory-gateway-ola734esta-ul.a.run.app',previewOrigin:'https://factory-preview-ola734esta-ul.a.run.app'}, {...DISCONNECTED_CONFIG,apiBaseUrl:'https://production.example'}, {...DISCONNECTED_CONFIG,proxy:'/api'}]) assert.throws(()=>assertDisconnectedConfig(value),/PREVIEW_REMOTE/);
  assert.doesNotThrow(()=>assertDisconnectedConfig(DISCONNECTED_CONFIG));
  await fixture(root);
  await writeFile(path.join(root,'factory-config.json'),JSON.stringify({...DISCONNECTED_CONFIG,apiBaseUrl:'https://production.example'}));
  await assert.rejects(verifyPreviewArtifact(root),/PREVIEW_REMOTE/);
}));

test('artifact binds bytes and external expected source, PR and CI run',async()=>temporary(async root=>{
  const original=await fixture(root);
  const verified=await verifyPreviewArtifact(root,{sha:source.sha,pr:123,runId:'456'});
  assert.equal(verified.artifact.sha256,original.artifact.sha256);
  for(const expected of [{sha:'d'.repeat(40)},{pr:124},{runId:'457'}]) await assert.rejects(verifyPreviewArtifact(root,expected),/PROVENANCE_MISMATCH/);
  await writeFile(path.join(root,'app.js'),'different bytes');
  await assert.rejects(verifyPreviewArtifact(root),/DIGEST_MISMATCH/);
}));

test('dirty artifacts need explicit local acceptance and cannot masquerade as clean build metadata',async()=>temporary(async root=>{
  await fixture(root,{...source,dirty:true});
  await assert.rejects(verifyPreviewArtifact(root),/DIRTY_SOURCE_REJECTED/);
  await verifyPreviewArtifact(root,{allowDirty:true});
  await writeFile(path.join(root,'build-info.json'),JSON.stringify({...source,environment:'preview'}));
  await writePreviewManifest(root,{...source,dirty:true});
  await assert.rejects(verifyPreviewArtifact(root,{allowDirty:true}),/BUILD_IDENTITY_MISMATCH/);
}));

test('unsafe symlinks and publisher configuration never enter the static artifact',async()=>temporary(async root=>{
  const artifact=path.join(root,'artifact');await fixture(artifact);
  await writeFile(path.join(root,'private.json'),'{"secret":"private fixture"}');
  await symlink(path.join(root,'private.json'),path.join(artifact,'leak.json'));
  await assert.rejects(verifyPreviewArtifact(artifact),/SYMLINK_REJECTED/);
  await rm(path.join(artifact,'leak.json'));
  await writeFile(path.join(artifact,'firebase.json'),'{"hosting":{"predeploy":"malicious"}}');
  await assert.rejects(writePreviewManifest(artifact,source),/FILE_REJECTED/);
}));

test('artifact rejects credential material, hidden files and special path names',async()=>temporary(async root=>{
  await fixture(root);
  for(const [name,content,pattern] of [['settings.json','{"type":"service_account","private_key":"fixture"}',/CREDENTIAL/],['.env','SECRET=fixture',/PATH_INVALID/],['folder\\leak.json','{}',/PATH_INVALID/]] as const) {
    await writeFile(path.join(root,name),content);
    await assert.rejects(writePreviewManifest(root,source),pattern);
    await rm(path.join(root,name));
  }
}));

test('artifact requires its disconnected browser policy and refuses a symlink manifest before reading it',async()=>temporary(async root=>{
  const artifact=path.join(root,'artifact');await fixture(artifact);
  const index=path.join(artifact,'index.html');
  await writeFile(index,(await readFile(index,'utf8')).replace(previewPolicyMeta(),''));
  await assert.rejects(writePreviewManifest(artifact,source),/RESPONSE_POLICY_MISSING/);
  await rm(path.join(artifact,PREVIEW_MANIFEST));
  await writeFile(path.join(root,'outside.json'),'not a manifest');
  await symlink(path.join(root,'outside.json'),path.join(artifact,PREVIEW_MANIFEST));
  await assert.rejects(verifyPreviewArtifact(artifact),/SYMLINK_REJECTED/);
}));

test('source identity records untracked, changed and deleted bytes while ignoring build output',async()=>temporary(async root=>{
  const git=(args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
  git(['init','-q']);git(['config','user.name','Preview Fixture']);git(['config','user.email','preview@example.invalid']);
  await writeFile(path.join(root,'.gitignore'),'ignored/\n');await writeFile(path.join(root,'main.ts'),'initial');
  git(['add','.']);git(['commit','-qm','fixture']);
  const clean=await previewSource(root);assert.equal(clean.dirty,false);
  await mkdir(path.join(root,'ignored'));await writeFile(path.join(root,'ignored','artifact.js'),'ignored build');
  assert.deepEqual(await previewSource(root),clean);
  await writeFile(path.join(root,'new.ts'),'one');const one=await previewSource(root);assert.equal(one.dirty,true);assert.notEqual(one.workingTreeSha256,clean.workingTreeSha256);
  await writeFile(path.join(root,'new.ts'),'two');const two=await previewSource(root);assert.notEqual(two.workingTreeSha256,one.workingTreeSha256);
  git(['add','new.ts']);assert.equal((await previewSource(root)).workingTreeSha256,two.workingTreeSha256);
  await rm(path.join(root,'main.ts'));assert.notEqual((await previewSource(root)).workingTreeSha256,two.workingTreeSha256);
}));

test('dedicated build output prevents deleting production dist and refuses symlink escape',async()=>temporary(async root=>{
  await assert.rejects(previewOutput(root,'dist'),/OUTSIDE_DEDICATED/);
  await assert.rejects(previewOutput(root,'..'),/OUTSIDE_DEDICATED/);
  assert.equal(await previewOutput(root),path.join(root,'.factory-deployment','previews','local'));
  await mkdir(path.join(root,'outside'));
  await symlink(path.join(root,'outside'),path.join(root,'.factory-deployment'));
  await assert.rejects(previewOutput(root),/SYMLINK_REJECTED/);
}));

test('preview is visibly separate and its response policy permits only local network access',()=>{
  assert.equal(previewPort('/fixture/one'),previewPort('/fixture/one'));
  assert.ok(previewPort('/fixture/one')>=43000&&previewPort('/fixture/one')<44000);
  const html=addPreviewBanner('<html><body><main>Test</main></body></html>',{...source,dirty:true});
  assert.match(html,/DEV PREVIEW/);assert.match(html,/local edits/);assert.match(html,/AI disconnected/);
  assert.throws(()=>addPreviewBanner(html,source),/HTML_INVALID/);
  assert.throws(()=>addPreviewBanner('<base href="https://prod.example"><body></body>',source),/HTML_INVALID/);
  const headers=previewHeaders('ws://127.0.0.1:43123');
  assert.match(headers['Content-Security-Policy'],/connect-src 'self' ws:\/\/127\.0\.0\.1:43123;/);
  assert.equal(headers['X-Robots-Tag'],'noindex, nofollow, noarchive');
  assert.throws(()=>previewHeaders('wss://prod.example'),/ORIGIN_INVALID/);
});

test('offline build output override retains real shell rules and exact supplied working-tree identity',async()=>temporary(async root=>{
  await writeFile(path.join(root,'index.html'),'<body>test</body>');
  await writeFile(path.join(root,'factory-config.json'),JSON.stringify(DISCONNECTED_CONFIG));
  await mkdir(path.join(root,'jems-pals'));await writeFile(path.join(root,'jems-pals','manifest.json'),'{}');await writeFile(path.join(root,'jems-pals','portrait.webp'),'fixture');
  const plugin=offlineBuild({outDir:root,buildInfo:{...source,dirty:true,environment:'preview'}});
  const hook=plugin.closeBundle as (()=>void);hook.call({});
  const info=JSON.parse(await readFile(path.join(root,'build-info.json'),'utf8'));
  assert.equal(info.dirty,true);assert.equal(info.workingTreeSha256,source.workingTreeSha256);
  const sw=await readFile(path.join(root,'sw.js'),'utf8');
  assert.equal(sw.includes('factory-config.json'),false);
  assert.match(sw,/jems-pals\/portrait.webp/);
  const precache=JSON.parse(sw.match(/precachePaths=(\[[^;]*?\]),version=/)![1]);
  assert.ok(precache.includes('jems-pals/manifest.json'));assert.equal(precache.includes('jems-pals/portrait.webp'),false);
}));
