interface JsonBodyOptions {
 limitError?:string;
 invalidJsonError?:string;
 emptyObject?:boolean;
}

/** Bound wire bytes before decoding; a UTF-8 character may span request chunks.
 * The returned JSON still needs the endpoint's existing schema validation. */
export async function readJsonBody(request:AsyncIterable<Uint8Array|string>,maxBytes:number,
 {limitError='INVALID_REQUEST',invalidJsonError,emptyObject=false}:JsonBodyOptions={}){
 const chunks:Buffer[]=[];
 let bytes=0;
 for await(const chunk of request){
  const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
  bytes+=buffer.byteLength;
  if(bytes>maxBytes)throw Error(limitError);
  chunks.push(buffer);
 }
 const text=Buffer.concat(chunks,bytes).toString('utf8');
 try{return JSON.parse(text||(emptyObject?'{}':''));}
 catch(error){if(invalidJsonError)throw Error(invalidJsonError);throw error;}
}
