// The only game this local command can execute is this checked-in authored fixture.
// Real model artifacts must be tested by the existing private isolated worker.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { draftChildIntentContract } from '../server/quality/child-intent';
import { chooseGameForm } from '../server/quality/game-form';
import { createFunctionalGameContract, type FunctionalProbe } from '../server/quality/functional-game-contract';
import { qualityEvidenceHash, validateQualityEvidence } from '../server/quality/game-quality';
import { robotRouteFixture } from '../server/testing/working-game-fixtures';
import { cases, caseIdentity, benchmarkVersion } from './premium-benchmark-cases';

export function runAuthoredFixture(directory: string) {
  const item = cases.find(c => c.id === 'star-map')!;
  const intent = draftChildIntentContract(item.request);
  const probe: FunctionalProbe = {
    id: 'walk-around-wall', covers: Object.keys(item.checks), deterministicReplay: true,
    actions: ['right', 'down', 'left', 'right', 'right', 'down'].map(button =>
      ({ kind: 'press', button: button as 'left' | 'right' | 'down' })),
    checkpoints: [
      { after: 0, outcome: 'playing', observations: [{ kind: 'visible', key: 'wall' }] },
      { after: 1, outcome: 'playing', observations: [{ kind: 'coordinate', key: 'robot', axis: 'x', operator: 'gt', value: 195 }] },
      { after: 2, outcome: 'playing', observations: [{ kind: 'coordinate', key: 'robot', axis: 'y', operator: 'lt', value: 165 }] },
      { after: 3, outcome: 'playing', observations: [{ kind: 'coordinate', key: 'robot', axis: 'x', operator: 'lt', value: 125 }] },
      { after: 5, outcome: 'playing', observations: [{ kind: 'coordinate', key: 'robot', axis: 'x', operator: 'gt', value: 275 }] },
      { after: 6, outcome: 'won', observations: [{ kind: 'coordinate', key: 'robot', axis: 'y', operator: 'gt', value: 235 }, { kind: 'visible', key: 'goal' }] },
    ],
  };
  const contract = createFunctionalGameContract(intent, chooseGameForm(intent), [
    { id: 'wall', quote: 'around a blocked square' }, { id: 'explore', quote: 'go back the way I came, choose another path' },
    { id: 'star', quote: 'reach the star' },
  ], [probe]);
  const game = { ...robotRouteFixture, playthrough: probe.actions.map(a => ({
    type: 'hold', control: a.kind === 'press' && a.button, frames: 26,
  })) };
  const started = performance.now();
  const stdout = execFileSync(process.execPath, ['server/sandbox/worker.cjs'], {
    input: JSON.stringify({ game, independentIntentPlan: contract, captureQuality: true }),
    env: { PATH: process.env.PATH, HOME: '/tmp', WORKER_BROWSER_PATH: process.env.CHROMIUM_PATH || chromium.executablePath(),
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH },
    stdio: ['pipe', 'pipe', 'ignore'], timeout: 120000, maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(stdout.toString());
  if (!result.ok || !result.game?.compiled?.tests?.intent) {
    const code = /^[A-Z0-9_]+$/.test(result.diagnostics) ? result.diagnostics : 'SANDBOX_FIXTURE_FAILED';
    throw Error(code);
  }
  const evidence = validateQualityEvidence(result.game, result.qualityEvidence);
  if (!evidence.sessions.every(s => s.outcome === 'won')) throw Error('FIXTURE_GOAL_UNOBSERVED');
  mkdirSync(directory, { recursive: true });
  const receipts = {
    version: benchmarkVersion, origin: 'authored-browser-fixture', caseId: item.id, ...caseIdentity(item),
    actualModelComparison: 'pending', paidCalls: 0, generationDurationMs: null,
    sandboxWallMs: Math.round(performance.now() - started), evidenceHash: qualityEvidenceHash(evidence),
    artifactHash: evidence.artifactHash, sourceHash: evidence.sourceHash, codeHash: evidence.codeHash,
    runtimeHash: evidence.runtimeHash, independentCheckpoints: probe.checkpoints.length, tests: result.game.compiled.tests,
    sessions: evidence.sessions, captures: evidence.captures.map(({ data, ...capture }) => capture),
  };
  for (const shot of evidence.captures) writeFileSync(join(directory, shot.id + '.png'), Buffer.from(shot.data, 'base64'));
  writeFileSync(join(directory, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
  return receipts;
}
