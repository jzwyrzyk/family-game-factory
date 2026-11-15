import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PipelineState,Repository } from './types';
const initial=():PipelineState=>({version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]});
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
/** Single-process reference store. Production must implement the same transaction port with Firestore. */
export class MemoryRepository implements Repository {
 protected data:PipelineState=initial();private tail:Promise<unknown>=Promise.resolve();
 protected async persist(_next:PipelineState){}
 async transaction<T>(update:(state:PipelineState)=>T):Promise<T>{
  const task=this.tail.then(async()=>{const next=copy(this.data),result=update(next);await this.persist(next);this.data=next;return copy(result);});this.tail=task.catch(()=>{});return task;
 }
 async snapshot(){await this.tail;return copy(this.data);}
}
/** Private, atomic durable reference for local testing, NOT a distributed worker database. */
export class FileRepository extends MemoryRepository {
 private constructor(private file:string){super();}
 static async open(file:string){const repo=new FileRepository(file);try{const value=JSON.parse(await readFile(file,'utf8'));if(value.version!==1||!Array.isArray(value.jobs)||!Array.isArray(value.audit))throw Error('Unsupported pipeline store');repo.data=value;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return repo;}
 protected async persist(next:PipelineState){await mkdir(dirname(this.file),{recursive:true,mode:0o700});const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(next),{mode:0o600});await rename(temporary,this.file);}
}
