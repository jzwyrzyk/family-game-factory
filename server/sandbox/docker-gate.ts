import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isGeneratedGame,validateCompiled,type GeneratedGame } from '../agent/generated';
import type { PlayableGame } from '../pipeline/types';
export interface SandboxOptions {image:string;socket?:string;timeoutMs:number;memoryMb:number;cpus:number}
export function sandboxArguments(config:SandboxOptions,name:string){
 if(!/^(?:sha256:[a-f0-9]{64}|[\w./:-]+@sha256:[a-f0-9]{64})$/.test(config.image)||config.timeoutMs<1000||config.timeoutMs>60000||config.memoryMb<512||config.memoryMb>4096||config.cpus<.5||config.cpus>2)throw Error('INVALID_SANDBOX_CONFIGURATION');
 return ['--host='+ (config.socket||'unix:///var/run/docker.sock'),'run','--name',name,'--rm','--pull=never','--runtime=runsc','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory='+config.memoryMb+'m','--memory-swap='+config.memoryMb+'m','--cpus='+config.cpus,'--user=1000:1000','--tmpfs=/tmp:rw,nosuid,nodev,size=256m','--shm-size=128m','--env=HTTP_PROXY=','--env=HTTPS_PROXY=','--env=ALL_PROXY=','--env=NO_PROXY=','--env=http_proxy=','--env=https_proxy=','--env=all_proxy=','--env=no_proxy=','--env=HOME=/tmp','-i',config.image];
}
export class DockerArtifactGate {
 constructor(private config:SandboxOptions){}
 async preflight(){await this.execute(['--host='+(this.config.socket||'unix:///var/run/docker.sock'),'image','inspect',this.config.image,'--format={{.Id}}'],undefined,10000);const runtimes=await this.execute(['--host='+(this.config.socket||'unix:///var/run/docker.sock'),'info','--format={{json .Runtimes}}'],undefined,10000);if(!Object.hasOwn(JSON.parse(runtimes),'runsc'))throw Error('GVISOR_REQUIRED');}
 private execute(args:string[],input:string|undefined,timeout:number,signal?:AbortSignal):Promise<string>{
  return new Promise((resolve,reject)=>{const env={PATH:process.env.PATH,HOME:process.env.HOME};const child=spawn('docker',args,{env,stdio:['pipe','pipe','pipe']});let output='',error='',settled=false;const end=(err?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(err)reject(err);else resolve(output);};const abort=()=>{child.kill('SIGKILL');end(Error('SANDBOX_CANCELLED'));};const timer=setTimeout(()=>{child.kill('SIGKILL');end(Error('SANDBOX_TIMEOUT'));},timeout);
   child.stdout.on('data',c=>{output+=c;if(Buffer.byteLength(output)>250000){child.kill('SIGKILL');end(Error('SANDBOX_OUTPUT_LIMIT'));}});child.stderr.on('data',c=>{error=(error+c).slice(0,1500);});child.on('error',()=>end(Error('SANDBOX_UNAVAILABLE')));child.on('close',code=>end(code===0?undefined:Error('SANDBOX_EXIT_FAILED:'+error.replace(/https?:\/\/\S+/g,'[url]'))));signal?.addEventListener('abort',abort,{once:true});child.stdin.on('error',()=>{});if(signal?.aborted)abort();else child.stdin.end(input);
  });
 }
 async test(game:PlayableGame,context?:{signal?:AbortSignal}):Promise<GeneratedGame|void>{
  if(!isGeneratedGame(game))throw Error('DECLARATIVE_GATE_REQUIRED');const name='factory-test-'+randomUUID();
  try{const raw=await this.execute(sandboxArguments(this.config,name),JSON.stringify({...game,compiled:undefined}),this.config.timeoutMs,context?.signal);const result=JSON.parse(raw);if(!result.ok)throw Error('PLAYTEST_FAILED:'+String(result.diagnostics).slice(0,1500));return validateCompiled(game,result.game);}finally{await this.execute(['--host='+(this.config.socket||'unix:///var/run/docker.sock'),'rm','-f',name],undefined,5000).catch(()=>{});}
 }
}
