import {selectedCreativeImage} from '../assets/creative-library';
import {drawing, drawingHash, inspectDrawingBytes} from '../assets/private-drawings';
import {validateGameArt, type ArtTest, type GameArtPlan} from './bindings';

export interface ReviewScope {origin:string;owner:string; game:string; version:string}
interface ActiveReview {owner:string; game:string; plan:GameArtPlan}
/** Trusted host initiates one launch. There is no lookup or enumeration API in the frame.
 * The active callback belongs to the host and becomes null on loss of authorization. */
export async function resolveArtTest(scope: ReviewScope, active: () => ActiveReview | null) {
  function selected(): ArtTest {
    const session = active();
    if (location.origin!==scope.origin || !session || session.owner !== scope.owner || session.game !== scope.game)
      throw Error('Reopen this art test in its own game.');
    validateGameArt(session.plan);
    const test = session.plan.tests.find(t => t.id === scope.version);
    if (!test) throw Error('This art test is no longer available.');
    return test;
  }
  const test = structuredClone(selected());
  let revoked=false;
  const assertCurrent = () => {
    if(revoked)throw Error('Reopen this art test in its own game.');
    try {
      if(JSON.stringify(selected())!==JSON.stringify(test))throw Error('The selected art version changed.');
    } catch(error) {
      revoked=true;
      throw error;
    }
  };
  const assets = [];
  for (const pin of test.pins) {
    assertCurrent();
    const item = await drawing(scope.owner,pin.drawingId).catch(() => null);
    if (!item || item.id !== pin.drawingId || item.sha256 !== pin.sha256 || await drawingHash(item.bytes) !== pin.sha256)
      throw Error('A picture is missing. Restore its original in My Art, or choose a new picture for another test.');
    const choice=await selectedCreativeImage(scope.owner,pin.drawingId);
    if(choice.logicalId!==pin.logicalId || choice.originalSha256!==pin.originalSha256 || choice.sha256!==pin.sha256)
      throw Error('Restore the original version of this drawing in My Art.');
    const size = inspectDrawingBytes(item.bytes,item.mime);
    assertCurrent();
    assets.push({id:'slot_'+pin.role, mime:item.mime, bytes:item.bytes, ...size});
  }
  assertCurrent();
  return {assets,program:test.program,assertCurrent};
}
