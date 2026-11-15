import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {DockerArtifactGate,sandboxArguments} from '../server/sandbox/docker-gate';
import {hopper,painter} from '../server/testing/generated-fixtures';
import {renderGenerated} from '../server/sandbox/preview.cjs';
async function main(){const image=process.env.FACTORY_TEST_SANDBOX_IMAGE;if(!image){console.log('SKIP gVisor integration: approved local worker image not configured. Unit/browser contracts still run.');return;}
 const gate=new DockerArtifactGate({image,socket:process.env.FACTORY_TEST_DOCKER_SOCKET,timeoutMs:60000,memoryMb:1536,cpus:1});await gate.preflight();
 for(const fixture of [hopper,painter]){const tested=await gate.test(fixture);assert.ok(tested?.compiled?.tests.desktop&&tested.compiled.tests.mobile);await mkdir('test-results',{recursive:true});await writeFile(`test-results/${fixture.title.replaceAll(' ','-')}.html`,renderGenerated(tested,'test-generated','test-channel').html);console.log('PASS gVisor:',fixture.title,'compiled, desktop/mobile input-driven win, replay, parent isolation, no egress');}
 for(const source of ['export function createGame(){while(true){}}','export function createGame(){ fetch("https://example.com"); }'])await assert.rejects(gate.test({...hopper,source}),/PLAYTEST_FAILED|SANDBOX_TIMEOUT/);
 const args=sandboxArguments({image,timeoutMs:60000,memoryMb:1536,cpus:1},'test');assert.ok(args.includes('--runtime=runsc')&&args.includes('--network=none')&&args.includes('--read-only'));console.log('PASS gVisor: hostile infinite module and network API rejected; no generated code executed on gateway');}
void main().catch(e=>{console.error(e);process.exitCode=1});
