// Advisory dependency observations only. Nothing in this module selects tests.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {posix, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ALL_SHARDS} from './classify-impact.mjs';

export function changeCategory(path) {
  if (/auth|privacy|security|persist|storage|notebook|session|consent|token|budget|admission|backup/i.test(path)) return 'security-sensitive';
  if (/coach|conversation|guided|speech/.test(path)) return 'conversation';
  if (/\.css$/.test(path) || /\/ui\.ts$/.test(path)) return 'ui';
  if (/^src\/(learning|language|problem-solving)\//.test(path)) return 'learning';
  if (path.startsWith('src/creation/')) return 'coding';
  if (path.startsWith('src/games/')) return 'game';
  return 'shared-or-unknown';
}

// This deliberately over-approximates static imports, including type imports.
// Runtime browser/global wiring cannot be proven by lexical import inspection.
export function dependencyObservation(files, changed) {
  const reverse = new Map(), ambiguous = new Set();
  for (const [name, source] of Object.entries(files)) {
    if (/\b(?:import|require|eval|Function)\s*\(/.test(source)) ambiguous.add(name);
    const imports = [...source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) { ambiguous.add(name); continue; }
      const stem = posix.normalize(posix.join(posix.dirname(name), specifier));
      const target = [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}/index.ts`].find(p => Object.hasOwn(files, p));
      if (!target) { ambiguous.add(name); continue; }
      const consumers = reverse.get(target) ?? new Set(); consumers.add(name); reverse.set(target, consumers);
    }
  }
  const changes = changed.map(path => {
    const seen = new Set([path]), queue = [path];
    for (let i = 0; i < queue.length; i++) for (const consumer of reverse.get(queue[i]) ?? []) {
      if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
    }
    return {path, category: changeCategory(path), staticConsumers: [...seen].filter(p => p !== path).sort(),
      ambiguousModules: [...seen].filter(p => ambiguous.has(p)).sort(), missingModule: !Object.hasOwn(files, path)};
  });
  return {schemaVersion: 1, mode: 'shadow', maySelectTests: false, coverageProven: false,
    categories: [...new Set(changes.map(c => c.category))].sort(), changes,
    executableFallbackShards: [...ALL_SHARDS],
    limitations: ['Static imports do not cover browser globals, runtime registration, assets or semantic side effects.',
      'A full passing run is a comparison sample, not proof that omitted tests cannot detect a future regression.',
      'Unknown, shared, security-sensitive and ambiguous changes require full regression. No category is activated here.']};
}

export function observeCommitRange(cwd, base, head) {
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  for (const sha of [base, head]) if (!/^[a-f0-9]{40}$/.test(sha ?? '') || git('rev-parse', `${sha}^{commit}`).trim() !== sha) throw new Error('Exact source commits required');
  git('merge-base', '--is-ancestor', base, head);
  const changed = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean);
  const blobs = new Map();
  function readTree(sha) {
    const files = {};
    const entries = git('ls-tree', '-rz', sha, '--', 'src', 'server').split('\0').filter(Boolean)
      .map(entry => /^\d+ blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry))
      .filter(entry => entry && /\.(?:ts|tsx|js|css)$/.test(entry[2]));
    const missing = [...new Set(entries.map(entry => entry[1]).filter(id => !blobs.has(id)))];
    // Git frames raw blob bytes by length. Parse before UTF-8 decoding so that
    // filenames, Unicode and embedded newlines cannot shift the next record.
    for (let i = 0; i < missing.length; i += 64) {
      const ids = missing.slice(i, i + 64);
      const bytes = execFileSync('git', ['cat-file', '--batch'], {cwd, input: ids.join('\n') + '\n', maxBuffer: 64 * 1024 * 1024});
      let offset = 0;
      for (const id of ids) {
        const newline = bytes.indexOf(10, offset);
        const header = /^(\w+) blob (\d+)$/.exec(bytes.toString('ascii', offset, newline));
        if (!header || header[1] !== id) throw new Error('Invalid Git blob header');
        const end = newline + 1 + Number(header[2]);
        if (bytes[end] !== 10) throw new Error('Incomplete Git blob');
        blobs.set(id, bytes.toString('utf8', newline + 1, end));
        offset = end + 1;
      }
      if (offset !== bytes.length) throw new Error('Unexpected Git batch data');
    }
    for (const [, id, path] of entries) files[path] = blobs.get(id);
    return files;
  }
  const before = dependencyObservation(readTree(base), changed), after = dependencyObservation(readTree(head), changed);
  return {...after, base, head, beforeChanges: before.changes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = JSON.parse(readFileSync('ci-plan.json'));
  const observation = observeCommitRange(process.cwd(), plan.base, plan.head);
  observation.actualRequiredShards = plan.requiredShards;
  observation.actualMode = plan.mode;
  observation.runId = plan.runId;
  observation.runAttempt = plan.runAttempt;
  writeFileSync('ci-dependency-shadow.json', JSON.stringify(observation, null, 2) + '\n');
  console.log(JSON.stringify({mode: observation.mode, categories: observation.categories, coverageProven: false}));
}
