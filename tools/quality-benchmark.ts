/**
 * Reproducible, synthetic headless CPU benchmark. Run with:
 *   node --import tsx tools/quality-benchmark.ts
 *
 * This measures synchronous simulation and snapshot work on the current host.
 * It does not measure browser frame pacing, rendering/GPU, audio, input latency,
 * mobile thermals, memory retention, or whether children enjoy the games.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { addPart, connectParts, emptyBlueprint, starterBlueprint } from '../src/quality/blueprint';
import { createConstruction, createVehicle, FIXED_DT, PHYSICS_VERSION, type ConstructionSimulation, type VehicleSimulation, type SimulationSnapshot } from '../src/quality/physics';
import type { PartKind } from '../src/quality/parts';

type Simulation = ConstructionSimulation | VehicleSimulation;
interface Scene {
  id: string; description: string; configuration: Record<string, unknown>;
  maxTicksPerEpisode: number; create(): Simulation;
  input(tick: number): { action?: boolean; throttle?: number; brake?: boolean };
}
const root = resolve(__dirname, '..');
const output = resolve(root, 'test-results/quality-headless-benchmark.json');
const warmupEpisodes = 3, measuredEpisodes = 12;

function stressBlueprint() {
  // The published editor limit: 32 active parts and the largest supported gum supply.
  const kinds: PartKind[] = ['carton', 'can', 'wheel', 'carton', 'fan', 'bottle', 'can', 'carton'];
  let blueprint = emptyBlueprint();
  const rows: string[][] = [];
  for (let row = 0; row < 4; row++) {
    rows.push([]);
    for (let col = 0; col < 8; col++) {
      blueprint = addPart(blueprint, kinds[col], 1.7 + col * 2.65, 1.5 + row * 2.5);
      rows[row].push(blueprint.parts.at(-1)!.id);
    }
  }
  for (const row of rows) for (let col = 1; col < row.length && blueprint.joints.length < 20; col++) blueprint = connectParts(blueprint, row[col - 1], row[col]);
  return blueprint;
}
const stress = stressBlueprint();
const scenes: Scene[] = [
  { id: 'delivery-standard', description: 'Five household parts, two free axles and two gum joints; physical delivery including collision events.',
    configuration: { mission: 'delivery', parts: 5, joints: 4, options: 'defaults' }, maxTicksPerEpisode: 180,
    create: () => createConstruction(starterBlueprint('delivery'), {}, 'delivery'), input: () => ({}) },
  { id: 'bridge-standard', description: 'Six parts and five loaded gum joints spanning the gap; measured before the goal freezes the world.',
    configuration: { mission: 'bridge', parts: 6, joints: 5, options: 'defaults' }, maxTicksPerEpisode: 180,
    create: () => createConstruction(starterBlueprint('bridge'), {}, 'bridge'), input: () => ({}) },
  { id: 'meadow-standard', description: 'A chassis, two motorised wheels and two suspension joints climbing and landing on the meadow terrain.',
    configuration: { track: 'meadow', parts: 3, joints: 2, options: 'defaults', throttle: 1 }, maxTicksPerEpisode: 360,
    create: () => createVehicle({}, 'meadow'), input: () => ({ throttle: 1 }) },
  { id: 'construction-limit', description: '32 mixed bodies with 20 connections; four fans keep applying force while the connected rows fall and collide. Breaks remain real.',
    configuration: { mission: 'free', parts: 32, joints: 20, options: { gumBudget: 20, jointStrength: 2, gravity: 16 } }, maxTicksPerEpisode: 240,
    create: () => createConstruction(stress, { gumBudget: 20, jointStrength: 2, gravity: 16 }, 'free'), input: tick => ({ action: tick % 90 < 45 }) },
];

interface Distribution { samples: number; min: number; p50: number; p95: number; p99: number; max: number; mean: number }
const round = (number: number) => Number(number.toFixed(6));
function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
  return { samples: values.length, min: round(sorted[0] || 0), p50: round(percentile(.5)), p95: round(percentile(.95)),
    p99: round(percentile(.99)), max: round(sorted.at(-1) || 0), mean: round(values.reduce((sum, value) => sum + value, 0) / (values.length || 1)) };
}
function measured<T>(run: () => T) {
  // process.cpuUsage has microsecond resolution and covers this Node process,
  // including GC and helper threads. Wall elapsed also includes OS scheduling.
  const cpu = process.cpuUsage(), start = performance.now();
  const value = run(), elapsedMs = performance.now() - start, used = process.cpuUsage(cpu);
  return { value, elapsedMs, cpuMs: (used.user + used.system) / 1000 };
}
function finite(snapshot: SimulationSnapshot) {
  for (const body of snapshot.bodies) for (const scalar of [body.x, body.y, body.angle, body.vx, body.vy]) if (!Number.isFinite(scalar)) throw Error('Benchmark produced a non-finite body');
}
function fingerprint(path: string) { return createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'); }
function git(args: string[]) { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unavailable'; } }

const baselineWall: number[] = [], baselineCpu: number[] = [];
for (let i = 0; i < 5000; i++) { const empty = measured(() => {}); baselineWall.push(empty.elapsedMs); baselineCpu.push(empty.cpuMs); }
const results = scenes.map(scene => {
  for (let episode = 0; episode < warmupEpisodes; episode++) {
    const simulation = scene.create();
    for (let tick = 0; tick < scene.maxTicksPerEpisode; tick++) {
      simulation.step(FIXED_DT, scene.input(tick));
      const snapshot = simulation.snapshot(); simulation.drainEvents();
      if (snapshot.status !== 'playing') break;
    }
    simulation.dispose();
  }
  const stepWall: number[] = [], stepCpu: number[] = [], snapshotWall: number[] = [], snapshotCpu: number[] = [], combinedWall: number[] = [], combinedCpu: number[] = [];
  const createWall: number[] = [], episodeEnds: { time: number; status: string; brokenJoints: number }[] = [];
  const eventCounts: Record<string, number> = {};
  const initialHeap = process.memoryUsage().heapUsed;
  for (let episode = 0; episode < measuredEpisodes; episode++) {
    const creation = measured(scene.create), simulation = creation.value; createWall.push(creation.elapsedMs);
    let snapshot = simulation.snapshot();
    for (let tick = 0; tick < scene.maxTicksPerEpisode; tick++) {
      const step = measured(() => simulation.step(FIXED_DT, scene.input(tick)));
      const copy = measured(() => ({ snapshot: simulation.snapshot(), events: simulation.drainEvents() }));
      snapshot = copy.value.snapshot; finite(snapshot);
      for (const event of copy.value.events) eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
      stepWall.push(step.elapsedMs); stepCpu.push(step.cpuMs); snapshotWall.push(copy.elapsedMs); snapshotCpu.push(copy.cpuMs);
      combinedWall.push(step.elapsedMs + copy.elapsedMs); combinedCpu.push(step.cpuMs + copy.cpuMs);
      if (snapshot.status !== 'playing') break; // Do not dilute measurements with completed-world no-ops.
    }
    episodeEnds.push({ time: round(snapshot.time), status: snapshot.status, brokenJoints: snapshot.brokenCount });
    simulation.dispose();
  }
  return { id: scene.id, description: scene.description, configuration: scene.configuration,
    warmupEpisodes, measuredEpisodes, maxTicksPerEpisode: scene.maxTicksPerEpisode,
    stepElapsedMs: distribution(stepWall), stepProcessCpuMs: distribution(stepCpu),
    snapshotAndEventsElapsedMs: distribution(snapshotWall), snapshotAndEventsProcessCpuMs: distribution(snapshotCpu),
    combinedElapsedMs: distribution(combinedWall), combinedProcessCpuMs: distribution(combinedCpu),
    creationElapsedMs: distribution(createWall), eventCounts, episodeEnds,
    heapUsedBytes: { before: initialHeap, after: process.memoryUsage().heapUsed, caveat: 'No forced GC; this is neither retained memory nor a leak test.' } };
});
const sourcePaths = ['src/quality/parts.ts', 'src/quality/blueprint.ts', 'src/quality/physics.ts', 'tools/quality-benchmark.ts'];
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), benchmark: 'quality-headless-cpu-v1', physicsVersion: PHYSICS_VERSION,
  scope: 'Synthetic synchronous CPU simulation benchmark. No DOM, Canvas, GPU, WebAudio, browser frame pacing, mobile thermals, or child enjoyment assessment.',
  methodology: { fixedDtSeconds: FIXED_DT, wallClock: 'performance.now', cpuClock: 'process.cpuUsage (user + system microseconds)',
    cpuCaveat: 'Process CPU includes GC/helper threads and measurement overhead; wall elapsed includes scheduling. Baseline is reported, not subtracted.',
    episodePolicy: 'Fresh deterministic scene for each episode. Warm up each scenario, then measure every active tick; stop at goals to exclude frozen-world no-ops.',
    seed: 'Authored deterministic scenes; no simulation randomness.', noAbsoluteHardwarePassGate: true },
  environment: { node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: process.arch,
    planck: JSON.parse(readFileSync(resolve(root, 'node_modules/planck/package.json'), 'utf8')).version,
    cpuModel: cpus()[0]?.model || 'unknown', logicalCpus: cpus().length, totalMemoryBytes: totalmem(), ci: Boolean(process.env.CI) },
  source: { gitHead: git(['rev-parse', 'HEAD']), worktreeDirty: Boolean(git(['status', '--porcelain'])), hashes: Object.fromEntries(sourcePaths.map(path => [path, fingerprint(path)])) },
  measurementBaseline: { elapsedMs: distribution(baselineWall), processCpuMs: distribution(baselineCpu) }, results,
};
mkdirSync(resolve(root, 'test-results'), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.table(results.map(r => ({ scene: r.id, samples: r.combinedElapsedMs.samples,
  'CPU p50 ms': r.combinedProcessCpuMs.p50, 'CPU p95 ms': r.combinedProcessCpuMs.p95, 'CPU p99 ms': r.combinedProcessCpuMs.p99,
  'elapsed p95 ms': r.combinedElapsedMs.p95, 'elapsed max ms': r.combinedElapsedMs.max })));
console.log(`Wrote ${output}`);
