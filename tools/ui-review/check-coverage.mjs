import fs from 'node:fs/promises';
const manifest=JSON.parse(await fs.readFile('tools/ui-review/coverage.json','utf8'));
const known=new Set(manifest.pages.map(p=>p.id.startsWith('studioNotifications')?p.id:'page-'+p.id));
const files=['index.html',...(await fs.readdir('src',{recursive:true})).filter(x=>/\.(ts|js)$/.test(x)).map(x=>'src/'+x)];
const found=new Map();
for(const file of files){const text=await fs.readFile(file,'utf8');for(const match of text.matchAll(/(?:\bid\s*=\s*|\.id\s*=\s*)["'](page-[\w-]+|studioNotifications)["']/g)){if(!found.has(match[1]))found.set(match[1],file);}}
const missing=[...found].filter(([id])=>!known.has(id));
if(missing.length){console.error('Uncovered application pages:',missing);process.exitCode=1;}else console.log(`PASS coverage: ${found.size} discovered page IDs, ${manifest.pages.length} manifest pages; ${manifest.states.length} intermediate states.`);
