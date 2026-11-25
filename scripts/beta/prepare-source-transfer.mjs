import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
const [file,out]=process.argv.slice(2);
if(!file||!out)throw Error('Supply the reviewed household mapping file and an empty output directory.');
const c=JSON.parse(await readFile(file,'utf8')),keys=['familyId','sourceGateway','sourceOrigin','targetOrigin','workspace'];
if(Object.keys(c).sort().join()!==keys.join()||![c.familyId,c.workspace].every(s=>typeof s==='string'&&/^[\w-]{1,100}$/.test(s)&&!s.startsWith('beta-'))||
 ![c.sourceOrigin,c.sourceGateway,c.targetOrigin].every(s=>typeof s==='string'&&/^https:\/\/[a-z0-9.-]+$/.test(s)&&!/^https:\/\/f-[a-f0-9-]{36}\./.test(s))||c.sourceOrigin===c.targetOrigin)throw Error('Household transfer mapping rejected.');
await mkdir(out,{recursive:true});if((await readdir(out)).length)throw Error('Choose an empty directory.');
for(const name of ['transfer.html','transfer.js','household-vault.js'])await copyFile('server/beta/web/'+name,out+'/'+(name==='transfer.html'?'index.html':name));
await writeFile(out+'/mapping.json',JSON.stringify(c));
