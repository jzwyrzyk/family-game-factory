import {FieldPath,type Firestore} from '@google-cloud/firestore';

export interface Documents {
 get<T>(path:string):Promise<T|undefined>;
 page<T>(collection:string,after:string,limit:number):Promise<{id:string;value:T}[]>;
 set<T>(path:string,value:T):void;
 create<T>(path:string,value:T):void;
 delete(path:string):void;
}
export interface AtomicStore {
 run<T>(operation:(tx:Documents)=>Promise<T>,readOnly?:boolean):Promise<T>;
}
export function firestoreStore(db:Firestore):AtomicStore {
 return {run:(operation,readOnly=false)=>db.runTransaction(async native=>operation({
  async get<T>(path:string){const doc=await native.get(db.doc(path));return doc.exists?doc.data() as T:undefined;},
  async page<T>(path:string,after:string,limit:number){
   let query=db.collection(path).orderBy(FieldPath.documentId()).limit(limit);if(after)query=query.startAfter(after);
   return (await native.get(query)).docs.map(doc=>({id:doc.id,value:doc.data() as T}));
  },
  set:(path,value)=>{native.set(db.doc(path),value as FirebaseFirestore.DocumentData);},
  create:(path,value)=>{native.create(db.doc(path),value as FirebaseFirestore.DocumentData);},
  delete:path=>{native.delete(db.doc(path));}
 }),readOnly?{readOnly:true}:undefined)};
}

/** Serializable, isolated synthetic store. Never selected by a deployed gateway. */
export class FixtureDocuments implements AtomicStore {
 private records=new Map<string,unknown>();
 private tail:Promise<unknown>=Promise.resolve();
 run<T>(operation:(tx:Documents)=>Promise<T>):Promise<T>{
  const result=this.tail.then(async()=>{
   const pending=new Map(this.records);
   const value=await operation({
    get:async<T>(key:string)=>structuredClone(pending.get(key)) as T|undefined,
    page:async<T>(path:string,after:string,limit:number)=>[...pending.keys()].filter(k=>k.startsWith(path+'/')).map(k=>k.slice(path.length+1)).filter(id=>!id.includes('/')&&id>after).sort().slice(0,limit).map(id=>({id,value:structuredClone(pending.get(path+'/'+id)) as T})),
    set:(key,data)=>{pending.set(key,structuredClone(data));},
    create:(key,data)=>{if(pending.has(key))throw Error('ALREADY_EXISTS');pending.set(key,structuredClone(data));},
    delete:key=>{pending.delete(key);}
   });
   this.records=pending;
   return structuredClone(value);
  });
  this.tail=result.catch(()=>{});
  return result;
 }
}
