import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {collectQualityEvidence,captureSession,safeActions} from '../server/sandbox/quality-capture.cjs';
import {validateQualityEvidence,qualityArtifactHash,type GameQualityEvidence} from '../server/quality/game-quality';
import {pixelGame,illustratedGame,compileArtFixture} from './generated-art-fixtures';
import type {GeneratedGame} from '../server/agent/generated';

/** Authored renderer fixtures, no provider calls. This verifies honest capture
 * and binding, not an automated visual-quality pass or children's enjoyment. */
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  mkdirSync('test-results/quality-capture',{recursive:true});
  for(const [name,base]of [['pixel',pixelGame()],['illustrated',illustratedGame()]] as const){
   const game=compileArtFixture({...base,playthrough:[
    {type:'hold',control:'right',frames:100},{type:'hold',control:'left',frames:45},
    {type:'hold',control:'right',frames:90},{type:'wait',frames:180},{type:'hold',control:'left',frames:60}
   ]});
   const evidence:GameQualityEvidence=await collectQualityEvidence(browser,game);
   assert.equal(evidence.motion,'normal');assert.equal(evidence.artifactHash,qualityArtifactHash(game));
   assert.equal(evidence.sessions.length,2);assert.ok(evidence.sessions.every(session=>session.simulatedTicks>=600&&session.actionTrace.length>=3));
   assert.equal(evidence.sessions.find(session=>session.device==='tablet')!.touch,true);
   assert.ok(evidence.sessions.every(session=>session.actionTrace.some(trace=>trace.beforeHash!==trace.afterHash)));
   for(const capture of evidence.captures)writeFileSync(`test-results/quality-capture/${name}-${capture.id}.png`,Buffer.from(capture.data,'base64'));
   writeFileSync(`test-results/quality-capture/${name}-receipts.json`,JSON.stringify({...evidence,captures:evidence.captures.map(({data,...metadata})=>metadata)},null,2));
   assert.throws(()=>validateQualityEvidence({...game,title:game.title+' changed'},evidence),/BINDING/);
   assert.throws(()=>validateQualityEvidence(game,{...evidence,motion:'reduced'}),/BINDING/);
   const bad=JSON.parse(JSON.stringify(evidence));bad.captures[0].sha256='0'.repeat(64);
   assert.throws(()=>validateQualityEvidence(game,bad),/IMAGE_MISMATCH/);
   console.log(`PASS ${name}: real desktop/touch play, normal-motion screenshots, source/asset/evidence binding, pause/replay.`);
  }
  const invalid={...pixelGame(),playthrough:[{type:'hold',control:'network',frames:60}]} as unknown as GeneratedGame;
  assert.throws(()=>safeActions(invalid),/CONTROL_MISSING/);
  const failing=compileArtFixture({...pixelGame(),source:`export function createGame(api){return {init:()=>({}),step(){throw new Error('PRIVATE_FIXTURE_MARKER');},draw:()=>[{type:'rect',x:0,y:0,width:720,height:400,color:'#fff'}],outcome:()=>({status:'playing',score:0})};}`});
  await assert.rejects(captureSession(browser,failing,'desktop'),error=>{
   const failure=error as Error&{diagnostics?:Record<string,unknown>};
   assert.equal(failure.message,'QUALITY_CAPTURE_RUNTIME_FAILED','runtime failures never receive quality evidence');
   assert.ok(failure.diagnostics);assert.equal(failure.diagnostics.device,'desktop');
   assert.equal(typeof failure.diagnostics.lastTick,'number');assert.equal(typeof failure.diagnostics.pageCrashed,'boolean');
   assert.equal(JSON.stringify(failure).includes('PRIVATE_FIXTURE_MARKER'),false,'diagnostics do not expose generated exception text');
   return true;
  });
  assert.equal(browser.contexts().length,0,'both successful and failed captures close their browser contexts');
  console.log('PASS capture failure diagnostics: fail closed, safe metadata only, browser contexts cleaned up.');
 }finally{await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
