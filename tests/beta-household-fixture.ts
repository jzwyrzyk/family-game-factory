/** Browser fixture uses the same persistence APIs as the application. Synthetic content only. */
import {RevisionStore} from '../src/factory/workspace';
import {StudioNotebook} from '../src/studio/notebook';
import {defaults} from '../src/runtime/manifests';
import {saveDrawing,drawing} from '../src/assets/private-drawings';

export async function createHousehold(){
 const FG=(window as any).FG,store=new RevisionStore(localStorage),notebook=new StudioNotebook(localStorage);
 const owners=FG.store.familyProfiles().slice(0,2).map((p:any)=>p.id),entries=[];
 for(const owner of owners){
  FG.store.choose(owner);FG.store.current().mathWindow=[Date.now()];FG.store.save();
  for(const game of ['buckets','dragon'] as const){
   const name=game==='buckets'?'Splash or Pass':'Dragon Island',config=defaults(game);
   const project=store.create(owner,game,name,config);
   const changed={...config,...(game==='buckets'?{splashMs:1200,revealSafe:true}:{shieldRadius:90,groundResilience:150})};
   store.commit(project.id,owner,changed,'Synthetic saved change','Try the saved mechanics');store.keep(project.id,owner);
   const session=notebook.create(owner,game,name,project.id,{playOnly:true});
   notebook.message(session.id,owner,'child','These are my synthetic original game words.');
   const legacy=store.fork(project.id,owner,name+' earlier engine');
   store.commit(legacy.id,owner,{...changed,originalRules:false},'Keep earlier engine');store.keep(legacy.id,owner);
   const legacySession=notebook.fork(session.id,owner,name+' earlier engine',legacy.id,null);
   entries.push({owner,game,projectId:project.id,sessionId:session.id,config:changed,legacyProjectId:legacy.id,legacySessionId:legacySession.id});
  }
 }
 FG.store.choose(owners[0]);
 const canvas=document.createElement('canvas');canvas.width=48;canvas.height=32;
 const paint=canvas.getContext('2d')!;paint.fillStyle='#6f40b5';paint.fillRect(0,0,48,32);paint.fillStyle='#f6be36';paint.fillRect(8,8,24,16);
 const original=await saveDrawing(owners[0],'Synthetic original artwork',await new Promise<Blob>(ok=>canvas.toBlob(blob=>ok(blob!),'image/png')));
 return {owners,entries,art:{owner:original.owner,id:original.id,sha256:original.sha256,bytes:Array.from(new Uint8Array(original.bytes))},workspace:store.snapshot(),notebook:notebook.read()};
}
export async function inspectHousehold(art:{owner:string;id:string}){
 const item=await drawing(art.owner,art.id);
 return {workspace:new RevisionStore(localStorage).snapshot(),notebook:new StudioNotebook(localStorage).read(),art:{owner:item.owner,id:item.id,sha256:item.sha256,bytes:Array.from(new Uint8Array(item.bytes))}};
}
