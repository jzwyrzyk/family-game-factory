import {databaseFor} from '../../server/storage/database';
import {readFile} from 'node:fs/promises';
import {bindHousehold} from '../../server/beta/household';
import {firestoreStore} from '../../server/beta/documents';
import {GcsPrivateArtifacts} from '../../server/storage/artifacts';

async function run(){
 const [mode,file,confirmation,...extra]=process.argv.slice(2);
 if(!['--check','--apply'].includes(mode)||!file||extra.length)throw Error('Supply --check or --apply and the reviewed private mapping file.');
 const cfg=JSON.parse(await readFile(file,'utf8')),b=cfg.binding;
 if(typeof cfg.projectId!=='string'||typeof cfg.artifactBucket!=='string'||!cfg.projectId||!cfg.artifactBucket||!b)throw Error('A reviewed project, bucket and existing household mapping are required.');
 if(mode==='--apply'&&(!/^[a-f0-9]{64}$/.test(cfg.testedBackupDigest)||confirmation!=='bind-'+b.workspace))throw Error('A verified backup fingerprint and explicit household confirmation are required.');
 const result=await bindHousehold(firestoreStore(databaseFor(cfg)),b,mode==='--apply',new GcsPrivateArtifacts(cfg.artifactBucket,b.workspace));
 console.log(JSON.stringify(result));
}
run().catch(()=>{console.error('Household binding incomplete. Check the mapping, backup and pending reservations.');process.exitCode=1;});
