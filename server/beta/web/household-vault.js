// Runs on the selected device. No network, cookies, sessionStorage or cached application code.
const journalKey = 'jems-household-transfer-in-progress-v1';
const dataKeys = new Set(['family-game-factory-state-v1','family-game-factory-workspace-v2',
 'family-game-factory-studio-v1','family-game-factory-creation-v1','family-game-factory-problem-solving-v1',
 'family-game-factory-pending-build-v1','family-game-factory-reward-backup-journal-v1',
 'splash-or-pass-highscore-v3','factory-game-sound-v1','jems.reading-voice.v1']);
const databaseNames = new Set(['family-game-factory-rewards-v1','family-game-factory-pals-v1',
 'family-private-drawings-v1','family-drawing-rigs-v1','jems-records-preparation-v1']);
const baseName = name => name.replace(/^family-game-factory-adult:adult:[a-f\d-]{36}:/i,'');
function reviewed(name, db=false) {
 const base=baseName(name);
 if(db ? databaseNames.has(base) : dataKeys.has(base)||/^jems-beta-remote-v1:[a-f\d-]{36}$/.test(base)||/^family-game-factory-pending-submission-v1:[\w:-]+$/.test(base))return true;
 if(name!==journalKey && /^(family-|factory-|jems[.-]|splash-or-pass)/.test(name))throw Error('Unreviewed Jems storage. Keep the original device and contact the operator.');
 return false;
}
function validateMap(m, at) {
 if(!m || Object.keys(m).sort().join(',')!=='familyId,sourceOrigin,targetOrigin,workspace' ||
  ![m.familyId,m.workspace].every(k=>typeof k==='string' && /^[\w-]{1,100}$/.test(k)&&!k.startsWith('beta-')) ||
  m.sourceOrigin===m.targetOrigin || ![m.sourceOrigin,m.targetOrigin].includes(at))throw Error('Household mapping does not match this device.');
 for(const origin of [m.sourceOrigin,m.targetOrigin]){
  const url=new URL(origin);
  if(url.protocol!=='https:' || url.origin!==origin || /^f-[a-f\d-]{36}\./i.test(url.hostname))throw Error('A dedicated household origin is required.');
 }
}
const to64 = bytes => {
 let text='';
 for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(text);
};
const from64 = str => Uint8Array.from(atob(str), c=>c.charCodeAt(0));
const sort=(a,b)=>a<b?-1:a>b?1:0;
const views={Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,DataView};
async function pack(v) {
 if(v===null || ['string','boolean'].includes(typeof v))return ['value',v];
 if(typeof v==='number')return ['number',Object.is(v,-0)?'-0':String(v)];
 if(v===undefined)return ['undefined'];
 if(typeof v==='bigint')return ['bigint',String(v)];
 if(v instanceof Date)return ['date',v.toISOString()];
 if(v instanceof File)return ['file',v.type,v.name,v.lastModified,to64(new Uint8Array(await v.arrayBuffer()))];
 if(v instanceof Blob)return ['blob',v.type,to64(new Uint8Array(await v.arrayBuffer()))];
 if(v instanceof ArrayBuffer)return ['bytes','ArrayBuffer',to64(new Uint8Array(v))];
 if(ArrayBuffer.isView(v)&&Object.hasOwn(views,v.constructor.name))return ['bytes',v.constructor.name,to64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))];
 if(Array.isArray(v))return ['array',await Promise.all(v.map(pack))];
 if(v instanceof Map)return ['map',await Promise.all([...v].map(async ([k,val])=>[await pack(k),await pack(val)]))];
 if(v instanceof Set)return ['set',await Promise.all([...v].map(pack))];
 if(v && [Object.prototype,null].includes(Object.getPrototypeOf(v)))return ['object',await Promise.all(Object.keys(v).sort(sort).map(async k=>[k,await pack(v[k])]))];
 throw Error('Unsupported record type. The source must be retained.');
}
function unpack([tag,a,b,c,d]){
 switch(tag){
  case 'value':return a;
  case 'number':return Number(a);
  case 'undefined':return undefined;
  case 'bigint':return BigInt(a);
  case 'date':return new Date(a);
  case 'file':return new File([from64(d)],b,{type:a,lastModified:c});
  case 'blob':return new Blob([from64(b)],{type:a});
  case 'bytes':{const buf=from64(b).buffer;if(a==='ArrayBuffer')return buf;if(Object.hasOwn(views,a))return new views[a](buf);break;}
  case 'array':return a.map(unpack);
  case 'object':return Object.fromEntries(a.map(([k,v])=>[k,unpack(v)]));
  case 'map':return new Map(a.map(([k,v])=>[unpack(k),unpack(v)]));
  case 'set':return new Set(a.map(unpack));
 }
 throw Error('Unsupported archive value.');
}
const request = r => new Promise((resolve,reject)=>{
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 if('onblocked' in r)r.onblocked=()=>reject(Error('Close all other Jems tabs, then retry.'));
});
async function originDatabases(){
 if(!indexedDB.databases)throw Error('This browser cannot inventory all databases. Keep the original browser profile.');
 return (await indexedDB.databases()).map(row=>row.name).filter(n=>typeof n==='string'&&reviewed(n,true)).sort(sort);
}
async function readDatabase(name){
 const open=indexedDB.open(name);open.onupgradeneeded=()=>open.transaction.abort();
 const db=await request(open);
 try{
  const names=[...db.objectStoreNames].sort(sort);
  const tx=names.length?db.transaction(names):null;
  const stores=await Promise.all(names.map(async name=>{
   const os=tx.objectStore(name);
   if(os.autoIncrement)throw Error('Unreviewed automatic key generator. Keep the source.');
   const indexes=[...os.indexNames].sort(sort).map(n=>{const i=os.index(n);return {name:n,keyPath:i.keyPath,unique:i.unique,multiEntry:i.multiEntry};});
   const [keys,values]=await Promise.all([request(os.getAllKeys()),request(os.getAll())]);
   return {name,keyPath:os.keyPath,indexes,rows:await Promise.all(keys.map(async(k,i)=>[await pack(k),await pack(values[i])]))};
  }));
  return {name,version:db.version,stores};
 }finally{db.close();}
}
async function inventory() {
 const local=Object.keys(localStorage).filter(n=>reviewed(n)).sort(sort).map(n=>[n,localStorage.getItem(n)]);
 const databases=await Promise.all((await originDatabases()).map(readDatabase));
 return {local,databases};
}
async function digest(value){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function exportHousehold(mapping){
 validateMap(mapping,location.origin);
 if(mapping.sourceOrigin!==location.origin||localStorage.getItem(journalKey))throw Error('Select the original household device.');
 const data=await inventory();
 if(!data.local.length&&!data.databases.length)throw Error('No household records found in this browser partition.');
 if(await digest(data)!==await digest(await inventory()))throw Error('Household data changed. Close other tabs and retry.');
 const body={format:'jems.household-transfer.v1',mapping,data};
 return {body,sha256:await digest(body)};
}
async function createDatabase(db){
 const open=indexedDB.open(db.name,db.version);
 open.onupgradeneeded=e=>{
  const tx=open.transaction;
  try{
   if(e.oldVersion!==0)throw Error('Occupied database.');
   for(const store of db.stores){
    const os=open.result.createObjectStore(store.name,store.keyPath===null?{}:{keyPath:store.keyPath});
    for(const i of store.indexes)os.createIndex(i.name,i.keyPath,{unique:i.unique,multiEntry:i.multiEntry});
    for(const [key,value] of store.rows){if(store.keyPath===null)os.add(unpack(value),unpack(key));else os.add(unpack(value));}
   }
  }catch{tx.abort();}
 };
 (await request(open)).close();
}
export async function restoreHousehold(mapping,archive,rollback=false){
 validateMap(mapping,location.origin);
 if(mapping.targetOrigin!==location.origin||archive?.body?.format!=='jems.household-transfer.v1'||
  !Object.entries(mapping).every(([k,v])=>archive.body.mapping[k]===v)||await digest(archive.body)!==archive.sha256)throw Error('Archive integrity or household mapping failed.');
 if(!navigator.locks)throw Error('This browser cannot lock a household transfer.');
 return navigator.locks.request(journalKey,async()=>{
  const data=archive.body.data,journal=localStorage.getItem(journalKey);
  const local=new Map(data.local),dbs=new Map(data.databases.map(db=>[db.name,db]));
  if(data.local.length!==local.size||dbs.size!==data.databases.length||(!local.size&&!dbs.size)||
     [...local].some(([k,v])=>typeof k!=='string'||!reviewed(k)||typeof v!=='string')||
     [...dbs.keys()].some(k=>typeof k!=='string'||!reviewed(k,true)))throw Error('Unexpected archive inventory.');
  const current=await inventory(),same=await digest(current)===await digest(data);
  if(journal!==null&&journal!==archive.sha256)throw Error('A different transfer is pending.');
  if(!journal && same && !rollback)return {complete:true};
  if(!journal && (rollback||current.local.length||current.databases.length))throw Error('The destination already contains household data.');
  if(current.local.some(([k,v])=>local.get(k)!==v))throw Error('Local data changed during transfer.');
  for(const db of current.databases)if(!dbs.has(db.name)||await digest(db)!==await digest(dbs.get(db.name)))throw Error('Database changed during transfer.');
  if(rollback){
   for(const db of current.databases)await request(indexedDB.deleteDatabase(db.name));
   for(const [name] of current.local)localStorage.removeItem(name);
   localStorage.removeItem(journalKey);return {rolledBack:true};
  }
  localStorage.setItem(journalKey,archive.sha256);
  for(const db of data.databases)if(!current.databases.some(d=>d.name===db.name))await createDatabase(db);
  for(const [k,v] of local)if(localStorage.getItem(k)===null)localStorage.setItem(k,v);
  if(await digest(await inventory())!==await digest(data))throw Error('Read-back verification failed. Retain the source and archive.');
  localStorage.removeItem(journalKey);return {complete:true};
 });
}

export async function exportFamilyDevice(){
 if(!/^f-[a-f\d-]{36}\./i.test(location.hostname))throw Error('Open the approved family workshop on this device.');
 const data=await inventory();
 if(data.local.some(([k])=>k.startsWith('family-game-factory-adult:'))||data.databases.some(d=>d.name.startsWith('family-game-factory-adult:')))throw Error('Operator review required for this device.');
 const body={format:'jems.private-family-device-export.v1',origin:location.origin,data};
 return {body,sha256:await digest(body)};
}
