import {MappedSyncStore} from './sync-journal';
import {ContinuityPump,continuityTransport,type SyncTransport} from './synchronizer';
import {requiredStorageDomains} from './sync-contract';
import {operationFingerprint} from './record-contract';
import {capturePrivateBranches} from './native-conflict';
import type {IndexedNativeStore} from './indexed-native';
/** The existing Parent storage surface owns explicit selection and conflict
 * decisions. Merely loading Jems or signing into a family starts no transfer. */
export function installPrivateCopyControls(){
 const anchor=document.getElementById('exportData');if(!anchor||document.getElementById('jemsPrivateCopies'))return;
 const FG=(window as any).FG,section=document.createElement('section');section.id='jemsPrivateCopies';section.className='panel';
 const title=document.createElement('h3');title.textContent='Private copies';
 const initialMessage='Local work stays on this device. A grown-up can check separately approved private copies.';
 const message=document.createElement('p');message.setAttribute('role','status');message.textContent=initialMessage;
 const choices=document.createElement('select');choices.setAttribute('aria-label','Game to copy');choices.hidden=true;
 const details=document.createElement('div');details.setAttribute('aria-live','polite');
 section.append(title,message,choices,details);anchor.parentElement!.append(section);
 let captured='',store:IndexedNativeStore|undefined,mapped:MappedSyncStore|undefined,pump:ContinuityPump|undefined,remote:SyncTransport|undefined,approvedUntil=0,busy=false,more:string|null=null,generation=0;
 const owner=()=>String(FG.store.current().id),current=(turn:number,profile:string)=>turn===generation&&owner()===profile&&captured===profile;
 const authorized=(turn=generation,profile=captured)=>current(turn,profile)&&Date.now()<approvedUntil;
 const button=(label:string,action:()=>Promise<void>)=>{const b=document.createElement('button');b.type='button';b.className='studio-button';b.textContent=label;b.style.minHeight='48px';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;let turn=generation;try{const pending=action();turn=generation;b.disabled=true;await pending;}catch{if(turn===generation){approvedUntil=0;store?.disablePrivateCopies();message.textContent='Private copies are unavailable. Your work and pending copies are still on this device. Check your family controls or connection.';}}finally{if(turn===generation){busy=false;b.disabled=false;}}};section.append(b);return b;};
 const stop=()=>{generation++;approvedUntil=0;store?.disablePrivateCopies();mapped?.close();mapped=undefined;pump=undefined;remote=undefined;store=undefined;captured='';busy=false;details.replaceChildren();choices.replaceChildren();choices.hidden=true;copy.hidden=true;resume.hidden=true;moreButton.hidden=true;message.textContent=initialMessage;for(const b of section.querySelectorAll('button'))b.disabled=false;};
 async function list(reset=false){
  if(!store)return;const turn=generation,profile=captured,activeStore=store;if(reset){choices.replaceChildren();more=null;}
  const page=await activeStore.page(more,24);if(!current(turn,profile))return;more=page.next;
  for(const project of page.items){const option=document.createElement('option');option.value=project.id;option.textContent=project.name;choices.append(option);}
  choices.hidden=!choices.options.length;copy.hidden=choices.hidden;moreButton.hidden=!more;
 }
 async function connect(){
  stop();busy=true;captured=owner();const turn=generation,profile=captured,transport=continuityTransport(profile),status=await transport.status();if(!current(turn,profile))return;
  if(status.version!==1||status.profile!==captured||!status.family||!status.guardian||!status.guardianUntil||requiredStorageDomains('native-projects').some(d=>!status.domains.includes(d)))throw Error('STORAGE_CONSENT_REQUIRED');
  approvedUntil=status.guardianUntil;store=FG.factory?.privateCopyStore?.()??undefined;
  if(!store){message.textContent='Private copy permissions are ready. Prepare this device’s saved-game library in the approved storage preview before transferring games.';return;}
  const activeStore=store,assertAuthorized=()=>{if(!authorized(turn,profile))throw Error('STORAGE_CONSENT_REQUIRED');};
  const opened=await MappedSyncStore.open(activeStore.records,activeStore.scope,{family:status.family,profile},assertAuthorized,(rows,operation)=>activeStore.applyRemoteGraph(rows,operation));
  if(!current(turn,profile)){opened.close();return;}mapped=opened;
  remote=transport;pump=new ContinuityPump(opened,transport,activeStore.scope,assertAuthorized);
  resume.hidden=false;await list(true);if(!current(turn,profile))return;await run();
 }
 async function run(){
  if(!pump||!mapped||!store||!remote||!authorized())throw Error('STORAGE_CONSENT_REQUIRED');
  const turn=generation,profile=captured,activeStore=store,activeMapped=mapped,activeRemote=remote,result=await pump.runOnce();if(!current(turn,profile))return;details.replaceChildren();
  if(result.state==='conflict'){
   message.textContent='This device and a saved private copy have different versions. Both are preserved. Review them before choosing.';
   const preview=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Review the changed records';preview.append(summary);
   const describe=(value:unknown)=>{if(!value||typeof value!=='object')return 'No saved version';const v=value as Record<string,unknown>,text=['name','label','hypothesis','title'].map(k=>v[k]).filter(x=>typeof x==='string'&&x).join(' · ');if(text)return text;const settings=Object.entries(v).filter(([,x])=>typeof x==='number'||typeof x==='boolean').slice(0,8).map(([k,x])=>k.replace(/([a-z])([A-Z])/g,'$1 $2')+': '+x).join(', ');return settings||'Saved game details';};
   for(let i=0;i<result.operation.changes.length;i++){const local=result.operation.changes[i],remote=result.remote[i],row=document.createElement('section');const here=document.createElement('p'),saved=document.createElement('p');here.textContent='On this device: '+describe(local.value);saved.textContent='Private copy: '+describe(remote?.value);row.append(here,saved);preview.append(row);}
   details.append(preview);
   const roots=result.remote.filter(row=>row?.collection==='native-projects'&&!row.deleted);
   if(roots.length){
    const both=document.createElement('button');both.type='button';both.className='studio-button';both.textContent='Keep both as games';both.onclick=async()=>{
     if(busy||!authorized(turn,profile))return;busy=true;both.disabled=true;
     try{
      const assertAuthorized=()=>{if(!authorized(turn,profile))throw Error('STORAGE_CONSENT_REQUIRED');};
      const rows=await capturePrivateBranches(activeRemote,roots as NonNullable<typeof roots[number]>[],assertAuthorized);
      const operation='preserve-'+await operationFingerprint({...result.operation,changes:result.operation.changes.map((c,i)=>({...c,expectedVersion:result.remote[i]?.version??0,value:result.remote[i]?.value??null,deleted:result.remote[i]?.deleted??false}))});
      assertAuthorized();await activeStore.preserveRemoteBranches(rows,roots.map(row=>row!.id),operation);assertAuthorized();await activeMapped.rememberPreservedRemote(rows);assertAuthorized();
      await FG.factory?.refreshPrivateCopies?.();if(!current(turn,profile))return;await list(true);if(!current(turn,profile))return;
      await activeMapped.keepLocal(result.operation,result.remote);if(!current(turn,profile))return;await run();
     }catch{if(current(turn,profile))message.textContent='The choice needs another check. Any new private-copy game is saved in your library, and the original versions remain preserved.';}
     finally{if(current(turn,profile)){busy=false;both.disabled=false;}}
    };details.append(both);
    const explanation=document.createElement('p');explanation.textContent='Keep both adds the reviewed private version as a new game in this device’s library, then keeps this device’s version as the current private copy. The new game stays local until you select it to copy.';details.append(explanation);
   }
   const choose=document.createElement('button');choose.type='button';choose.className='studio-button';choose.textContent='Keep this device’s version';choose.onclick=async()=>{if(busy||!authorized(turn,profile))return;busy=true;choose.disabled=true;try{await activeMapped.keepLocal(result.operation,result.remote);if(!current(turn,profile))return;await run();}catch{if(current(turn,profile))message.textContent='The saved copy changed again. Both versions remain safe. Check again before choosing.';}finally{if(current(turn,profile)){busy=false;choose.disabled=false;}}};details.append(choose);
   const note=document.createElement('p');note.textContent='The previous private version stays in its saved history. Leaving this choice open keeps this device’s work unchanged.';details.append(note);return;
  }
  const text={review:'This device has local changes. Select the game to copy and review both versions before choosing.',current:'Your approved copies are up to date.',pending:'Some copies are still pending. Check again to continue.',busy:'Another tab is checking these copies.',offline:'Connection interrupted. Your pending copies are kept on this device.',blocked:'Copy permission or access changed. Your local work is kept.'};message.textContent=text[result.state];
  if(result.state==='blocked'){approvedUntil=0;activeStore.disablePrivateCopies();}
  if(result.state==='current'){await activeStore.snapshot();if(!current(turn,profile))return;await FG.factory?.refreshPrivateCopies?.();if(!current(turn,profile))return;await list(true);}
 }
 button('Check private copies',connect);
 const copy=button('Copy the selected game',async()=>{if(!store||!authorized()||!choices.value)throw Error('STORAGE_CONSENT_REQUIRED');const turn=generation,profile=captured;message.textContent='Preparing the selected game and its saved versions…';await store.queueSelectedCopy(choices.value,()=>authorized(turn,profile));if(!current(turn,profile))return;await run();});copy.hidden=true;
 const resume=button('Continue pending copies',run);resume.hidden=true;
 const moreButton=button('Show more games',async()=>list());moreButton.hidden=true;
 addEventListener('factory-profile-changing',stop);addEventListener('pagehide',stop);
}
