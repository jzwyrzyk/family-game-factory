/** Build inside a source archive already bound to an exact reviewed Git commit.
 * This function makes files; it does not attest that its caller chose that source.
 * dev_images.py supplies and independently verifies that provenance boundary.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build as bundle} from 'esbuild';
import {build} from 'vite';
import {offlineBuild} from '../../tools/offline-build';

export async function buildDevSiteFiles(root:string,out:string,sha:string){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('DEV_SITE_EXACT_SOURCE_REQUIRED');
 const assets=path.join(out,'site');await mkdir(assets,{recursive:true});
 await build({root,configFile:false,envDir:false,envPrefix:[],base:'./',plugins:[offlineBuild({outDir:assets,
  buildInfo:{sha,dirty:false,environment:'development'}})],build:{outDir:assets,emptyOutDir:true}});
 await writeFile(path.join(assets,'factory-config.json'),JSON.stringify({version:1,mode:'unavailable'})+'\n');
 await bundle({absWorkingDir:root,entryPoints:['server/dev-site.ts'],outfile:path.join(out,'dev-site.mjs'),
  bundle:true,platform:'node',target:'node22',format:'esm',logLevel:'warning'});
}
if(process.argv[1]&&/[/\\]scripts[/\\]development[/\\]build-site-image\.ts$/.test(path.resolve(process.argv[1]))){
 void buildDevSiteFiles(process.cwd(),'/built',process.env.JEMS_DEV_BUILD_SOURCE_SHA||'').catch(()=>{
  console.error('DEV image asset build failed; no private configuration printed.');process.exitCode=1;
 });
}
