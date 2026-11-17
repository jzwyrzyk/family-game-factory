import type {Firestore} from '@google-cloud/firestore';
import type {SafetyPolicyReader} from './guard';
/** Separate IAM-only document, never read directly by a browser or generated game. */
export class FirestoreSafetyPolicyReader implements SafetyPolicyReader {
  constructor(private readonly db:Pick<Firestore,'doc'>,private readonly workspace:string){
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(workspace)||['__proto__','constructor','prototype'].includes(workspace))throw Error('WORKSPACE_REQUIRED');
  }
  async read():Promise<unknown>{
    const snapshot=await this.db.doc('factorySafetyPolicies/'+this.workspace).get();
    return snapshot.exists?snapshot.data():null;
  }
}
