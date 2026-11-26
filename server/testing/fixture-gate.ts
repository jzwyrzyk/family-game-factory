import {chromium} from 'playwright';
/** Tests ONLY. It rejects every source except the audited hand-authored fixtures; never used by the gateway or Actions CLI. */
import {spawn} from 'node:child_process';
import {hopper,painter} from './generated-fixtures';
import {v2FirstGame,v2RevisedGame} from './v2-journey-fixtures';
import {hash,validateCompiled,type GeneratedGame} from '../agent/generated';
const allowed=new Set([hopper.source,hopper.source.replace('s.hops>=3','s.hops>=4'),painter.source,v2FirstGame.source,v2RevisedGame.source,'export function createGame(){ invalid syntax ! }'].map(hash));
export class FixtureOnlyGate {
 constructor(private browserPath?:string){}
 async test(game:GeneratedGame):Promise<GeneratedGame>{if(!allowed.has(hash(game.source)))throw Error('TEST_FIXTURE_SOURCE_REQUIRED');
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['server/sandbox/worker.cjs'],{env:{PATH:process.env.PATH,HOME:'/tmp',WORKER_BROWSER_PATH:this.browserPath||process.env.CHROMIUM_PATH||(process.env.CI?chromium.executablePath():'/usr/bin/chromium')},stdio:['pipe','pipe','pipe']});let output='';const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('FIXTURE_TIMEOUT'));},30000);child.stdout.on('data',c=>{output+=c});child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',()=>{clearTimeout(timeout);try{const report=JSON.parse(output);if(!report.ok)throw Error(report.diagnostics);resolve(validateCompiled(game,report.game));}catch(e){reject(e);}});child.stdin.end(JSON.stringify({...game,compiled:undefined}));});
 }
}
