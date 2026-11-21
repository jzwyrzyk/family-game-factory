import {EventEmitter} from 'node:events';
import type {IncomingHttpHeaders,IncomingMessage,ServerResponse} from 'node:http';

export class ResponseRecorder extends EventEmitter {
 statusCode=0;
 headersSent=false;
 writableEnded=false;
 destroyed=false;
 body='';
 headers:Record<string,string|number|readonly string[]>={};
 setHeader(name:string,value:string|number|readonly string[]){this.headers[name.toLowerCase()]=value;return this;}
 writeHead(status:number,headers:Record<string,string|number|readonly string[]>={}){
  this.statusCode=status;this.headersSent=true;
  for(const [name,value] of Object.entries(headers))this.setHeader(name,value);
  return this;
 }
 end(body=''){this.body+=body;this.writableEnded=true;return this;}
 disconnect(){this.destroyed=true;this.emit('close');}
 response(){return this as unknown as ServerResponse;}
 json(){return JSON.parse(this.body);}
}

export function streamedRequest(path:string,body:AsyncIterable<Uint8Array>,headers:IncomingHttpHeaders={},method='POST'){
 return {url:path,method,headers,[Symbol.asyncIterator]:()=>body[Symbol.asyncIterator]()} as IncomingMessage;
}

/** Yield exact chunks, independently of Node's readable-stream coalescing. */
export async function* chunks(...parts:Uint8Array[]){for(const part of parts)yield part;}

export function deferred<T=void>(){
 let resolve!:(value:T|PromiseLike<T>)=>void,reject!:(reason?:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

export function delayedBody(){
 const started=deferred(),content=deferred<Uint8Array>();
 return {started:started.promise,resolve:content.resolve,reject:content.reject,
  stream:(async function*(){started.resolve();yield await content.promise;})()};
}
