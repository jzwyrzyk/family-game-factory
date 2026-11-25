import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const jar=process.argv[2];
if(!jar||createHash('sha256').update(await readFile(jar)).digest('hex')!=='9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d')throw Error('Reviewed local Firestore emulator binary required.');
const host='127.0.0.1:18981',proc=spawn('java',['-XX:ActiveProcessorCount=2','-jar',jar,'--host','127.0.0.1','--port','18981','--project_id','demo-jems-private-family'],{stdio:'ignore'});
const completion=new Promise(resolve=>proc.once('exit',resolve));
try{
 let ready=false;for(let i=0;i<100;i++){if(proc.exitCode!==null)break;try{ready=(await fetch('http://'+host)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,150));}
 if(!ready)throw Error('Local Firestore emulator did not start.');
 const run=spawn(process.execPath,['--import','tsx','tests/beta-firestore.integration.ts'],{stdio:'inherit',env:{...process.env,FIRESTORE_EMULATOR_HOST:host,GOOGLE_CLOUD_PROJECT:'demo-jems-private-family'}});
 const status=await new Promise(resolve=>run.once('exit',resolve));if(status!==0)throw Error('Firestore integration failed.');
}finally{proc.kill('SIGTERM');await completion;}
