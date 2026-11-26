import {mkdir,readdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {publicPage} from '../../server/beta/pages';

export async function preparePublic(output:string,hub:string,operatorContact:string){
 if(!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hub)||!/^[-.\w+]+@[-.\w]+\.[A-Za-z]{2,}$/.test(operatorContact))throw Error('Exact hub and adult contact required.');
 const dir=resolve(output);await mkdir(dir,{recursive:true});if((await readdir(dir)).length)throw Error('Choose an empty public directory.');
 const copy=async(source:string,name:string)=>{const target=resolve(dir,name);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);};
 const files=['jems-logo.svg','fonts/jems/Nunito-Variable.woff','fonts/jems/Inter-Variable.woff',...['scene-sky','rock-expressions','miner-poses','cart-empty'].map(n=>'art/mind-your-jems/'+n+'.webp')];
 for(const file of files)await copy('public/'+file,'welcome-assets/'+file);
 const css=(await readFile('server/beta/web/entry.css','utf8')).replaceAll('/welcome-assets/','./welcome-assets/');
 await writeFile(dir+'/entry.css',css);
 // All navigation uses absolute canonical links, including legacy project-page deep routes.
 const html=publicPage('/',{operatorContact},false)!.replace(/<script[^>]*src="\/entry.js"[^>]*><\/script>/,'')
  .replace(/href="\/(login|invitation|about|privacy|contact|terms)"/g,(_,path)=>'href="'+hub+'/'+path+'"')
  .replaceAll('href="/"','href="'+hub+'/"').replaceAll('src="/welcome-assets/','src="./welcome-assets/').replace('href="/entry.css"','href="./entry.css"');
 await writeFile(dir+'/index.html',html);
 await writeFile(dir+'/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Welcome to Jems</title><main><h1>Welcome to Jems!</h1><p>The family workshop has moved.</p><a href="'+hub+'/">Visit the Jems welcome page</a></main></html>');
 await copy('scripts/beta/retire-sw.js','sw.js');await writeFile(dir+'/.nojekyll','');
}
if(process.argv[1]?.endsWith('/beta/prepare-public.ts'))preparePublic(process.argv[2],process.argv[3],process.argv[4]).catch(e=>{console.error(e.message);process.exitCode=1;});
