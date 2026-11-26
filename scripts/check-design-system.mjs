import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function inspectDesignSource(file, source, tokens) {
  const issues=[];
  const add=(rule, match)=>issues.push({file,rule,match});
  const text=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  if(file.endsWith('.css')) {
    for(const match of text.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|(?:color|background(?:-color)?)\s*:\s*(?:white|black|purple|blue)\b/gi))add('semantic-color',match[0]);
    for(const match of text.matchAll(/var\(\s*(--[\w-]+)/g))if(!tokens.has(match[1]))add('unknown-token',match[1]);
    for(const match of text.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g))if(+match[1]<18)add('child-type-size',match[0]);
    for(const match of text.matchAll(/font(?:-family)?\s*:[^;{}]*(?:Arial|Roboto|Poppins)/g))add('type-family',match[0]);
  }
  if(file.startsWith('src/design-system/')&&file.endsWith('.ts')) {
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))
      if(/\/(?:storage|builder|factory|learning|language|rewards|parent|studio)\//.test(match[1]))add('domain-authority-import',match[1]);
    if(/\b(?:localStorage|indexedDB|fetch)\s*[.(]/.test(text))add('domain-authority','storage or transport in presentation');
  }
  return issues;
}
export function check(root=process.cwd()) {
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const tokenSource=read('src/design-system/tokens.css');
  const tokens=new Set([...tokenSource.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
  const files=['src/design-system','tools/design-system'].flatMap(dir=>fs.readdirSync(path.join(root,dir),{recursive:true}).filter(f=>/\.(ts|css)$/.test(f)).map(f=>dir+'/'+f));
  const exceptions=JSON.parse(read('docs/design-system/exceptions.json'));
  const raw=files.filter(f=>!f.endsWith('/tokens.css')).flatMap(file=>inspectDesignSource(file,read(file),tokens));
  const issues=raw.filter(issue=>!exceptions.some(e=>e.file===issue.file&&e.rule===issue.rule&&e.match===issue.match&&e.reason?.length>30&&e.owner));
  for(const exception of exceptions)if(!raw.some(i=>i.file===exception.file&&i.rule===exception.rule&&i.match===exception.match))issues.push({file:exception.file,rule:'stale-exception',match:exception.match});
  for(const [file,symbol] of [['src/brand/page-header.ts','createCollectionHeader'],['src/brand/dashboard-card.ts','export *']])if(!read(file).includes(symbol)||read(file).includes('document.createElement'))issues.push({file,rule:'duplicate-component',match:'compatibility wrapper must delegate'});
  for(const file of ['src/brand/jems.css','src/brand/art-library.css','src/studio/modernization.css'])if(/:root\s*\{/.test(read(file)))issues.push({file,rule:'duplicate-foundations',match:':root'});
  for(const file of ['src/brand/journey.ts','src/pals/ui.ts','src/rewards/ui.ts','src/studio/ui.ts','src/studio/world-navigation.ts','src/studio/notifications-view.ts'])if(!read(file).includes('design-system/templates/collection'))issues.push({file,rule:'collection-template',match:'missing canonical import'});
  if(/\.jems-destination(?:s)?\b/.test(read('src/studio/modernization.css')))issues.push({file:'src/studio/modernization.css',rule:'duplicate-component',match:'destination styles belong to the shared component'});
  for(const [file,width] of [['components/page-header.css',580],['components/destination-card.css',640],['components/destination-card.css',1000],['components/dashboard-card.css',680]])if(!new RegExp('max-width:\\s*'+width+'px').test(read('src/design-system/'+file)))issues.push({file,rule:'breakpoint',match:String(width)});
  return {files:files.length,tokens:tokens.size,issues};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=check();if(result.issues.length){console.error(JSON.stringify(result.issues,null,2));process.exitCode=1;}else console.log(`PASS design contracts: ${result.files} shared/gallery sources, ${result.tokens} tokens, six collection consumers. Legacy feature CSS remains incrementally governed.`);
}
