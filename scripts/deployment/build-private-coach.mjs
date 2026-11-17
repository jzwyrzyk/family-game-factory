/* Compile only the private, keyless coach. Never bundle browser, runner or a model key. */
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('dist-private',{recursive:true});
await build({
 entryPoints:['server/coach/start-private.ts'],platform:'node',target:'node22',format:'esm',
 bundle:true,packages:'bundle',minify:false,sourcemap:false,
 outfile:'dist-private/coach-server.mjs',
 logLevel:'warning',
 banner:{js:'// IAM-only coach inference service. No model API key is embedded.'}
});
console.log('Private coach server bundle compiled without any cloud activation.');
