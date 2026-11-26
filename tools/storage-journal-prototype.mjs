// Offline F06 experiment. Never import into production until startup, scope,
// schema/ownership validation, quota, backup and rollback integration are reviewed.
// Caller must hold the existing origin-wide writer lock and pin the namespace.
// The port must model atomic individual writes; this is NOT a multi-key ACID claim.
// Values are synthetic in this experiment. Do not export journal contents.
export const KEYS=Object.freeze(["family-game-factory-workspace-v2","family-game-factory-studio-v1"]);
export const JOURNAL="family-game-factory-f06-prototype-journal-v1";
export const MAX_CODE_UNITS=2000000;
export function createProjectJournal(port, scope, assertExclusive) {
  const fail=(code)=>{throw new Error(code);};
  if(typeof scope!=="string" || !/^(family|adult:[a-f0-9-]{36})$/i.test(scope) || typeof assertExclusive!=="function") fail("JOURNAL_SCOPE_REQUIRED");
  const guard=()=>{assertExclusive(scope);};
  const validValue=(value)=>value===null||typeof value==="string";
  const parse=(raw)=>{
    if(typeof raw!=="string"||raw.length>MAX_CODE_UNITS) fail("JOURNAL_INVALID");
    let record;
    try{record=JSON.parse(raw);}catch{fail("JOURNAL_INVALID");}
    if(!record||record.version!==1||record.scope!==scope||!Array.isArray(record.changes)||record.changes.length<1||record.changes.length>KEYS.length) fail("JOURNAL_INVALID");
    const seen=new Set();
    for(const c of record.changes){
      if(!c||!KEYS.includes(c.key)||seen.has(c.key)||!validValue(c.before)||typeof c.after!=="string"||c.before===c.after) fail("JOURNAL_INVALID");
      seen.add(c.key);
    }
    return record.changes;
  };
  const exactJournal=(raw)=>{guard();if(port.getItem(JOURNAL)!==raw)fail("JOURNAL_CHANGED");};
  const compatible=(changes)=>{for(const c of changes){const current=port.getItem(c.key);if(current!==c.before&&current!==c.after)fail("JOURNAL_CONFLICT");}};
  const recover=()=>{
    guard();
    const raw=port.getItem(JOURNAL);
    if(raw===null)return "none";
    const changes=parse(raw);
    exactJournal(raw);compatible(changes);
    for(const c of changes){
      exactJournal(raw);compatible(changes);
      if(port.getItem(c.key)===c.before)port.setItem(c.key,c.after);
      if(port.getItem(c.key)!==c.after)fail("JOURNAL_WRITE_UNVERIFIED");
    }
    exactJournal(raw);
    if(changes.some(c=>port.getItem(c.key)!==c.after))fail("JOURNAL_WRITE_UNVERIFIED");
    port.removeItem(JOURNAL);
    if(port.getItem(JOURNAL)!==null)fail("JOURNAL_CLEANUP_UNVERIFIED");
    return "committed";
  };
  const commit=(changes)=>{
    guard();
    if(port.getItem(JOURNAL)!==null)fail("JOURNAL_RECOVERY_REQUIRED");
    const raw=JSON.stringify({version:1,scope,changes});
    const checked=parse(raw);
    if(checked.some(c=>port.getItem(c.key)!==c.before))fail("JOURNAL_CONFLICT");
    // Never write either target until a complete intent is readable.
    guard();port.setItem(JOURNAL,raw);
    exactJournal(raw);
    return recover();
  };
  return {commit,recover};
}
