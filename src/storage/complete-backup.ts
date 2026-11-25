import {currentAdultSession} from '../adult-pilot/session';
import {adultRecoveryStorage,verifyAdultRecovery} from './adult-recovery';
import {PalsStore,PALS_DB_NAME} from '../pals/store';
import {adultStorageKey} from '../adult-pilot/storage';
import {adultWorkspaceId} from '../adult-pilot/storage';
import {exportArtBundle,validateArtBundle,restoreFamilyArtBundles,type ArtBundle} from '../drawing/transfer';
import {assemblyHash} from '../creation/private-art';
import {withPalsMaintenance} from '../pals/service';
import type {RewardsController} from '../rewards/service';
import {applyFamilyRewardBackup,captureFamilyRewardPayload,validateFamilyRewardBackup} from '../rewards/backup';
import {assertRewardSourceLockHeld} from '../rewards/write-guard';
import {buildRecoveryArchive,RecoveryVault,validateRecoveryArchive,type RecoveryArchive,type RecoveryScope} from './recovery-vault';

export interface CompleteBackup {progress:Record<string,any>;art:{owner:string;bundle:ArtBundle}[]}
export async function checkCompleteArtwork(snapshot:CompleteBackup):Promise<void>{
 const owners=snapshot.progress.profiles?.map((p:any)=>p.id);if(!Array.isArray(owners)||!owners.length||new Set(owners).size!==owners.length||snapshot.art.length!==owners.length||new Set(snapshot.art.map(x=>x.owner)).size!==owners.length||snapshot.art.some(x=>!owners.includes(x.owner)))throw Error('This backup is missing a player’s original artwork.');
 for(const entry of snapshot.art)await validateArtBundle(entry.bundle);
 const find=(owner:string)=>snapshot.art.find(x=>x.owner===owner)?.bundle;
 const workspace=snapshot.progress.factoryWorkspace;
 for(const revision of workspace?.revisions??[]){if(!revision.drawingRigId)continue;const owner=workspace.projects.find((p:any)=>p.id===revision.projectId)?.owner;if(!find(owner)?.rigs.some(r=>r.id===revision.drawingRigId))throw Error('A saved game is missing its original movement artwork. Restore that art before making a complete recovery point.');}
 const creation=snapshot.progress.factoryCreation;
 for(const revision of [...creation?.revisions??[],...creation?.drafts??[]]){const owner=creation.projects.find((p:any)=>p.id===revision.projectId)?.owner;for(const actor of revision.scene?.actors??[]){const ref=/^art:(image|rig):([A-Za-z0-9_-]{1,100}):([a-f0-9]{64})$/.exec(actor.assetId);if(!ref)continue;const bundle=find(owner);if(ref[1]==='image'){if(!bundle?.drawings.some(x=>x.id===ref[2]&&x.sha256===ref[3]))throw Error('A coding scene is missing its original picture.');}else{const rig=bundle?.rigs.find(x=>x.id===ref[2]);if(!rig||await assemblyHash(rig.assembly)!==ref[3])throw Error('A coding scene is missing its exact movement version.');}}}
}
export async function encodeCompleteBackup(scope:RecoveryScope,snapshot:CompleteBackup,label:string,id?:string):Promise<RecoveryArchive>{
 await checkCompleteArtwork(snapshot);if(JSON.stringify([...scope.owners].sort())!==JSON.stringify(snapshot.progress.profiles.map((p:any)=>p.id).sort()))throw Error('Recovery profile ownership changed.');
 const values:Record<string,string>={progress:JSON.stringify(snapshot.progress)};for(const [i,entry] of snapshot.art.entries())values[`art-${i}`]=JSON.stringify(entry);return buildRecoveryArchive(scope,label,values,id);
}
export async function decodeCompleteBackup(archive:RecoveryArchive,scope:RecoveryScope):Promise<CompleteBackup>{
 const values=await validateRecoveryArchive(archive,scope);if(!values.progress||Object.keys(values).some(key=>key!=='progress'&&!/^art-[0-5]$/.test(key)))throw Error('This complete backup uses unsupported records.');
 const snapshot:CompleteBackup={progress:JSON.parse(values.progress),art:Object.entries(values).filter(([key])=>key.startsWith('art-')).sort(([a],[b])=>a.localeCompare(b)).map(([,text])=>JSON.parse(text))};
 if(JSON.stringify([...archive.manifest.scope.owners].sort())!==JSON.stringify(snapshot.progress.profiles?.map((p:any)=>p.id).sort()))throw Error('Recovery profile ownership does not match its manifest.');await checkCompleteArtwork(snapshot);return snapshot;
}
export function transferredRecoveryScope(scope:RecoveryScope,storage:Pick<Storage,'getItem'>=localStorage):RecoveryScope|null {
 const raw=storage.getItem('jems-recovery-origin-transfer-v1');if(!raw)return null;
 let receipt:any;try{receipt=JSON.parse(raw);}catch{throw Error('The household recovery transfer receipt is damaged. Keep the original device.');}
 if(receipt.schema!=='jems.recovery-origin-transfer.v1'||receipt.targetOrigin!==scope.origin||receipt.sourceOrigin===receipt.targetOrigin||!['familyId','workspace'].every(k=>typeof receipt[k]==='string'&&/^[\w-]{1,100}$/.test(receipt[k])&&!receipt[k].startsWith('beta-'))||!/^[a-f0-9]{64}$/.test(receipt.archiveSha256))throw Error('The household recovery transfer does not match this origin.');
 for(const origin of [receipt.sourceOrigin,receipt.targetOrigin]){const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin||/^f-[a-f\d-]{36}\./i.test(url.hostname))throw Error('Recovery transfer requires the approved household origins.');}
 return {...scope,origin:receipt.sourceOrigin};
}
function archiveScope(archive:RecoveryArchive,scope:RecoveryScope):RecoveryScope {
 if(archive.manifest.scope.origin===scope.origin)return scope;
 const source=transferredRecoveryScope(scope);if(!source||source.origin!==archive.manifest.scope.origin)throw Error('This recovery point belongs to another origin. Use the approved household transfer first.');return source;
}
function currentScope():RecoveryScope {const FG=(window as any).FG,adult=adultWorkspaceId();return {origin:location.origin,audience:adult??'family',owners:adult?[adult]:FG.store.familyProfiles().map((p:any)=>p.id)};}
function currentVault(){const scope=currentScope();return new RecoveryVault(scope,()=>{assertRewardSourceLockHeld();if(currentScope().audience!==scope.audience||scope.audience!=='family'&&currentAdultSession()?.profileId!==scope.audience||location.origin!==scope.origin)throw Error('The selected workspace changed. Reopen recovery for this family.');});}
export async function captureCompleteRecovery(rewards:RewardsController,label='Saved recovery point'):Promise<RecoveryArchive>{
 const FG=(window as any).FG;FG.studio?.flushDraft?.();FG.creation?.flush?.();const vault=currentVault();
 return withPalsMaintenance(pals=>rewards.maintenance(async ledger=>{const progress=await captureFamilyRewardPayload(FG,ledger,pals) as Record<string,any>;if(!Array.isArray(progress.profiles))throw Error('Saved progress needs repair before a complete recovery point can be made. Export the preserved records first.');const art=[];for(const owner of vault.scope.owners)art.push({owner,bundle:await exportArtBundle(owner)});const archive=await encodeCompleteBackup(vault.scope,{progress,art},label);await vault.save(archive);return archive;}));
}
export async function restoreCompleteRecovery(rewards:RewardsController,archive:RecoveryArchive):Promise<'restored'|'already-restored'>{
 const FG=(window as any).FG,vault=currentVault();if(document.documentElement.dataset.privateBeta==='true')throw Error('Use the approved family transfer flow to restore this workshop.');const adult=adultWorkspaceId(),adultGuard=adult?await verifyAdultRecovery(adult):undefined;
 const acceptedScope=archiveScope(archive,vault.scope),snapshot=await decodeCompleteBackup(archive,acceptedScope),plan=validateFamilyRewardBackup(JSON.stringify(snapshot.progress),FG.store.validateBackup,rewards.store(),new PalsStore(adultStorageKey(PALS_DB_NAME,adult)),adult??'family');
 const previous=await vault.receipt(archive.manifest.id);if(previous?.phase==='complete')return 'already-restored';
 if(!adult&&FG.store.backupChangesGrades(plan.base))await FG.verifyParentSettings();
 if(currentScope().audience!==vault.scope.audience)throw Error('The workspace changed. Nothing was replaced.');
 // Keep a complete original recovery point before the first modifying step.
 const rollbackId=previous?.rollbackId??(await captureCompleteRecovery(rewards,'Before restore')).manifest.id;
 if(acceptedScope.origin===vault.scope.origin)await vault.save(archive);await vault.recordRestore(archive.manifest.id,rollbackId,'prepared');
 await withPalsMaintenance(pals=>rewards.maintenance(async ledger=>{
  const authorized=()=>{assertRewardSourceLockHeld();adultGuard?.();if(adultWorkspaceId()!==adult||location.origin!==vault.scope.origin)throw Error('Recovery access changed.');};
  await restoreFamilyArtBundles(snapshot.art,plan.owners,authorized);await vault.recordRestore(archive.manifest.id,rollbackId,'art-restored');
  await applyFamilyRewardBackup(plan,adult?adultRecoveryStorage(adult):localStorage,ledger,'restore',pals,adult??'family',authorized);
  await vault.recordRestore(archive.manifest.id,rollbackId,'complete');
 }));return 'restored';
}
function downloadArchive(archive:RecoveryArchive){const url=URL.createObjectURL(new Blob([JSON.stringify(archive)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='jems-complete-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function installCompleteRecovery(rewards:RewardsController):void {
 const anchor=document.getElementById('exportData');if(!anchor||document.getElementById('jemsRecovery'))return;
 const section=document.createElement('section');section.id='jemsRecovery';section.className='panel';section.style.cssText='margin-block:20px;padding:20px;max-width:100%;color:#25324a;background:#fff8e8';
 const title=document.createElement('h3');title.textContent='Recovery copies';const help=document.createElement('p');help.textContent='Keep profiles, games, conversations and original pictures together. Copies on this browser stay on this device. Download a complete copy before moving or clearing it.';
 const status=document.createElement('p');status.id='jemsRecoveryStatus';status.setAttribute('role','status');status.style.cssText='font-size:18px;overflow-wrap:anywhere';const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
 const button=(text:string,id:string,run:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.id=id;b.style.cssText='min-height:48px;padding:10px 16px;font-size:18px';b.onclick=run;return b;};
 let busy=false;const action=async(work:()=>Promise<void>)=>{if(busy)return;busy=true;try{await work();}catch(error){status.textContent=error instanceof Error?error.message:'Your recovery copy could not finish. Existing work is still here.';status.setAttribute('role','alert');}finally{busy=false;}};
 const list=document.createElement('div');list.id='jemsRecoveryList';const cursors=new Map<string,{createdAt:string;id:string}>();
 const show=async(reset=true)=>{if(reset){list.replaceChildren();cursors.clear();}const vaults=[currentVault()],source=transferredRecoveryScope(currentScope());if(source)vaults.push(new RecoveryVault(source,()=>{}));const points=[];let hasMore=false;for(const vault of vaults){const page=await vault.list(cursors.get(vault.scope.origin),10);points.push(...page);hasMore ||= page.length===10;if(page.length)cursors.set(vault.scope.origin,{createdAt:page.at(-1)!.createdAt,id:page.at(-1)!.id});}for(const point of points){const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-block:10px';const label=document.createElement('span');label.textContent=`${point.label} · ${new Date(point.createdAt).toLocaleString()}`;row.append(label,button('Preview','recovery-preview-'+point.id,()=>void action(async()=>{
   const pointVault=point.scope.origin===location.origin?currentVault():new RecoveryVault({...currentScope(),origin:point.scope.origin},()=>{if(transferredRecoveryScope(currentScope())?.origin!==point.scope.origin)throw Error('Recovery transfer no longer matches.');});const archive=await pointVault.read(point.id),snapshot=await decodeCompleteBackup(archive,archiveScope(archive,currentScope()));const pictures=snapshot.art.reduce((n,x)=>n+x.bundle.drawings.length,0),games=snapshot.progress.factoryWorkspace?.projects.length??0;
   preview.replaceChildren();const description=document.createElement('p');description.textContent=`${snapshot.progress.profiles.length} players, ${games} saved games and ${pictures} original pictures. Restoring replaces family progress. Current pictures stay safe, and a complete “Before restore” copy keeps your current progress.`;
   preview.append(description,button('Download complete copy','recovery-download',()=>downloadArchive(archive)),button('Restore this copy','recovery-restore',()=>void action(async()=>{status.textContent='Checking originals and keeping a safety copy…';const result=await restoreCompleteRecovery(rewards,archive);status.textContent=result==='already-restored'?'This copy has already been restored. Your newer work was kept.':'Recovery finished. Reopening your saved work…';if(result==='restored')location.reload();})));preview.hidden=false;
  })));list.append(row);}more.hidden=!hasMore;};
 const preview=document.createElement('section');preview.id='jemsRecoveryPreview';preview.hidden=true;preview.style.cssText='padding:16px;border:2px solid #6f5689;border-radius:12px';
 const more=button('Earlier copies','recovery-more',()=>void action(()=>show(false)));more.hidden=true;
 const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.hidden=true;input.id='recovery-import-file';input.onchange=()=>void action(async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>100*1024*1024)throw Error('Choose a complete recovery file smaller than 100 MB.');const archive=JSON.parse(await file.text());await decodeCompleteBackup(archive,currentScope());await currentVault().save(archive);status.textContent='Complete copy checked. Choose Preview to review it before restoring.';await show();}finally{input.value='';}});
 controls.append(button('Save a recovery copy','recovery-save',()=>void action(async()=>{status.textContent='Keeping your saved work and original pictures…';await captureCompleteRecovery(rewards);status.textContent='Complete recovery copy saved on this device.';await show();})),button('Show recovery copies','recovery-show',()=>void action(()=>show())),button('Open a complete copy','recovery-import',()=>input.click()));
 const schedule=document.createElement('label');schedule.style.cssText='display:block;margin-block:16px;font-size:18px';const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='recovery-schedule';schedule.append(toggle,document.createTextNode(' Keep a daily recovery copy while Jems is open'));toggle.onchange=()=>void action(async()=>{await currentVault().setSchedule({enabled:toggle.checked,intervalHours:24});status.textContent=toggle.checked?'Daily copies are on for this device. They are never uploaded.':'Daily copies are off.';});
 section.append(title,help,controls,schedule,status,list,more,preview,input);(anchor.closest('.panel')??anchor.parentElement)?.append(section);
 if(document.documentElement.dataset.privateBeta==='true'){input.disabled=true;document.getElementById('recovery-import')?.setAttribute('hidden','');}
 const scheduled=async()=>{if(busy||adultWorkspaceId())return;const vault=currentVault(),settings=await vault.schedule();toggle.checked=settings.enabled;if(settings.enabled&&(!settings.lastCompleted||Date.now()-Date.parse(settings.lastCompleted)>=settings.intervalHours*3600000)){busy=true;try{await captureCompleteRecovery(rewards,'Daily recovery copy');await vault.setSchedule({...settings,lastCompleted:new Date().toISOString()});status.textContent='Daily recovery copy saved on this device.';}finally{busy=false;}}};
 // Defaults off. The timer does no network I/O and makes no expired-record deletions.
 setTimeout(()=>void scheduled().catch(error=>{status.textContent=error.message;}),30000);const timer=setInterval(()=>void scheduled().catch(error=>{status.textContent=error.message;}),60000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 window.addEventListener('factory-profile',()=>{list.replaceChildren();preview.hidden=true;status.textContent='';toggle.checked=false;});
}
