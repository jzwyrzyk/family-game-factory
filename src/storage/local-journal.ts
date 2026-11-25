/** Exact-byte, bounded, single-writer undo journal. No remote requests.
 * Common prefix/suffix are stored once; both images reconstruct independently.
 * A pending operation rolls back; a committed operation finishes cleanup.
 */
export const LOCAL_JOURNAL_KEY = 'family-game-factory-local-journal-v1';
export interface JournalStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface Change {key:string;before:string|null;after:string}
interface Packed {key:string;prefix:string;suffix:string;before:string|null;after:string}
interface Intent {version:1;scope:string;phase:'pending'|'committed';changes:Packed[]}
const MAX_UNITS=16_000_000; // Parser safety, never a quota guarantee.
export function packChange(change:Change):Packed {
  const {key,before,after}=change;
  if(before===null)return {key,prefix:'',suffix:'',before:null,after};
  let start=0,end=0;
  while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  while(end<before.length-start&&end<after.length-start&&before[before.length-end-1]===after[after.length-end-1])end++;
  return {key,prefix:before.slice(0,start),suffix:end?before.slice(-end):'',before:before.slice(start,before.length-end),after:after.slice(start,after.length-end)};
}
const unpack=(c:Packed):Change=>({key:c.key,before:c.before===null?null:c.prefix+c.before+c.suffix,after:c.prefix+c.after+c.suffix});
const fail=():never=>{throw Error('Saved work needs recovery. Reload Jems before saving again.');};
const exactKeys=(v:object,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
export function localJournal(storage:JournalStorage,scope:string,keys:readonly string[],guard:()=>void,validate:(changes:Change[])=>void) {
  if(!/^(family|adult:[a-f0-9-]{36})$/i.test(scope))fail();
  function parse(raw:string):{intent:Intent;changes:Change[]} {
    if(raw.length>MAX_UNITS)fail();
    const i=JSON.parse(raw) as Intent;
    if(!i||!exactKeys(i,['version','scope','phase','changes'])||i.version!==1||i.scope!==scope||!['pending','committed'].includes(i.phase)||!Array.isArray(i.changes)||!i.changes.length||i.changes.length>keys.length)fail();
    const seen=new Set<string>();
    for(const c of i.changes){
      if(!c||!exactKeys(c,['key','prefix','suffix','before','after'])||!keys.includes(c.key)||seen.has(c.key)||typeof c.prefix!=='string'||typeof c.suffix!=='string'||typeof c.after!=='string'||c.before!==null&&typeof c.before!=='string'||c.before===null&&(c.prefix!==''||c.suffix!==''))fail();
      seen.add(c.key);
    }
    const changes=i.changes.map(unpack);
    if(changes.some(c=>c.before===c.after||c.after.length>MAX_UNITS||(c.before?.length??0)>MAX_UNITS))fail();
    validate(changes);return {intent:i,changes};
  }
  function check(raw:string,changes:Change[]) {
    guard();if(storage.getItem(LOCAL_JOURNAL_KEY)!==raw)fail();
    if(changes.some(c=>{const value=storage.getItem(c.key);return value!==c.before&&value!==c.after;}))fail();
  }
  function recover():'none'|'rolled-back'|'committed' {
    guard();const raw=storage.getItem(LOCAL_JOURNAL_KEY);if(raw===null)return 'none';
    const {intent,changes}=parse(raw);check(raw,changes);
    // Validate every source before touching any source. Never erase newer bytes.
    for(const c of changes){
      check(raw,changes);const value=intent.phase==='committed'?c.after:c.before;
      if(storage.getItem(c.key)===value)continue;
      if(value===null)storage.removeItem(c.key);else storage.setItem(c.key,value);
      if(storage.getItem(c.key)!==value)fail();
    }
    check(raw,changes);
    storage.removeItem(LOCAL_JOURNAL_KEY);
    if(storage.getItem(LOCAL_JOURNAL_KEY)!==null)fail();
    return intent.phase==='committed'?'committed':'rolled-back';
  }
  function commit(changes:Change[]):void {
    guard();if(storage.getItem(LOCAL_JOURNAL_KEY)!==null)fail();
    if(!changes.length)return;
    const intent:Intent={version:1,scope,phase:'pending',changes:changes.map(packChange)};
    const raw=JSON.stringify(intent);parse(raw);
    if(changes.some(c=>storage.getItem(c.key)!==c.before))fail();
    // Atomic localStorage set: failure here leaves all source keys unchanged.
    storage.setItem(LOCAL_JOURNAL_KEY,raw);check(raw,changes);
    for(const c of changes){check(raw,changes);storage.setItem(c.key,c.after);if(storage.getItem(c.key)!==c.after)fail();}
    check(raw,changes);
    const committed=JSON.stringify({...intent,phase:'committed'});
    storage.setItem(LOCAL_JOURNAL_KEY,committed);check(committed,changes);
    // Once the marker is durable, cleanup failure must not report a failed save.
    try{storage.removeItem(LOCAL_JOURNAL_KEY);}catch{/* Startup clears the committed marker. */}
  }
  return {commit,recover};
}
