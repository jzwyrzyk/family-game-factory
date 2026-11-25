import {exportHousehold,restoreHousehold} from './household-vault.js';
const element=id=>document.getElementById(id);
async function setup(){
 const response=await fetch('./mapping.json',{cache:'no-store'});if(!response.ok)throw Error('Owner mapping unavailable.');
 const {sourceGateway,...map}=await response.json();
 if(![map.sourceOrigin,map.targetOrigin].includes(location.origin))throw Error('This device is outside the household mapping.');
 element('mapping').textContent=map.sourceOrigin+' → '+map.targetOrigin;
 let busy=false;
 const perform=async work=>{if(busy)return;busy=true;try{element('result').textContent='Checking the household records…';await work();}catch(e){element('result').textContent=e.message;}finally{busy=false;}};
 if(location.origin===map.sourceOrigin){
  const origin=new URL(sourceGateway).origin;if(!sourceGateway.startsWith('https://')||origin!==sourceGateway)throw Error('Owner gateway unavailable.');
  element('source').hidden=false;
  const form=document.querySelector('form');
  form.onsubmit=e=>{e.preventDefault();void perform(async()=>{
   const passphrase=form.querySelector('input').value;form.reset();
   const post=(path,body)=>fetch(sourceGateway+path,{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify(body)});
   await post('/v1/sessions/renew',{});if(!(await post('/v1/devices/unlock',{parentPassphrase:passphrase})).ok)throw Error('The original trusted device needs a current parent unlock.');
   const archive=await exportHousehold(map),link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(archive)],{type:'application/json'}));
   link.href=url;link.download='jems-private-household-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   element('result').textContent='Saved recovery file. Verification fingerprint '+archive.sha256+'.';
  });};
 }else{
  element('target').hidden=false;
  for(const [id,undo] of [['restore',false],['undo',true]])element(id).onclick=()=>perform(async()=>{
   const file=document.querySelector('[type=file]').files[0];if(!file)throw Error('Choose a household recovery file.');
   if(undo&&!window.confirm('Remove the incomplete copy from this new household origin?'))return;
   const archive=JSON.parse(await file.text());await restoreHousehold(map,archive,undo);
   element('result').textContent=undo?'Partial copy removed.':'Every stored record passed read-back verification. Fingerprint '+archive.sha256+'.';
  });
 }
}
setup().catch(e=>{element('result').textContent=e.message;});
