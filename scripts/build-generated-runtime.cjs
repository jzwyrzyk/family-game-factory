// Package repository-owned source only. Append a version; never overwrite an archived runtime.
const {buildSync}=require('esbuild');
const {createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version=process.argv[2];
if(!/^quality-runtime-v2\.\d+\.\d+$/.test(version||''))throw Error('Usage: node scripts/build-generated-runtime.cjs quality-runtime-v2.MINOR.PATCH');
const target=path.join(root,'server/sandbox/trusted',version);if(fs.existsSync(target))throw Error('ARCHIVE_ALREADY_EXISTS: use a new version, never overwrite');
const sourceFiles=['server/sandbox/runtime-v2.ts','server/sandbox/worker-bootstrap-v2.ts','server/sandbox/harden-v2.ts','server/sandbox/language-v2.cjs','server/sandbox/private-clock-v2.cjs','server/sandbox/frame-v2.ts','server/sandbox/client-v2.ts','src/quality/parts.ts','src/quality/art.ts'];
if(!fs.readFileSync(path.join(root,sourceFiles[0]),'utf8').includes("export const VERSION='"+version+"'"))throw Error('SOURCE_VERSION_MISMATCH');
const bundle=(name,globalName)=>buildSync({entryPoints:[path.join(root,'server/sandbox',name)],bundle:true,write:false,format:'iife',globalName,platform:'browser',target:'es2020',minify:true,legalComments:'inline',logLevel:'silent'}).outputFiles[0].text;
const worker=require('../server/sandbox/private-clock-v2.cjs').clockPrelude+'\n'+bundle('worker-bootstrap-v2.ts','FactoryRuntime'),client=bundle('client-v2.ts','FactoryClient'),hash=s=>createHash('sha256').update(s).digest('hex');
const manifest={version,hash:hash(version+'\n'+worker+'\n'+client),workerHash:hash(worker),clientHash:hash(client),sourceHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file),'utf8'))])),planck:JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('planck')),'../package.json'),'utf8')).version,esbuild:require('esbuild/package.json').version};
fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'worker.js'),worker);fs.writeFileSync(path.join(target,'client.js'),client);fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version,hash:manifest.hash,workerBytes:Buffer.byteLength(worker),clientBytes:Buffer.byteLength(client),next:'Append this reviewed hash to bundle-v2.cjs; preserve all previous registry entries.'}));
