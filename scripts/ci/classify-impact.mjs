#!/usr/bin/env node
/** Conservative tree-to-tree selection. Execute this file from the trusted base.
 * This does not replace repository workflow protection or authorize deployment.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ALL_SHARDS = Object.freeze([
  'browser-core', 'browser-generated', 'browser-quality', 'browser-storage', 'learning-math',
  'learning-language', 'notifications', 'studio-core', 'mining', 'factory',
  'physical', 'creation-art', 'pals-rewards', 'child-coach',
]);
export const SHARD_GROUPS = Object.freeze(Object.fromEntries(ALL_SHARDS.map(id => [id,
  id.startsWith('browser-') ? 'browser' : id.startsWith('learning-') ? 'learning'
    : id === 'notifications' ? 'notifications' : 'creative'])));

// Deliberately an exact reviewed list, not docs/** or an extension-only bypass.
// New documents, executable examples, artwork indexes and generated assets default full.
const INERT_DOCUMENTATION = new Set([
  'README.md', 'AGENTS.md', 'PRODUCT-DOCTRINE.md', 'ARCHITECTURE-CURRENT.md',
  'DELIVERY-STATE.md', 'docs/README.md', 'docs/context/MAINTENANCE.md',
  'docs/context/CHATGPT-PROJECT-INSTRUCTIONS.md', '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/operations/ASSISTANT_ACCESS.md', 'docs/operations/POLICY_FOUNDATION.md',
  'docs/operations/PHASE_2.md', 'docs/operations/PRODUCTION_ACTIVATION.md',
  'docs/operations/COACH_RELIABILITY_RELEASE_CONTROL.md',
  'docs/assignment-006/RELEASE-CONTINUITY.md',
]);
export function isInertDocumentation(path) { return INERT_DOCUMENTATION.has(path); }
const REVIEW_KEYS = new Set(['reviewedAt', 'sourceDigest', 'reviewOutcome', 'reviewReason', 'reviewHistory']);
export function normalizedReviewRegistry(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !Array.isArray(value.areas)) {
    throw new Error('Invalid documentation review registry');
  }
  return {...value, areas: value.areas.map(area => {
    if (!area || Array.isArray(area) || typeof area !== 'object' || typeof area.id !== 'string') {
      throw new Error('Invalid documentation review area');
    }
    return Object.fromEntries(Object.entries(area).filter(([key]) => !REVIEW_KEYS.has(key)));
  })};
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const POLICY_PATH = 'scripts/ci/classify-impact.mjs';
const REGISTRY = 'docs/context/registry.json';
const RELEASE = 'ops/release.json';
const COMPATIBILITY = 'ops/compatibility.json';
const PERFORMANCE = 'ops/ci-performance.json';
// Read-only reporting data: never a test-selection or release configuration.
// Exact schema and bounded same-repository numeric IDs exclude executable input.
export function parsePerformanceBaseline(raw) {
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || canonicalJson(Object.keys(value).sort()) !== '["runIds","schemaVersion"]'
    || (raw.match(/"(?:[^"\\]|\\.)*"\s*:/g) ?? []).length !== 2
    || value.schemaVersion !== 1 || !Array.isArray(value.runIds) || !value.runIds.length || value.runIds.length > 20
    || value.runIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(value.runIds).size !== value.runIds.length) {
    throw new Error('Invalid read-only performance baseline');
  }
  return value;
}
const CORE = ['browser-core', 'browser-storage', 'notifications', 'studio-core'];
// These exact leaf modules have no persistence/authentication ownership. Their
// shared consumers are covered by core, player and learning integration suites.
// Main game adapters, host state, shared CSS, coach and storage stay full.
const TARGETS = new Map([
  ['src/games/gem-factory-cut.ts', {category: 'isolated-game', shards: ['factory', 'learning-math', 'learning-language', 'physical'], imports: []}],
  ['src/games/gem-factory-pattern.ts', {category: 'isolated-game', shards: ['factory', 'learning-math', 'learning-language', 'physical'], imports: ['./gem-factory-physics']}],
  ['src/games/mind-your-jems-rules.ts', {category: 'isolated-game', shards: ['mining', 'learning-math', 'learning-language', 'child-coach'], imports: []}],
  ...[1, 2, 3, 4].map(grade => [`src/language/data-g${grade}.ts`, {category: 'isolated-learning', shards: ['learning-math', 'learning-language', 'child-coach'], imports: ['./content']}]),
]);
function git(cwd, args, optional = false) {
  try { return execFileSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}); }
  catch (error) { if (optional) return null; throw new Error(`Git source unavailable (${args[0]}): ${error.status ?? error.code}`); }
}
function commit(cwd, sha) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sha ?? '')) throw new Error('An exact lowercase commit SHA is required');
  const resolved = git(cwd, ['rev-parse', '--verify', `${sha}^{commit}`]).trim();
  if (resolved !== sha) throw new Error('Commit identity mismatch');
  return resolved;
}
function blob(cwd, sha, path, optional = false) { return git(cwd, ['show', `${sha}:${path}`], optional); }
function changes(cwd, base, head) {
  const parts = git(cwd, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, head, '--']).split('\0');
  const result = [];
  for (let i = 0; i < parts.length && parts[i]; i += 2) {
    const m = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([AMDTUXB])$/.exec(parts[i]);
    if (!m || !parts[i + 1]) throw new Error('Unexpected Git diff record');
    result.push({path: parts[i + 1], status: m[5], oldMode: m[1], newMode: m[2]});
  }
  return result;
}
function strictStringObject(raw, keys) {
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object'
    || canonicalJson(Object.keys(parsed).sort()) !== canonicalJson([...keys].sort())
    || Object.values(parsed).some(value => typeof value !== 'string')
    || (raw.match(/"(?:[^"\\]|\\.)*"\s*:/g) ?? []).length !== keys.length) {
    throw new Error('Operational JSON has unexpected keys, duplicate keys, or value types');
  }
  return parsed;
}
function operationOnly(cwd, base, head) {
  const keys = ['operation', 'source', 'service', 'image', 'baseline', 'baselineImage', 'configuration', 'compatibility'];
  const before = strictStringObject(blob(cwd, base, RELEASE), keys);
  const after = strictStringObject(blob(cwd, head, RELEASE), keys);
  if (![before.operation, after.operation].every(value => ['stage', 'canary', 'promote', 'rollback'].includes(value))) return false;
  if (!/^[a-f0-9]{40}$/.test(after.source) || !/^[a-f0-9]{64}$/.test(after.configuration)
    || !/^[a-f0-9]{64}$/.test(after.compatibility) || !/@sha256:[a-f0-9]{64}$/.test(after.image)
    || !/@sha256:[a-f0-9]{64}$/.test(after.baselineImage)) return false;
  if (keys.some(key => key !== 'operation' && before[key] !== after[key])) return false;
  const compatibilityKeys = ['source', 'service', 'image', 'baseline', 'baselineImage', 'evidence'];
  const oldCompatibility = strictStringObject(blob(cwd, base, COMPATIBILITY), compatibilityKeys);
  const newCompatibility = strictStringObject(blob(cwd, head, COMPATIBILITY), compatibilityKeys);
  return hash(blob(cwd, head, COMPATIBILITY)) === after.compatibility
    && canonicalJson(oldCompatibility) === canonicalJson(newCompatibility)
    && ['source', 'service', 'image', 'baseline', 'baselineImage'].every(key => after[key] === newCompatibility[key]);
}
function safeLeaf(before, after, target) {
  // A changed dependency, runtime loader, ambient-global access, network or
  // storage turns a leaf change into ambiguous executable impact. False broad
  // classifications are intentional. These checks are not a security sandbox.
  const imports = source => [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(m => m[1]).sort();
  const risky = /\b(?:import|require|eval|Function)\s*\(|\b(?:globalThis|window|document|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|process|WebSocket)\b|import\s*['"]|export\s*[^;]*\bfrom\b/;
  return [before, after].every(source => !risky.test(source)
    && canonicalJson(imports(source)) === canonicalJson([...target.imports].sort()));
}
function broadCategory(path) {
  if (/^(?:\.github\/|scripts\/|tests\/|tools\/)|(?:^|\/)(?:package(?:-lock)?\.json|[^/]*config\.[^/]+)$/.test(path)) return 'test-infrastructure-or-dependencies';
  if (/auth|privacy|security|persist|storage|notebook|session|consent|token|budget|admission|backup/i.test(path)) return 'security-persistence-or-shared-data';
  if (/coach|coaching|conversation|guided|speech/.test(path)) return 'conversation-coach';
  if (path.startsWith('public/') || path.startsWith('src/assets/') || path.startsWith('docs/') && !path.endsWith('.md')) return 'artwork-assets-or-generated-data';
  if (path.endsWith('.css')) return 'ui-with-shared-style-impact';
  if (path.startsWith('src/') || path.startsWith('server/')) return 'shared-application';
  return 'unknown';
}

export function classifyImpact({cwd = process.cwd(), base, head, forceFull = false, event = 'pull_request'} = {}) {
  const reasons = [], categories = new Set(), selected = new Set();
  const plan = {schemaVersion: 1, base, head, policySha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    mode: 'full', requiredShards: [...ALL_SHARDS], requiredGroups: ['browser', 'learning', 'notifications', 'creative', 'private-coach-image'],
    requiredImage: true, requiredOperations: true, requiredDocumentation: true, requiresEvidenceReuse: false,
    trustedPolicy: false, categories: [], reasons, decisions: [], shadowTargetedShards: []};
  let full = Boolean(forceFull) || event !== 'pull_request';
  if (forceFull) reasons.push({path: null, reason: 'Explicit force-full regression requested.'});
  if (event !== 'pull_request') reasons.push({path: null, reason: 'Main/push/manual validation remains full for the unchanged production source gate.'});
  try {
    commit(cwd, base); commit(cwd, head);
    git(cwd, ['merge-base', '--is-ancestor', base, head]);
    const trustedSource = blob(cwd, base, POLICY_PATH, true);
    plan.trustedPolicy = trustedSource !== null && hash(trustedSource) === plan.policySha256;
    if (!plan.trustedPolicy) { full = true; reasons.push({path: POLICY_PATH, reason: 'Trusted-base policy is missing or does not match the running classifier; bootstrap is full.'}); }
    const entries = changes(cwd, base, head);
    if (!entries.length) { full = true; reasons.push({path: null, reason: 'Empty or unchanged range has no narrow PR classification.'}); }
    for (const entry of entries) {
      const {path} = entry;
      if (entry.status !== 'M' || entry.oldMode !== '100644' || entry.newMode !== '100644' || /[\x00-\x1f\\]/.test(path)) {
        full = true; categories.add('rename-delete-add-or-mode-change'); reasons.push({path, reason: 'Additions, deletions, renames, nonregular files and mode changes require full coverage.'}); continue;
      }
      if (isInertDocumentation(path)) { categories.add('documentation'); reasons.push({path, reason: 'Exact allowlisted inert document; documentation integrity remains required.'}); continue; }
      if (path === REGISTRY) {
        const before = normalizedReviewRegistry(JSON.parse(blob(cwd, base, path)));
        const after = normalizedReviewRegistry(JSON.parse(blob(cwd, head, path)));
        if (canonicalJson(before) === canonicalJson(after)) {
          categories.add('documentation'); reasons.push({path, reason: 'Review metadata only; document routing, source policy and every other registry field are unchanged.'}); continue;
        }
      }
      if (path === RELEASE || path === COMPATIBILITY) {
        if (operationOnly(cwd, base, head)) { categories.add('release-intent'); reasons.push({path, reason: 'Only release operation or JSON formatting changed; exact source, images, runtime configuration and compatibility values are unchanged. Separate reuse and transition verification required.'}); continue; }
        full = true; categories.add('release-identity-or-configuration'); reasons.push({path, reason: 'Release identity/configuration changed or strict intent equivalence failed.'}); continue;
      }
      if (path === PERFORMANCE) {
        parsePerformanceBaseline(blob(cwd, base, path));
        parsePerformanceBaseline(blob(cwd, head, path));
        categories.add('release-intent');
        reasons.push({path, reason: 'Read-only CI reporting baseline IDs only; no test, runtime or release control. Operational reuse still requires authenticated full evidence.'});
        continue;
      }
      const target = TARGETS.get(path);
      if (target && safeLeaf(blob(cwd, base, path), blob(cwd, head, path), target)) {
        categories.add(target.category); [...CORE, ...target.shards].forEach(id => selected.add(id));
        reasons.push({path, reason: 'Reviewed leaf dependency set unchanged; include its feature, shared core/player, ownership and learning consumers.'}); continue;
      }
      full = true; categories.add(broadCategory(path)); reasons.push({path, reason: 'No proven narrow dependency closure; full regression required.'});
    }
    if ([...categories].filter(value => value.startsWith('isolated-')).length > 1) {
      full = true; reasons.push({path: null, reason: 'Mixed feature domains require full regression.'});
    }
    if (categories.has('release-intent') && selected.size) {
      full = true; reasons.push({path: null, reason: 'Mixed operational and executable changes require full regression.'});
    }
    if (!full && selected.size) {
      plan.shadowTargetedShards = ALL_SHARDS.filter(id => selected.has(id));
      full = true;
      reasons.push({path: null, reason: 'Executable targeting is shadow-only: known consumers are mapped, but syntax screening cannot prove absence of new side effects. Required coverage remains full.'});
    }
    if (!full) {
      plan.mode = selected.size ? 'targeted' : categories.has('release-intent') ? 'release-intent' : 'documentation';
      plan.requiredShards = ALL_SHARDS.filter(id => selected.has(id));
      plan.requiredImage = false;
      plan.requiredGroups = [...new Set(plan.requiredShards.map(id => SHARD_GROUPS[id]))];
      plan.requiresEvidenceReuse = plan.mode === 'release-intent';
    }
  } catch (error) {
    full = true; reasons.push({path: null, reason: `Classification failed closed: ${error.message}`});
  }
  plan.categories = [...categories].sort();
  plan.decisions = ALL_SHARDS.map(id => ({id, required: plan.requiredShards.includes(id),
    reason: plan.mode === 'full' ? 'Full regression: see classification reasons.'
      : plan.requiredShards.includes(id) ? 'Affected feature or mandatory shared consumer.'
        : plan.requiresEvidenceReuse ? 'Omit only after independent exact-evidence verification succeeds; otherwise run full.' : 'Trusted policy establishes no applicable dependency in this change.'}));
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = {}, flags = new Set(['--force-full']);
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (flags.has(arg)) values.forceFull = true;
    else if (['--base', '--head', '--output', '--event', '--cwd'].includes(arg) && process.argv[i + 1]) values[arg.slice(2)] = process.argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  const result = `${JSON.stringify(classifyImpact(values), null, 2)}\n`;
  if (values.output) writeFileSync(values.output, result);
  process.stdout.write(result);
}
