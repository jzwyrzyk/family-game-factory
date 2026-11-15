import {FixtureOnlyGate} from '../server/testing/fixture-gate';
import {hopper,painter} from '../server/testing/generated-fixtures';
async function main(){for(const fixture of [hopper,painter]){const tested=await new FixtureOnlyGate().test(fixture);console.log('PASS audited fixture browser gate:',fixture.title,tested.compiled?.tests);}}
void main().catch(e=>{console.error(e);process.exitCode=1});
