// Build-time only. This module has no route, worker dispatch or deployment configuration.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {validateSource}=require('../../server/sandbox/source-validator.cjs');
const {runtimeBundle}=require('../../server/sandbox/bundle-v2.cjs');
const {renderClientDocument}=require('../../server/sandbox/preview-v2.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function reviewPackage(){
 const archive=runtimeBundle('quality-runtime-v2.1.0');
 const game=fs.readFileSync(path.join(__dirname,'adventure.js'),'utf8');
 validateSource({kind:'generated-module-v2',source:game});
 const compiled=transformSync(game,{loader:'js',format:'iife',globalName:'GameModule',target:'es2022'}).code;
 const controls=['left','right','up','down'];
 const programs=[3,5].map(speed=>{
   const runtime='"use strict";(function(){'+archive.worker+'\nreturn FactoryRuntime.run;})()';
   const script=archive.client+'\n('+boot.toString()+')('+[runtime,compiled,speed].map(value=>JSON.stringify(value)).join(',')+');';
   const document=renderClientDocument({title:'Flight through the valley',instructions:'Fly to the right edge. Pick up the collectible and steer around the obstacle if you see them.',controls},script,true);
   return {id:document.sha256,html:document.html};
 });
 const allowed=['rocket','rock','dragon','world'].map(name=>hash(fs.readFileSync(path.join(__dirname,'../../tests/game-art',name+'.png'))));
 return {programs,allowed};
}
function boot(runtime,game,speed){
 const load=event=>{
   if(event.source!==parent || event.data?.type!=='jems-local-art-test')return;
   removeEventListener('message',load);
   const {assets,channel}=event.data;
   const slots=Object.fromEntries(assets.map(a=>[a.id.slice(5),{id:a.id,aspect:a.height/a.width}]));
   const worker=runtime+'(function(api){"use strict";'+game+'\nreturn GameModule.createGame('+JSON.stringify(slots)+','+speed+');},'+JSON.stringify(assets.map(a=>a.id))+');';
   FactoryClient.startClient({worker,channel,artifactId:'art-review',controls:['left','right','up','down'],assets});
 };
 addEventListener('message',load);
}
module.exports={reviewPackage};
