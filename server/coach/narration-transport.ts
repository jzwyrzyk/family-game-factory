/** Bounded UTF-8 readers for the small narration protocol. No unbounded body buffering. */
import type {IncomingMessage} from 'node:http';
export async function readNarrationRequest(req:IncomingMessage,maxBytes:number):Promise<unknown> {
 const declared=Number(req.headers['content-length']);
 if(req.headers['content-length']!==undefined&&(!Number.isSafeInteger(declared)||declared<1||declared>maxBytes))throw Error('INVALID_NARRATION');
 const chunks:Buffer[]=[];let count=0;
 const timer=setTimeout(()=>{req.destroy();},5000);
 try {
  for await(const data of req){const part=Buffer.from(data);count+=part.length;if(count>maxBytes)throw Error('INVALID_NARRATION');chunks.push(part);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 }catch{throw Error('INVALID_NARRATION');}finally{clearTimeout(timer);}
}
export async function readNarrationResponse(response:Response,maxBytes:number,signal:AbortSignal):Promise<Uint8Array> {
 if(Number(response.headers.get('content-length')||0)>maxBytes||!response.body||signal.aborted){
  void response.body?.cancel().catch(()=>{});throw Error('NARRATION_UNAVAILABLE');
 }
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let count=0;
 let rejectAbort!:(error:Error)=>void;
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const abort=()=>{rejectAbort(Error('NARRATION_UNAVAILABLE'));void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try {
  if(signal.aborted)abort();
  while(true){signal.throwIfAborted();const {done,value}=await Promise.race([reader.read(),aborted]);if(done)break;count+=value.length;if(count>maxBytes)throw Error('NARRATION_UNAVAILABLE');parts.push(value);}
  signal.throwIfAborted();const result=new Uint8Array(count);let offset=0;
  for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Cancellation owns any pending read. */}}
}
export async function readNarrationJson(response:Response,maxBytes:number,signal:AbortSignal):Promise<any> {
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readNarrationResponse(response,maxBytes,signal)));
}
