import {lstat, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build, createServer, type Plugin} from 'vite';
import {offlineBuild} from '../../tools/offline-build';
import {addPreviewBanner, DISCONNECTED_CONFIG, PREVIEW_MANIFEST, previewHeaders, previewPolicyMeta, previewPort, previewSource, verifyPreviewArtifact, writePreviewManifest, type PreviewSource} from './preview-contract';

interface PreviewOptions {root?: string; port?: number; out?: string; pr?: number; runId?: string; expectedSha?: string; requireClean?: boolean}

function checkSource(source: PreviewSource, options: PreviewOptions): void {
  if (options.expectedSha !== undefined && source.sha !== options.expectedSha) throw Error('PREVIEW_PROVENANCE_MISMATCH');
  if (options.requireClean && source.dirty) throw Error('PREVIEW_DIRTY_SOURCE_REJECTED');
}

export async function previewOutput(root: string, requested = '.factory-deployment/previews/local'): Promise<string> {
  const base = path.resolve(root), output = path.resolve(base, requested);
  const permitted = path.join(base, '.factory-deployment', 'previews');
  if (!output.startsWith(permitted + path.sep) || output === permitted) throw Error('PREVIEW_OUTPUT_OUTSIDE_DEDICATED_DIRECTORY');
  // Vite empties this directory; do not follow a planted parent/output symlink.
  const parts = path.relative(base, output).split(path.sep);
  for (let i = 1; i <= parts.length; i++) {
    try {
      const stat = await lstat(path.join(base, ...parts.slice(0, i)));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('PREVIEW_OUTPUT_SYMLINK_REJECTED');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return output;
}

const clientModule = `async function update(){try{const r=await fetch('/${PREVIEW_MANIFEST}',{cache:'no-store'});if(!r.ok)return;const m=await r.json(),el=document.getElementById('jemsPreviewSource');if(el)el.textContent=m.source.sha.slice(0,8)+(m.source.dirty?' · local edits':'');}catch{}}
if(import.meta.hot)import.meta.hot.on('jems:preview-source',update);`;

/** Fast, loopback-only HMR: no build, no cloud setup, and no production proxy. */
export async function startPreview(options: PreviewOptions = {}) {
  const root = path.resolve(options.root ?? process.cwd()), port = options.port ?? previewPort(root);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('PREVIEW_PORT_INVALID');
  checkSource(await previewSource(root), options);
  const origin = `http://127.0.0.1:${port}`;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const plugin: Plugin = {
    name: 'jems-disconnected-development',
    resolveId(id) {if (id === '/@jems-preview/client') return '\0jems-preview-client';},
    load(id) {if (id === '\0jems-preview-client') return clientModule;},
    async transformIndexHtml(html) {return addPreviewBanner(html, await previewSource(root)).replace('</body>', '<script type="module" src="/@jems-preview/client"></script></body>');},
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) {res.statusCode = 403; res.end('Local preview origin required'); return;}
        let pathname: string;
        try {pathname = decodeURIComponent(new URL(req.url ?? '/', origin).pathname);} catch {res.statusCode = 400; res.end('Invalid path'); return;}
        if (pathname === '/factory-config.json') {res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(DISCONNECTED_CONFIG));return;}
        if (pathname === '/sw.js') {
          res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/javascript');
          res.end("/* HMR has no offline cache; built previews use the real offline shell. */\nself.addEventListener('install',()=>self.skipWaiting());\n");return;
        }
        if (pathname === `/${PREVIEW_MANIFEST}` || pathname === '/build-info.json') {
          void previewSource(root).then(source => {
            res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
            res.end(JSON.stringify(pathname === '/build-info.json' ? {...source, environment:'preview'} : {version:1,kind:'jems-static-preview',environment:'preview',backendPolicy:'disconnected',mode:'hmr',source,artifact:null}));
          }).catch(() => {res.statusCode = 503;res.end('Source identity unavailable');});return;
        }
        next();
      });
      const changed = (_event: string, file: string) => {
        if (file.includes('/.factory-deployment/') || file.includes('/node_modules/')) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => server.ws.send({type:'custom',event:'jems:preview-source',data:{}}), 150);
      };
      server.watcher.on('all', changed);
      server.httpServer?.once('close', () => {if(pending)clearTimeout(pending);server.watcher.off('all',changed);});
    }
  };
  const server = await createServer({root,configFile:false,envDir:false,envPrefix:[],base:'./',plugins:[plugin],server:{host:'127.0.0.1',port,strictPort:true,allowedHosts:['127.0.0.1'],cors:{origin},headers:previewHeaders(`ws://127.0.0.1:${port}`),fs:{strict:true,allow:[root],deny:['.env','.env.*','**/.git/**','**/*.pem','**/*.key','**/.factory-deployment/**']}}});
  await server.listen();
  return {server,origin};
}

