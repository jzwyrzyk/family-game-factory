import {validateAssembly,type DrawingAssembly} from './model';
import {drawing} from '../assets/private-drawings';
export interface SavedRig {id:string;owner:string;parentId:string|null;assembly:DrawingAssembly;savedAt:string}
const req=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const done=(t:IDBTransaction)=>new Promise<void>((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error||Error('Could not save your design.'));t.onerror=()=>reject(t.error)});
async function db(){
 const r=indexedDB.open('family-drawing-rigs-v1',1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('rigs',{keyPath:'id'});d.createObjectStore('active',{keyPath:'owner'});};
 return req(r);
}
export async function listRigs(owner:string):Promise<SavedRig[]>{
 const d=await db();try{return ((await req(d.transaction('rigs').objectStore('rigs').getAll())) as SavedRig[])
   .filter(r=>r.owner===owner).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}finally{d.close();}
}
export async function rigById(owner:string,id:string):Promise<SavedRig>{
 const all=await listRigs(owner),r=all.find(x=>x.id===id);if(!r)throw Error('This design belongs to another player or is unavailable.');
 validateAssembly(r.assembly);return structuredClone(r);
}
export async function saveRig(owner:string,input:DrawingAssembly,parentId:string|null=null):Promise<SavedRig>{
 if(!owner)throw Error('Choose a player.');
 const assembly=validateAssembly(input);
 const original=await drawing(owner,assembly.sourceId);
 if(original.sha256!==assembly.sourceSha256)throw Error('This drawing has changed. Your previous design is safe.');
 const all=await listRigs(owner);
 if(all.length>=50)throw Error('Your design shelf is full. Export a design before making more.');
 if(parentId&&!all.some(r=>r.id===parentId&&r.assembly.sourceId===assembly.sourceId))throw Error('Cannot continue that design.');
 const entry:SavedRig={id:crypto.randomUUID(),owner,parentId,assembly,savedAt:new Date().toISOString()};
 const d=await db();
 try{const t=d.transaction('rigs','readwrite'),complete=done(t);t.objectStore('rigs').add(entry);await complete;return entry;}finally{d.close();}
}
export async function selectRig(owner:string,id:string){
 const r=await rigById(owner,id);if(r.assembly.kind!=='car')throw Error('Only car rigs can drive in Rally yet.');
 const d=await db();try{const t=d.transaction('active','readwrite'),complete=done(t);t.objectStore('active').put({owner,id});await complete;}finally{d.close();}
}
export async function activeRig(owner:string):Promise<SavedRig|null>{
 if(!owner)return null;const d=await db();let id:string|undefined;
 try{const a=await req(d.transaction('active').objectStore('active').get(owner)) as {owner:string;id:string}|undefined;id=a?.id;}finally{d.close();}
 if(!id)return null;try{return await rigById(owner,id);}catch{return null;}
}
export async function clearRig(owner:string){const d=await db();try{const t=d.transaction('active','readwrite'),complete=done(t);t.objectStore('active').delete(owner);await complete;}finally{d.close();}}
