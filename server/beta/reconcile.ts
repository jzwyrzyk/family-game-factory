/** Bounded independent family reconciliation. A slow family does not serialize
 * every other family, and all failures remain visible to the scheduler. */
export async function reconcileFamilies(ids:readonly string[],work:(id:string)=>Promise<void>,concurrency=4){
 if(ids.length>40||new Set(ids).size!==ids.length||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('BETA_CAPACITY');
 let next=0;const failures:string[]=[];
 await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},async()=>{
  while(next<ids.length){const id=ids[next++];try{await work(id);}catch{failures.push(id);}}
 }));
 if(failures.length)throw Error('RECONCILIATION_INCOMPLETE');
}
