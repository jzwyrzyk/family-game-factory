/** Produce one narrow, immutable DEV site image context. Never deploys. */
import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {previewSource,PREVIEW_LIMITS} from './preview-contract';
import {buildDevSiteFiles} from './build-site-image';

export async function sitePackageOutput(root:string,requested:string):Promise<string>{
 const base=path.resolve(root),out=path.resolve(base,requested),allowed=path.join(base,'.factory-deployment','dev-site');
 if(!out.startsWith(allowed+path.sep))throw Error('DEV_SITE_OUTPUT_OUTSIDE_DEDICATED_DIRECTORY');
 const pieces=path.relative(base,out).split(path.sep);
 for(let i=1;i<=pieces.length;i++){
  try{const entry=await lstat(path.join(base,...pieces.slice(0,i)));
   if(entry.isSymbolicLink()||!entry.isDirectory())throw Error('DEV_SITE_OUTPUT_SYMLINK_REJECTED');
   if(i===pieces.length)throw Error('DEV_SITE_OUTPUT_ALREADY_EXISTS');
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 return out;
}
async function inventory(directory:string){
 const entries:{path:string;bytes:number;sha256:string}[]=[];let totalBytes=0;
 async function visit(relative:string){
  for(const name of (await readdir(path.join(directory,relative))).sort()){
   const child=relative?relative+'/'+name:name,filename=path.join(directory,child),entry=await lstat(filename);
   if(entry.isSymbolicLink()||name.startsWith('.')||/[\\\u0000-\u001f]/.test(name))throw Error('DEV_SITE_UNSAFE_PACKAGE_ENTRY');
   if(entry.isDirectory()){await visit(child);continue;}
   if(!entry.isFile()||entry.size>PREVIEW_LIMITS.fileBytes)throw Error('DEV_SITE_PACKAGE_LIMIT');
   totalBytes+=entry.size;if(totalBytes>PREVIEW_LIMITS.totalBytes||entries.length>=PREVIEW_LIMITS.files)throw Error('DEV_SITE_PACKAGE_LIMIT');
   const bytes=await readFile(filename);
   if(/\.(?:json|html|js|mjs|css|txt)$/.test(child)&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|\bghp_[A-Za-z0-9]{20,}/.test(bytes.toString()))
    throw Error('DEV_SITE_SECRET_MATERIAL_REJECTED');
   entries.push({path:child,bytes:entry.size,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
 }
 await visit('');return {files:entries,totalBytes,sha256:createHash('sha256').update(JSON.stringify(entries)).digest('hex')};
}
export async function packageDevSite(input:{root?:string;expectedSha:string;out?:string}){
 const root=path.resolve(input.root||process.cwd());
 if(!/^[a-f0-9]{40}$/.test(input.expectedSha))throw Error('DEV_SITE_EXACT_SOURCE_REQUIRED');
 const before=await previewSource(root);
 if(before.dirty||before.sha!==input.expectedSha)throw Error('DEV_SITE_CLEAN_EXACT_SOURCE_REQUIRED');
 const out=await sitePackageOutput(root,input.out||`.factory-deployment/dev-site/${before.sha.slice(0,12)}`);
 await mkdir(out,{recursive:true});
 // The image contains no destination or credential. The authenticated server
 // supplies its separately reviewed environment configuration at request time.
 await buildDevSiteFiles(root,out,before.sha);
 await copyFile(path.join(root,'server/Dockerfile.dev-site'),path.join(out,'Dockerfile'));
 const content=await inventory(out),after=await previewSource(root);
 if(after.dirty||after.sha!==before.sha||after.workingTreeSha256!==before.workingTreeSha256)throw Error('DEV_SITE_SOURCE_CHANGED_DURING_BUILD');
 const receipt={version:1,kind:'jems-authenticated-dev-site',source:before,artifact:content,
  configured:false,deployed:false,providerActivated:false};
 await writeFile(path.join(out,'jems-dev-package.json'),JSON.stringify(receipt,null,2)+'\n');
 return {directory:out,sourceSha:before.sha,contextSha256:content.sha256,files:content.files.length,bytes:content.totalBytes};
}
if(process.argv[1]&&/[/\\]scripts[/\\]development[/\\]package-site\.ts$/.test(path.resolve(process.argv[1]))){
 const args=process.argv.slice(2);const flags:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--expected-sha','--out'].includes(args[i])||!args[i+1]||flags[args[i]])throw Error('Expected --expected-sha FULL_SHA [--out .factory-deployment/dev-site/NAME]');flags[args[i]]=args[i+1];}
 void packageDevSite({expectedSha:flags['--expected-sha'],out:flags['--out']}).then(result=>console.log(JSON.stringify({status:'DEV_SITE_PACKAGED',...result})))
  .catch(()=>{console.error('DEV site packaging failed; use an exact clean source and a new dedicated output directory. No cloud operation ran.');process.exitCode=1;});
}
