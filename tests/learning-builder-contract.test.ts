import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { build } from 'esbuild';
import { BuilderClient } from '../src/builder/client';
import { apiHandler } from '../server/pipeline/http';
import { JobService } from '../server/pipeline/service';
import { MemoryRepository } from '../server/pipeline/repository';
import { MockAgent } from '../server/testing/mock-agent';
import { signSession } from '../server/pipeline/auth';

test('revision and preview contracts expose the stable game project across revisions', async () => {
  const repo = new MemoryRepository(), service = new JobService(repo, new MockAgent(), { test: async () => {} });
  await repo.transaction(s => {
    for (const id of ['revision-one', 'revision-two']) s.revisions.push({ id, projectId: 'same-game', familyId: 'family',
      parentId: id === 'revision-one' ? null : 'revision-one', game: { kind: 'star-catcher-v1', target: 3, seconds: 10 } });
    return true;
  });
  const config = { sessionKey: 'test-only-session-key-at-least-thirty-two-characters', previewKey: 'test-only-preview-key-at-least-thirty-two-characters',
    appOrigin: 'https://app.example', previewOrigin: 'https://preview.example' };
  const token = signSession({ subject: 'parent', familyId: 'family', role: 'parent', expiresAt: Date.now() + 60_000 }, config.sessionKey);
  const handler = apiHandler(service, config);
  for (const path of ['/v1/revisions/revision-one', '/v1/revisions/revision-two', '/v1/revisions/revision-one/preview', '/v1/revisions/revision-two/preview']) {
    let response: any, status = 0;
    await handler({ method: 'GET', url: path, headers: { cookie: 'factory_session=' + token } } as IncomingMessage,
      { setHeader() {}, writeHead(code: number) { status = code; }, end(body: string) { response = JSON.parse(body); } } as unknown as ServerResponse);
    assert.equal(status, 200); assert.equal(response.projectId, 'same-game');
  }
});

test('preview client validates project identity and supports older preview contracts', async () => {
  const client = new BuilderClient({ version: 1, mode: 'remote', apiBaseUrl: 'https://api.example', previewOrigin: 'https://preview.example' }, () => {});
  let payload: any = { artifactId: 'revision-one', url: 'https://preview.example/preview/revision-one', expiresAt: Date.now() + 60_000, projectId: 'project-one' };
  client.api = async () => payload;
  assert.equal((await client.preview('revision-one')).projectId, 'project-one');
  delete payload.projectId;
  assert.equal((await client.preview('revision-one')).projectId, 'revision-one');
  for (const projectId of [null, '', '__proto__', 'constructor', 'bad/key', 'x'.repeat(101)]) {
    payload = { ...payload, projectId };
    await assert.rejects(client.preview('revision-one'), /UNSAFE_PREVIEW/);
  }
});

