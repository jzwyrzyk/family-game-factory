import {build as viteBuild} from 'vite';
import {build as bundle} from 'esbuild';
import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

// Build into a separate directory. Pages continues to use its own dist and offline plugin.
const args=process.argv.slice(2);
if(args.length>1||args.length===1&&args[0]!=='--early-preview')throw Error('Use only the named synthetic early-preview build.');
const earlyPreview=args[0]==='--early-preview',mode=earlyPreview?'early-preview':'production';
const out=resolve(earlyPreview?'test-results/early-family-build':'dist-family-beta');
// Restricted family images have no local private-art review player or fixture archive.
const unavailable = 'throw new Error("Local artwork review is unavailable in this build.")';
const reviewOnly = new Map([
  ['../game-art/review', ['sampleProgram','playArtTest']],
  ['../../tools/creative-art-review/gem-hunt', ['openGemHunt']],
]);
const familyBuild = {
  name:'family-build-excludes-local-art-review', enforce:'pre',
  resolveId(id) { if (reviewOnly.has(id)) return '\0family-disabled:'+id; },
  load(id) {
    if (!id.startsWith('\0family-disabled:')) return;
    return reviewOnly.get(id.slice('\0family-disabled:'.length)).map(name =>
      'export function '+name+'(){'+unavailable+'}').join('\n');
  },
};
await viteBuild({configFile:false,mode,base:'./',plugins:[familyBuild],build:{outDir:out,emptyOutDir:true,sourcemap:false}});
await mkdir(out+'/features',{recursive:true});
await bundle({entryPoints:['shell','games','learning','coding','problemSolving','artwork','remote'].map(n=>'src/family-beta/'+n+'.ts'),outdir:out+'/features',bundle:true,format:'esm',target:'es2022',define:{'import.meta.env.MODE':JSON.stringify(mode)},external:['/fonts/*'],minify:true,legalComments:'eof'});
for(const dir of ['features','assets']){
 for(const filename of (await readdir(out+'/'+dir)).filter(n=>n.endsWith('.css'))){
  const path=out+'/'+dir+'/'+filename;await writeFile(path,(await readFile(path,'utf8')).replace(/url\((["']?)\/(fonts|art)\//g,'url($1/play/$2/'));
 }
}
await cp('server/beta/web',out+'/entry',{recursive:true});
const html=await readFile(out+'/index.html','utf8');
if(!html.includes('type="module"')||html.includes('src="/src/'))throw Error('PRIVATE_BUILD_INVALID');
await writeFile(out+'/beta-build.json',JSON.stringify({version:1,private:true}));
