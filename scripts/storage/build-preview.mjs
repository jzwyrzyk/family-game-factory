import {spawnSync} from 'node:child_process';
// The alternate authority is selected at build time, never by a saved marker or
// query parameter in an ordinary release. This local build makes no deployment.
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','storage-preview','--outDir','test-results/storage-preview'],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
