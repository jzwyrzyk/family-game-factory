import {build} from 'esbuild';
import {reviewPackage} from '../game-art-review/package.cjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.resolve(process.env.UI_REVIEW_OUT||'dist-review');
await fs.mkdir(out,{recursive:true});
const drawingOnly=process.argv.includes('--drawing');
const sha=process.env.UI_REVIEW_BASE_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourcePaths=['src','public','index.html','tests/parent-dashboard-fixture.ts','tools/ui-review','tools/design-system','tools/game-art-review','tools/creative-game-art','tests/game-art','server/sandbox'];
execFileSync('git',['diff','--exit-code',sha,'--',...sourcePaths],{stdio:'pipe'});
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--',...sourcePaths],{encoding:'utf8'}).trim();
if(untracked)throw Error('Review source contains untracked files: '+untracked);
const manifest=JSON.parse(await fs.readFile('tools/ui-review/coverage.json','utf8'));
manifest.excludedPRs=JSON.parse(await fs.readFile('tools/ui-review/excluded-prs.json','utf8'));
const files=drawingOnly?JSON.parse(await fs.readFile('tools/ui-review/drawing-assets.json','utf8')):await fs.readdir('public',{recursive:true});
if(drawingOnly){
 manifest.initialAction='art';
 manifest.learningSamples=[];
 manifest.pages=manifest.pages.filter(page=>page.action==='art');
 manifest.states=manifest.states.filter(state=>state.action==='art-draw');
 manifest.journeys=['My Art → Draw here → Keep my art → Keep drawing → Keep a new version'];
 manifest.scenarios=['normal'];
 manifest.gaps=['This compact review embeds the artwork and fonts for My Art. Use the full review for activities outside this drawing journey.',
   'Use synthetic drawings. The review stores this file’s library under a separate synthetic database prefix when browser storage is available. Reset demo data clears that review run.'];
 manifest.excludedPRs=[];
}
const types={'.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json'};
const assets={};
const exact=drawingOnly||process.env.UI_REVIEW_EXACT_ASSETS==='1';
if(!exact)execFileSync('python3',['tools/ui-review/prepare-assets.py'],{stdio:'inherit'});
for(const name of files){const ext=path.extname(name);if(!types[ext]||name==='factory-config.json')continue;assets[name.replaceAll('\\','/')]=[types[ext],(await fs.readFile(path.join(!exact&&name.startsWith('jems-pals/')&&name.endsWith('.webp')?'work/ui-review/assets':'public',name))).toString('base64')];}
const sampleNames=drawingOnly?[]:['rocket','rock','dragon','world'];
const samplePictures=Object.fromEntries(await Promise.all(sampleNames.map(async name=>[name,(await fs.readFile('tests/game-art/'+name+'.png')).toString('base64')])));
const options={bundle:true,write:false,format:'iife',target:'chrome110',minify:true,define:{__JEMS_FLIGHT_FIXTURES__:JSON.stringify(samplePictures),'import.meta.env.BASE_URL':'"./"','import.meta.env.MODE':'"early-preview"','import.meta.env.DEV':'false','import.meta.env.PROD':'true'},plugins:[{name:'review-only',setup(b){
 if(!drawingOnly){
   b.onResolve({filter:/review-mode$/},a=>path.resolve(a.resolveDir,a.path)===path.join(root,'src/game-art/review-mode')?{path:'mode',namespace:'sample-game'}:null);
   b.onResolve({filter:/^\.\/review-package$/},a=>a.importer===path.join(root,'src/game-art/review.ts')?{path:'archive',namespace:'sample-game'}:null);
   b.onLoad({filter:/.*/,namespace:'sample-game'},a=>({contents:a.path==='mode'?'export const gameArtReview=true;':'export default '+JSON.stringify(reviewPackage()),loader:'js'}));
 }
 // A srcdoc frame has an opaque URL. Recovery still validates a single origin
 // and the full family scope. The private synthetic run owns its own databases.
 b.onLoad({filter:/src[\/]storage[\/](complete-backup|native-workspace)\.ts$/},async a=>({
   contents:(await fs.readFile(a.path,'utf8')).replaceAll('location.origin',JSON.stringify('https://jems-offline-review.invalid')),loader:'ts',
 }));
 b.onResolve({filter:/\/offline$/},()=>({path:'offline',namespace:'review'}));
 b.onLoad({filter:/.*/,namespace:'review'},()=>({contents:'export function installOffline(){}',loader:'js'}));
 b.onResolve({filter:/^\//},a=>a.kind==='url-token'?{path:a.path,external:true}:null);
 b.onResolve({filter:/\.(woff2?|ttf|png|webp|svg)$/},a=>a.kind==='url-token'?{path:a.path,external:true}:null);
 b.onLoad({filter:/src\/brand\/icons.ts$/},async a=>({contents:(await fs.readFile(a.path,'utf8')).replace("const url = new URL('jems-art/icons/jems-icons.svg', document.baseURI);", "const url = new URL(document.baseURI);" ).replace('return url.href;', 'return url.hash;'),loader:'ts'}));
}}]};
const result=await build({...options,entryPoints:[drawingOnly?'tools/ui-review/drawing-entry.ts':'tools/ui-review/entry.ts'],outfile:'app.js'});
const js=result.outputFiles.find(x=>x.path.endsWith('.js')).text,css=result.outputFiles.find(x=>x.path.endsWith('.css')).text;
let html=await fs.readFile(drawingOnly?'tools/ui-review/drawing.html':'index.html','utf8');
html=html.replace(/<script[^>]*src=[^>]+><\/script>/g,'').replace(/<link[^>]+>/g,'');
manifest.assetPackaging=exact?'Exact original bytes':'Gem Pal images: same artwork, maximum 768px WebP quality 90; other assets exact';
if(exact)manifest.gaps=manifest.gaps.filter(gap=>!gap.startsWith('Gem Pal artwork is packaged as maximum-768px'));
const sourceKind=process.env.UI_REVIEW_SOURCE_KIND || (execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()==='main'?'merged main':'candidate branch');
const payload={sha,sourceKind,builtAt:new Date().toISOString(),manifest,assets,html,css,js,bootstrap:await fs.readFile('tools/ui-review/bootstrap.js','utf8')};
const esc=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const shell=await fs.readFile('tools/ui-review/shell.html','utf8');
const filename=drawingOnly?'jems-drawing-review.html':'jems-ui-review.html';
await fs.writeFile(path.join(out,filename),shell.replace('/*__PAYLOAD__*/',()=>`const PAYLOAD=${esc(payload)};`));
await fs.writeFile(path.join(out,drawingOnly?'drawing-coverage.json':'coverage.json'),JSON.stringify({...manifest,sha,sourceKind,assets:Object.keys(assets).length},null,2));
console.log(`Built ${path.join(out,filename)} (${Object.keys(assets).length} embedded assets), baseline ${sha}`);
