import { KEYS, JOURNAL, MAX_CODE_UNITS, createProjectJournal } from './storage-journal-prototype.mjs';
function runTests(){
  const results=[];
  const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error("assertion failed: "+JSON.stringify([a,b]));};
  const throws=(fn,code)=>{let actual;try{fn();}catch(e){actual=e.message;}eq(actual,code);};
  const check=(name,fn)=>{fn();results.push(name);};
  const setup=()=>{
    const values=new Map([[KEYS[0],"old-work"],[KEYS[1],"old-notebook"]]);
    let allowed=true,step=0,crashAt=0,after=false;
    const mutate=(fn)=>{step++;if(step===crashAt&&!after)throw Error("crash");fn();if(step===crashAt&&after)throw Error("crash");};
    const port={getItem:k=>values.get(k)??null,setItem:(k,v)=>mutate(()=>values.set(k,v)),removeItem:k=>mutate(()=>values.delete(k))};
    const guard=()=>{if(!allowed)throw Error("LOCK_LOST");};
    const make=(scope="family")=>createProjectJournal(port,scope,guard);
    const changes=[{key:KEYS[0],before:"old-work",after:"new-work"},{key:KEYS[1],before:"old-notebook",after:"new-notebook"}];
    const state=()=>KEYS.map(k=>port.getItem(k));
    return {values,port,make,changes,state,block:()=>{allowed=false;},fault:(at,writeThenThrow=false)=>{step=0;crashAt=at;after=writeThenThrow;}};
  };
  check("no pending intent",()=>{const s=setup();eq(s.make().recover(),"none");eq(s.state(),["old-work","old-notebook"]);});
  check("successful commit",()=>{const s=setup();eq(s.make().commit(s.changes),"committed");eq(s.state(),["new-work","new-notebook"]);eq(s.values.has(JOURNAL),false);});
  for(const at of [1,2,3,4])for(const after of [false,true]){
    check(`restart at mutation ${at} ${after?"after":"before"}`,()=>{
      const s=setup();s.fault(at,after);throws(()=>s.make().commit(s.changes),"crash");s.fault(0);
      const outcome=s.make().recover();
      if(at===1&&!after){eq(outcome,"none");eq(s.state(),["old-work","old-notebook"]);}
      else {eq(outcome,at===4&&after?"none":"committed");eq(s.state(),["new-work","new-notebook"]);}
      eq(s.values.has(JOURNAL),false);eq(s.make().recover(),"none");
    });
  }
  check("stale precondition preserves both stores",()=>{const s=setup();s.values.set(KEYS[1],"newer");throws(()=>s.make().commit(s.changes),"JOURNAL_CONFLICT");eq(s.state(),["old-work","newer"]);eq(s.values.has(JOURNAL),false);});
  check("unknown newer value refuses recovery before any write",()=>{const s=setup();s.fault(2);throws(()=>s.make().commit(s.changes),"crash");s.fault(0);s.values.set(KEYS[1],"foreign");throws(()=>s.make().recover(),"JOURNAL_CONFLICT");eq(s.state(),["old-work","foreign"]);eq(s.values.has(JOURNAL),true);});
  check("pending operation cannot be replaced",()=>{const s=setup();s.fault(3);throws(()=>s.make().commit(s.changes),"crash");s.fault(0);const raw=s.values.get(JOURNAL);throws(()=>s.make().commit(s.changes),"JOURNAL_RECOVERY_REQUIRED");eq(s.values.get(JOURNAL),raw);});
  check("malformed journal left intact",()=>{const s=setup();s.values.set(JOURNAL,"{broken");throws(()=>s.make().recover(),"JOURNAL_INVALID");eq(s.values.get(JOURNAL),"{broken");eq(s.state(),["old-work","old-notebook"]);});
  check("cross-scope journal denied",()=>{const s=setup();s.fault(2);throws(()=>s.make().commit(s.changes),"crash");s.fault(0);throws(()=>s.make("adult:12345678-1234-1234-1234-123456789abc").recover(),"JOURNAL_INVALID");eq(s.state(),["old-work","old-notebook"]);});
  check("exclusive writer guard mandatory",()=>{const s=setup();s.block();throws(()=>s.make().commit(s.changes),"LOCK_LOST");throws(()=>s.make().recover(),"LOCK_LOST");eq(s.values.has(JOURNAL),false);});
  check("unexpected key and duplicate key rejected",()=>{const s=setup();throws(()=>s.make().commit([{key:"other",before:null,after:"x"}]),"JOURNAL_INVALID");throws(()=>s.make().commit([s.changes[0],s.changes[0]]),"JOURNAL_INVALID");eq(s.state(),["old-work","old-notebook"]);});
  check("null preimage creation",()=>{const s=setup();s.values.delete(KEYS[0]);eq(s.make().commit([{key:KEYS[0],before:null,after:"created"}]),"committed");eq(s.state(),["created","old-notebook"]);});
  check("oversize intent refused before target writes",()=>{const s=setup();throws(()=>s.make().commit([{key:KEYS[0],before:"old-work",after:"x".repeat(MAX_CODE_UNITS)}]),"JOURNAL_INVALID");eq(s.state(),["old-work","old-notebook"]);eq(s.values.has(JOURNAL),false);});
  return results;
}
const results=runTests();
for(const name of results)console.log('PASS',name);
console.log(results.length+' synthetic journal tests passed');
