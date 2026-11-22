/** Small, bounded metadata responses. Never buffer a token/error body first
 * and check its size afterward; raw credentials and transport errors stay private. */
export async function readMetadataText(response:Response,maxBytes:number,signal:AbortSignal,
 failure:'COACH_UNAVAILABLE'|'AUDIO_PROVIDER_FAILED'):Promise<string>{
 const fail=()=>Error(failure);
 const cancelBody=()=>{void response.body?.cancel().catch(()=>{});};
 const length=response.headers.get('content-length');
 if(!response.ok||!response.body||signal.aborted||length!==null&&
   (!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maxBytes)){
  cancelBody();throw fail();
 }
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let count=0,text='',rejectAbort!:(reason:Error)=>void;
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const cancel=()=>{rejectAbort(fail());void reader.cancel().catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  if(signal.aborted)cancel();
  while(true){
   const {done,value}=await Promise.race([reader.read(),aborted]);
   if(signal.aborted)throw fail();
   if(done)break;
   count+=value.byteLength;if(count>maxBytes)throw fail();
   text+=decoder.decode(value,{stream:true});
  }
  return text+decoder.decode();
 }catch{throw fail();}
 finally{
  signal.removeEventListener('abort',cancel);
  // Do not let a stalled stream cancellation prolong an aborted token read.
  void reader.cancel().catch(()=>{});
  try{reader.releaseLock();}catch{/* Cancellation owns any remaining read. */}
 }
}
