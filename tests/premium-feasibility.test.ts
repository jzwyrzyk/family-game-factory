import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
test('offline staged accounting survives races, cancellation, unknown calls, restart and deterministic joins',()=>{
 execFileSync('python3',['tools/premium-admission-prototype-test.py'],{stdio:'pipe'});
});
