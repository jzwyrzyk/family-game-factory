import {encodeReviewRaster} from '../../tools/creative-game-art/raster';
import archive from './review-package';
import {resolveArtTest,type ReviewScope} from './resolve';
import {drawingHash} from '../assets/private-drawings';
import type {GameArtPlan,GameArtPin} from './bindings';

export function sampleProgram(faster:boolean,pins:GameArtPin[]){
  if(pins.length+Number(!pins.some(p=>p.role==='background'))>8)throw Error('This sample fits eight pictures, including its background. Remove a role to try it.');
  if(!pins.every(p=>archive.allowed.includes(p.sha256)))throw Error('This offline review plays only the four sample drawings.');
  return archive.programs[faster?1:0].id;
}
const base64 = (bytes:ArrayBuffer) => {
  const data=new Uint8Array(bytes);
  let result='';
  for(let i=0;i<data.length;i+=16384)result+=String.fromCharCode(...data.subarray(i,i+16384));
  return btoa(result);
};
/** A fresh opaque frame per explicit launch. No frame precedes byte verification. */
export async function playArtTest(scope:ReviewScope,
  active:()=>{owner:string;game:string;plan:GameArtPlan}|null,onKeep:()=>Promise<void>) {
  if(import.meta.env.MODE!=='game-art-review')throw Error('This art test needs the offline review build.');
  const resolved=await resolveArtTest(scope,active);
  const program=archive.programs.find(p=>p.id===resolved.program);
  if(!program || await drawingHash(new TextEncoder().encode(program.html).buffer)!==program.id)
    throw Error('The original sample game is unavailable.');
  const assets:{id:string;mime:string;width:number;height:number;data:string;sampling:string}[]=[];
  for(const a of resolved.assets){
    if(!archive.allowed.includes(await drawingHash(a.bytes)))throw Error('This offline review plays only the four sample drawings.');
    const bitmap=await createImageBitmap(new Blob([a.bytes],{type:a.mime}));
    try {
      resolved.assertCurrent();
      assets.push({id:a.id,mime:'image/png',width:a.width,height:a.height,
        data:encodeReviewRaster(bitmap,a.width,a.height),sampling:'pixelated'});
    }finally{bitmap.close();}
  }
  if(!assets.some(a=>a.id==='slot_background')){
    const response=await fetch('./gem-factory-workshop.webp',{credentials:'omit',redirect:'error'});
    const bytes=await response.arrayBuffer();
    if(!response.ok || await drawingHash(bytes)!=='b6e81f59ab4d1e05475b85817264645ecda30ed105eb7934fcc69b956f065afe')
      throw Error('The sample workshop is unavailable. Reopen the offline review.');
    assets.push({id:'slot_background',mime:'image/webp',width:1536,height:1024,data:base64(bytes),sampling:'smooth'});
  }
  resolved.assertCurrent();
  const channel=crypto.randomUUID(),dialog=document.createElement('dialog'),frame=document.createElement('iframe');
  dialog.className='game-art-review';dialog.setAttribute('aria-label','Local sample game');
  frame.title='Local sample game';frame.sandbox.add('allow-scripts');frame.referrerPolicy='no-referrer';
  const close=document.createElement('button'),keep=document.createElement('button'),status=document.createElement('p');
  close.textContent='Back to my idea';close.className=keep.className='studio-button';
  keep.textContent='Keep this art test';keep.disabled=true;status.setAttribute('role','status');
  const lifetime=new AbortController(),options={signal:lifetime.signal};
  function end(){if(lifetime.signal.aborted)return;lifetime.abort();frame.remove();dialog.close();dialog.remove();}
  close.onclick=end;dialog.addEventListener('close',end,{once:true});
  for(const change of ['pagehide','factory-page','factory-profile-changing','factory-profile','factory-parent-guidance','factory-art-updated'])
    window.addEventListener(change,end,options);
  const check=()=>{try{resolved.assertCurrent();return true;}catch{end();return false;}};
  const timer=window.setInterval(check,250);lifetime.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow || event.origin!=='null' || event.data?.type!=='factory-preview' ||
       event.data.channel!==channel || event.data.artifactId!=='art-review' || !check())return;
    if(event.data.event==='round-complete' && event.data.won===true)keep.disabled=false;
  },options);
  keep.onclick=async()=>{if(!check())return;keep.disabled=true;try{await onKeep();if(check())status.textContent='This art test is kept.';}
    catch(e){if(check()){status.textContent=(e as Error).message;keep.disabled=false;}}};
  frame.addEventListener('load',()=>{if(check())frame.contentWindow?.postMessage({type:'jems-local-art-test',channel,assets},'*');},{once:true});
  frame.srcdoc=program.html;dialog.append(frame,keep,close,status);document.body.append(dialog);dialog.showModal();
}
