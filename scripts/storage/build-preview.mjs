import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
// The alternate authority is selected at build time, never by a saved marker or
// query parameter in an ordinary release. This local build makes no deployment.
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','storage-preview','--outDir','test-results/storage-preview'],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
// Preserve exact evidence without uploading another complete copy of the
// application and its unchanged artwork alongside every browser screenshot.
const root='test-results/storage-preview',sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[];
function collect(dir){for(const name of readdirSync(dir).sort()){const path=join(dir,name),stat=statSync(path);if(stat.isDirectory())collect(path);else if(stat.isFile())files.push({path:relative(root,path).replaceAll('\\','/'),bytes:stat.size,sha256:sha256(readFileSync(path))});}}
collect(root);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sourceSha=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}'),dirty=!!git('status','--porcelain','--untracked-files=no');
const buildInfo=JSON.parse(readFileSync(join(root,'build-info.json'),'utf8'));
if(buildInfo.sha!==sourceSha||buildInfo.dirty!==dirty)throw Error('STORAGE_PREVIEW_BUILD_SOURCE_MISMATCH');
if(process.env.GITHUB_ACTIONS==='true'&&(dirty||process.env.GITHUB_SHA!==sourceSha))throw Error('STORAGE_PREVIEW_CI_SOURCE_MISMATCH');
writeFileSync('test-results/storage-preview-build.json',JSON.stringify({schemaVersion:1,mode:'storage-preview',sourceSha,sourceTree,dirty,lockSha256:sha256(readFileSync('package-lock.json')),buildInfo,bytes:files.reduce((n,file)=>n+file.bytes,0),contentSha256:sha256(JSON.stringify(files)),files},null,2)+'\n');
