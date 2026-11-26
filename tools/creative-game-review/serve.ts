// Run from the repository root with node --import tsx tools/creative-game-review/serve.ts.
import {build, transformSync} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {illustratedGame} from '../../tests/generated-art-fixtures';
import {runtimeBundle} from '../../server/sandbox/bundle-v2.cjs';
import {validateSource} from '../../server/sandbox/source-validator.cjs';
import {GAME_SOURCE} from './contract';

export async function startReview(port=0) {
  const game = illustratedGame();
  if (createHash('sha256').update(game.source).digest('hex') !== GAME_SOURCE) throw Error('Review the changed fixture before binding artwork.');
  validateSource(game);
  const runtime = runtimeBundle('quality-runtime-v2.1.0');
  const code = transformSync(game.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
  // Match renderGeneratedV2's sibling closures and the exact archived worker.
  const worker = '"use strict";(function(){'+runtime.worker+'\nreturn FactoryRuntime.run;})()(function(api){'+code+'\nreturn GameModule.createGame(api);},["workshop","helper"]);';
  const folder = 'tools/creative-game-review/';
  const [relay,host,html,workshop] = await Promise.all([
    build({entryPoints:[folder+'relay.ts'],bundle:true,write:false,define:{REVIEW_WORKER:JSON.stringify(worker)}}),
    build({entryPoints:[folder+'host.ts'],bundle:true,write:false,outfile:'review.js',define:{'import.meta.env':'{}'}}),
    readFile(folder+'index.html'), readFile('public/gem-factory-workshop.webp'),
  ]);
  if (createHash('sha256').update(workshop).digest('hex') !== 'b6e81f59ab4d1e05475b85817264645ecda30ed105eb7934fcc69b956f065afe')
    throw Error('Review the changed workshop before binding artwork.');
  const script = relay.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const hash = createHash('sha256').update(script).digest('base64');
  const framePolicy = "default-src 'none'; script-src 'sha256-"+hash+"'; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
  const hostPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const files = new Map<string,[string,Uint8Array|string]>([
    ['/', ['text/html',html]], ['/frame',['text/html','<!doctype html><meta charset="utf-8"><script>'+script+'</script>']],
    ['/workshop.webp',['image/webp',workshop]],
  ]);
  for (const file of host.outputFiles) files.set(file.path.endsWith('.css')?'/review.css':'/review.js',[file.path.endsWith('.css')?'text/css':'text/javascript',file.contents]);
  const server = createServer((req,res) => {
    const file = files.get(req.url || '');
    if (req.method !== 'GET' || !file) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':file[0],'Content-Security-Policy':req.url === '/frame' ? framePolicy : hostPolicy,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(file[1]);
  });
  server.listen(port,'127.0.0.1'); await once(server,'listening');
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startReview(4199).then(()=>console.log('Local synthetic review at http://127.0.0.1:4199'));
}
