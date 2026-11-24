import {build as viteBuild} from 'vite';
import {build as bundle} from 'esbuild';
import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

// Build into a separate directory. Pages continues to use its own dist and offline plugin.
const out=resolve('dist-family-beta');
await viteBuild({configFile:false,base:'./',build:{outDir:out,emptyOutDir:true,sourcemap:false}});
await mkdir(out+'/features',{recursive:true});
await bundle({entryPoints:['shell','games','learning','coding','problemSolving','artwork'].map(n=>'src/family-beta/'+n+'.ts'),outdir:out+'/features',bundle:true,format:'esm',target:'es2022',external:['/fonts/*'],minify:true,legalComments:'eof'});
for(const dir of ['features','assets']){
 for(const filename of (await readdir(out+'/'+dir)).filter(n=>n.endsWith('.css'))){
  const path=out+'/'+dir+'/'+filename;await writeFile(path,(await readFile(path,'utf8')).replace(/url\((["']?)\/(fonts|art)\//g,'url($1/play/$2/'));
 }
}
await cp('server/beta/web',out+'/entry',{recursive:true});
const html=await readFile(out+'/index.html','utf8');
if(!html.includes('type="module"')||html.includes('src="/src/'))throw Error('PRIVATE_BUILD_INVALID');
await writeFile(out+'/beta-build.json',JSON.stringify({version:1,private:true}));
