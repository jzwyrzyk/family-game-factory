import {createHash} from 'node:crypto';
import {validateGeneratedRecovery,type GeneratedRecoverySnapshot} from './generated-recovery';
import {validateRef,type PrivateArtifacts} from './artifacts';
import {encodeGamePayload} from './game-payload';
/** Call only for an authorized server-retained archive under a durable operation
 * barrier. Integrity validation is not authorization of an uploaded file. Rebuild
 * both retained encodings before current metadata tries to decode missing bytes;
 * never change a reference, overwrite an existing object or recompile a game. */
export async function republishGeneratedRecoveryArtifacts(input:GeneratedRecoverySnapshot,artifacts:PrivateArtifacts):Promise<number>{
 const snapshot=validateGeneratedRecovery(input,input.familyId,input.audience);let writes=0;
 const verified:PrivateArtifacts={get:ref=>artifacts.get(ref),put:async bytes=>{const ref=await artifacts.put(bytes,{verifyStored:true});validateRef(ref);if(ref.sha256!==createHash('sha256').update(bytes).digest('hex')||ref.bytes!==bytes.length)throw Error('RECOVERY_ARTIFACT_WRITE_MISMATCH');writes++;return ref;}};
 for(const revision of snapshot.revisions){if(!revision.game)continue;await verified.put(Buffer.from(JSON.stringify(revision.game)));
  if(revision.game.kind==='generated-module-v1'||revision.game.kind==='generated-module-v2')await encodeGamePayload(revision.game,verified,JSON.stringify([revision.familyId,revision.adultPilotProfileId??null]));
 }
 return writes;
}