/** Build a review artifact separately from the production dist/ directory. */
export async function buildPreview(options: PreviewOptions = {}) {
  const root = path.resolve(options.root ?? process.cwd()), output = await previewOutput(root, options.out);
  const source = await previewSource(root);
  checkSource(source, options);
  await mkdir(output, {recursive:true});
  const plugin: Plugin = {
    name:'jems-preview-artifact-label',
    transformIndexHtml(html) {
      if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('PREVIEW_HTML_INVALID');
      return addPreviewBanner(html,source).replace(/<head(?:\s[^>]*)?>/i, match => match + previewPolicyMeta());
    },
    async writeBundle() {await writeFile(path.join(output,'factory-config.json'),JSON.stringify(DISCONNECTED_CONFIG)+'\n');}
  };
  await build({root,configFile:false,envDir:false,envPrefix:[],base:'./',plugins:[plugin,offlineBuild({outDir:output,buildInfo:{...source,environment:'preview'}})],build:{outDir:output,emptyOutDir:true}});
  const after = await previewSource(root);
  if (after.sha !== source.sha || after.workingTreeSha256 !== source.workingTreeSha256 || after.dirty !== source.dirty) throw Error('PREVIEW_SOURCE_CHANGED_DURING_BUILD');
  const manifest = await writePreviewManifest(output, source, options);
  await verifyPreviewArtifact(output,{sha:source.sha,pr:options.pr,runId:options.runId,allowDirty:!options.requireClean});
  return {output,manifest};
}

export async function previewCli(args: string[]) {
  const command = args.shift();
  const flags: Record<string,string|boolean> = {};
  for (let i=0;i<args.length;i++) {
    const arg = args[i];
    if (arg === '--require-clean' || arg === '--allow-dirty') flags[arg] = true;
    else if (['--port','--out','--dir','--pr','--run-id','--expected-sha'].includes(arg) && args[i+1] && !args[i+1].startsWith('--')) flags[arg] = args[++i];
    else throw Error('Usage: preview.ts serve [--port N] | build [--out .factory-deployment/previews/NAME] [--pr N --run-id N --expected-sha SHA --require-clean] | verify --dir PATH [--expected-sha SHA --pr N --run-id N --allow-dirty]');
  }
  const options: PreviewOptions = {port: flags['--port'] === undefined ? undefined : Number(flags['--port']),out:flags['--out'] as string|undefined,pr:flags['--pr'] === undefined ? undefined : Number(flags['--pr']),runId:flags['--run-id'] as string|undefined,expectedSha:flags['--expected-sha'] as string|undefined,requireClean:!!flags['--require-clean']};
  if (command === 'serve') {
    const {server,origin} = await startPreview(options);
    process.stdout.write(`Jems DEV preview: ${origin}\nAI disconnected. Saved test work stays in this checkout's browser origin.\n`);
    for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>void server.close().then(()=>process.exit(0)));
  } else if (command === 'build') {
    const result = await buildPreview(options);
    process.stdout.write(JSON.stringify({status:'PREVIEW_BUILT',directory:result.output,source:result.manifest.source,artifactSha256:result.manifest.artifact.sha256,files:result.manifest.artifact.fileCount,bytes:result.manifest.artifact.totalBytes})+'\n');
  } else if (command === 'verify' && typeof flags['--dir'] === 'string') {
    const manifest = await verifyPreviewArtifact(flags['--dir'],{sha:options.expectedSha,pr:options.pr,runId:options.runId,allowDirty:!!flags['--allow-dirty']});
    process.stdout.write(JSON.stringify({status:'PREVIEW_ARTIFACT_VERIFIED',source:manifest.source,artifactSha256:manifest.artifact.sha256})+'\n');
  } else throw Error('Expected serve, build or verify --dir PATH');
}

if (process.argv[1] && /[/\\]scripts[/\\]development[/\\]preview\.ts$/.test(path.resolve(process.argv[1]))) void previewCli(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error ? error.message : 'PREVIEW_FAILED');process.exitCode=1;});