let bundledUI: string | undefined;
async function uiHarness() {
  if (!bundledUI) {
    const result = await build({ entryPoints: ['src/builder/ui.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'BuilderUI',
      plugins: [{ name: 'observe-preview-mount', setup(b) {
        b.onResolve({ filter: /learning\/remote$/ }, () => ({ path: 'preview-mount', namespace: 'test' }));
        b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function attachPreviewLearning(frame,options){window.mounts.push(options);return {dispose(){window.disposals++}};}' }));
      } }] });
    bundledUI = result.outputFiles[0].text;
  }
  const nodes = new Map<string, any>(), listeners = new Map<string, Function[]>(), saved = new Map<string, string>();
  class Element {
    private name = ''; hidden = false; children: any[] = []; style: any = {}; value = ''; textContent = ''; innerHTML = ''; src?: string;
    onclick?: Function; onsubmit?: Function;
    set id(value: string) { this.name = value; nodes.set(value, this); } get id() { return this.name; }
    querySelector() { return new Element(); } after() {} before() {}
    append(...children: any[]) { this.children.push(...children); }
    replaceChildren(...children: any[]) { this.children = children; }
    setAttribute() {} removeAttribute(name: string) { if (name === 'src') delete this.src; }
    reportValidity() { return true; }
  }
  const node = (id: string) => { if (!nodes.has(id)) { const e = new Element(); e.id = id; } return nodes.get(id); };
  const profiles: any[] = [{ id: 'a', skills: {}, mathModes: { 'builder-generated': 'both' } }, { id: 'b', skills: {} }];
  let active = profiles[0], nextRevision = 'revision-one', jobs = 0;
  const pending = new Map<string, (value: unknown) => void>(), requests: string[] = [];
  const emit = (type: string, detail?: string) => { for (const listener of listeners.get(type) || []) listener({ detail }); };
  const FG: any = { store: { current: () => active }, learning: {
    modeFor: (key: string) => active.mathModes?.[key] || 'checkpoint',
    setMode: (key: string, mode: string) => { active.mathModes = { ...active.mathModes, [key]: mode }; }, modeControl() {},
  }, app: { page: (page: string) => emit('factory-page', page) } };
  const window: any = { FG, mounts: [], disposals: 0, addEventListener: (type: string, listener: Function) => listeners.set(type, [...listeners.get(type) || [], listener]) };
  const document: any = { baseURI: 'https://app.example/', createElement: () => new Element(), getElementById: node, querySelector: () => ({ id: 'page-create' }) };
  const fetch = async (input: any) => {
    const url = new URL(String(input)), path = url.pathname;
    requests.push(path);
    let body: any;
    if (path === '/factory-config.json') body = { version: 1, mode: 'remote', apiBaseUrl: 'https://api.example', previewOrigin: 'https://preview.example' };
    else if (path === '/v1/jobs') body = { jobId: 'job-' + ++jobs, status: 'ready', revisionId: nextRevision };
    else if (path.endsWith('/preview')) return { ok: true, json: () => new Promise(resolve => pending.set(path.split('/')[3], resolve)) };
    else if (path.endsWith('/fork')) body = { revisionId: 'fork-revision' };
    else if (path === '/v1/creations') body = [];
    else throw Error('Unexpected test request: ' + path);
    return { ok: true, json: async () => body };
  };
  const context: any = { window, document, fetch, URL, crypto: { randomUUID }, setTimeout, clearTimeout,
    localStorage: { getItem: (key: string) => saved.get(key) || null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) } };
  runInNewContext(bundledUI, context);
  await context.BuilderUI.initBuilder();
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  return { node, window, profiles, emit, pending, flush,
    async start(id = 'revision-one') { nextRevision = id; node('inventIdea').value = 'Catch three stars'; node('createTry').onclick(); await flush(); },
    async resolve(id: string, projectId: string) { assert.ok(pending.has(id), `preview is pending: ${JSON.stringify({requests,status:node('builderStatus').textContent})}`); pending.get(id)!({ projectId, artifactId: id, url: 'https://preview.example/preview/' + id, expiresAt: Date.now() + 60_000, kind: 'star-catcher-v1' }); pending.delete(id); await flush(); },
    switchProfile() { active = profiles[1]; emit('factory-profile'); },
  };
}

test('leaving the builder while preview is pending cannot mount hidden math later', async () => {
  const h = await uiHarness(); await h.start(); assert.ok(h.pending.has('revision-one'));
  h.emit('factory-page', 'home'); await h.resolve('revision-one', 'project-one');
  assert.equal(h.window.mounts.length, 0); assert.equal(h.node('builderPanel').hidden, true);
  assert.equal(h.node('generatedPreview').src, undefined);
});

test('builder modes use project identity across versions and forks copy only that choice', async () => {
  const h = await uiHarness(); await h.start(); await h.resolve('revision-one', 'project-one');
  assert.equal(h.window.mounts[0].projectId, 'remote:project-one');
  assert.equal(h.profiles[0].mathModes['remote:project-one'], 'both');
  h.window.FG.learning.setMode('remote:project-one', 'interaction');
  await h.start('revision-two'); await h.resolve('revision-two', 'project-one');
  assert.equal(h.window.mounts[1].projectId, 'remote:project-one');
  assert.equal(h.profiles[0].mathModes['remote:project-one'], 'interaction');
  h.node('forkBuildForm').onsubmit({ preventDefault() {} }); await h.flush();
  await h.resolve('fork-revision', 'fork-project');
  assert.equal(h.profiles[0].mathModes['remote:fork-project'], 'interaction');
  assert.deepEqual(h.profiles[0].skills, {});
  h.window.mounts.at(-1).onRound({ won: true, score: 3 });
  assert.equal(h.node('previewOutcome').textContent, 'You caught 3 stars! Keep it or try your own next change.');
});

test('a profile switch during a fork preview cannot copy another child’s mode or mount their game', async () => {
  const h = await uiHarness(); await h.start(); await h.resolve('revision-one', 'project-one');
  h.node('forkBuildForm').onsubmit({ preventDefault() {} }); await h.flush();
  h.switchProfile(); await h.resolve('fork-revision', 'fork-project');
  assert.equal(h.window.mounts.length, 1); assert.equal(h.profiles[1].mathModes, undefined);
  assert.equal(h.node('builderPreview').hidden, true);
});
