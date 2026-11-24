#!/usr/bin/env node
// Read-only GitHub Actions measurements. Durations are observations, never release evidence.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const seconds = (start, end) => {
  if (!start || !end) return null;
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
};
const sum = values => values.reduce((total, value) => total + (value ?? 0), 0);
const round = value => value === null ? null : Math.round(value * 100) / 100;
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted[middle] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2 : null;
};
const latest = values => values.filter(Boolean).sort().at(-1) ?? null;
const earliest = values => values.filter(Boolean).sort()[0] ?? null;
const terminalFailures = new Set(['failure', 'timed_out', 'action_required', 'startup_failure', 'stale']);

export function summarizeAttempt(attempt, jobs) {
  const measured = jobs.map(job => ({
    id: job.id, name: job.name, conclusion: job.conclusion, status: job.status,
    queueSeconds: seconds(job.created_at, job.started_at),
    durationSeconds: seconds(job.started_at, job.completed_at),
    startedAt: job.started_at, completedAt: job.completed_at,
    // Labels are public scheduling metadata; no runner identity or environment values are emitted.
    labels: job.labels ?? [],
    steps: (job.steps ?? []).map(step => ({
      name: step.name, conclusion: step.conclusion,
      durationSeconds: seconds(step.started_at, step.completed_at),
    })),
  }));
  const conclusions = measured.map(job => job.conclusion);
  // Skipped jobs are not counted as passing tests. They can be intentional conditional jobs.
  const outcome = conclusions.some(value => terminalFailures.has(value)) ? 'failure'
    : conclusions.includes('cancelled') ? 'cancelled'
    : measured.length === 0 || measured.some(job => job.status !== 'completed') ? 'incomplete'
    : conclusions.some(value => !['success', 'skipped'].includes(value)) ? 'unknown'
    : conclusions.includes('success') ? 'success' : 'skipped';
  const durations = measured.map(job => job.durationSeconds);
  return {
    attempt, outcome, jobs: measured,
    executedRunnerMinutes: round(sum(durations) / 60),
    roundedJobMinutes: sum(durations.filter(Number.isFinite).map(value => Math.ceil(value / 60))),
    jobWindowSeconds: seconds(earliest(measured.map(job => job.startedAt)), latest(measured.map(job => job.completedAt))),
    maxQueueSeconds: measured.length ? Math.max(...measured.map(job => job.queueSeconds ?? 0)) : null,
    timingComplete: measured.every(job => job.status === 'completed' && job.durationSeconds !== null),
  };
}

export function summarizeRun(run, attempts, artifacts) {
  const allJobs = attempts.flatMap(attempt => attempt.jobs);
  const first = attempts.find(attempt => attempt.attempt === 1);
  const last = attempts.at(-1);
  const finish = latest(last?.jobs.map(job => job.completedAt) ?? []);
  const retries = attempts.flatMap((attempt, index) => attempt.jobs.filter(job =>
    job.conclusion === 'success' && attempts.slice(0, index).some(earlier =>
      earlier.jobs.some(previous => previous.name === job.name && terminalFailures.has(previous.conclusion)))));
  return {
    id: run.id, url: run.html_url, workflow: run.name, event: run.event,
    headSha: run.head_sha, headBranch: run.head_branch, conclusion: run.conclusion,
    createdAt: run.created_at, completedAt: run.status === 'completed' ? finish : null,
    elapsedSeconds: run.status === 'completed' ? seconds(run.created_at, finish) : null,
    firstAttemptOutcome: first?.outcome ?? 'unavailable', runAttempts: run.run_attempt,
    // A failed job passing on rerun is a retry recovery signal, not proof of a flaky test.
    recoveredJobNames: [...new Set(retries.map(job => job.name))],
    runnerMinutes: round(sum(allJobs.map(job => job.durationSeconds)) / 60),
    roundedJobMinutes: sum(attempts.map(attempt => attempt.roundedJobMinutes)),
    artifacts: artifacts.map(artifact => ({
      id: artifact.id, name: artifact.name, sizeBytes: artifact.size_in_bytes,
      expired: artifact.expired, createdAt: artifact.created_at, expiresAt: artifact.expires_at,
    })),
    artifactBytes: sum(artifacts.map(artifact => artifact.size_in_bytes)),
    attempts,
  };
}

export function buildReport(repository, runs, { baseline = null, selection = null } = {}) {
  const eligible = runs.filter(run => ['success', 'failure'].includes(run.firstAttemptOutcome));
  const successful = eligible.filter(run => run.firstAttemptOutcome === 'success');
  const suiteGroups = new Map();
  for (const run of runs) for (const attempt of run.attempts) for (const job of attempt.jobs) {
    for (const step of job.steps) {
      if (!Number.isFinite(step.durationSeconds)) continue;
      const key = `${run.workflow} / ${job.name} / ${step.name}`;
      const durations = suiteGroups.get(key) ?? [];
      durations.push(step.durationSeconds); suiteGroups.set(key, durations);
    }
  }
  const slowestSteps = [...suiteGroups].map(([name, values]) => ({
    name, samples: values.length, medianSeconds: median(values),
    minSeconds: Math.min(...values), maxSeconds: Math.max(...values),
  })).sort((a, b) => b.medianSeconds - a.medianSeconds);
  const report = {
    schemaVersion: 1, repository, observedAt: new Date().toISOString(), runs,
    summary: {
      runCount: runs.length, firstAttemptEligible: eligible.length,
      firstAttemptPassRate: eligible.length ? successful.length / eligible.length : null,
      cancelledFirstAttempts: runs.filter(run => run.firstAttemptOutcome === 'cancelled').length,
      otherFirstAttempts: runs.length - eligible.length - runs.filter(run => run.firstAttemptOutcome === 'cancelled').length,
      retriedRuns: runs.filter(run => run.runAttempts > 1).length,
      recoveredJobs: runs.reduce((total, run) => total + run.recoveredJobNames.length, 0),
      totalRunnerMinutes: round(sum(runs.map(run => run.runnerMinutes))),
      totalRoundedJobMinutes: sum(runs.map(run => run.roundedJobMinutes)),
      medianElapsedSeconds: median(runs.map(run => run.elapsedSeconds)),
      totalArtifactBytes: sum(runs.map(run => run.artifactBytes)),
    },
    slowestSteps,
    selection,
    limitations: [
      'Read-only measurements are not a pass/fail gate or reusable release attestation.',
      'Workflow elapsed includes scheduling and dependency waits; job window is observed critical-path elapsed, not reconstructed DAG CPU time.',
      'Job queue includes dependency scheduling; jobs with missing timestamps remain unmeasured.',
      'Rounded job minutes estimate per-job rounding only. Hosted plan allowances, OS multipliers, runner sizes and actual charges are unknown.',
      'A failed attempt followed by a successful retry is reported separately; it does not establish the cause or a test-level flake rate.',
      'Artifacts describe those still listed by GitHub at observation time; deletion and retention affect historical size comparisons.',
      'Selection receipts are reported as supplied and confer no authority to skip required checks.',
    ],
  };
  if (baseline) {
    if (baseline.schemaVersion !== 1 || baseline.repository !== repository) throw new Error('Baseline repository/schema mismatch');
    const percent = (current, old) => Number.isFinite(current) && Number.isFinite(old) && old > 0 ? round((current - old) * 100 / old) : null;
    report.comparison = {
      baselineRunIds: baseline.runs.map(run => run.id),
      medianElapsedPercentChange: percent(report.summary.medianElapsedSeconds, baseline.summary.medianElapsedSeconds),
      meanRunnerMinutesPercentChange: percent(report.summary.totalRunnerMinutes / runs.length, baseline.summary.totalRunnerMinutes / baseline.runs.length),
      meanArtifactBytesPercentChange: percent(report.summary.totalArtifactBytes / runs.length, baseline.summary.totalArtifactBytes / baseline.runs.length),
      caution: 'Compare equivalent source, suite selection, runner class and event. These deltas do not establish coverage equivalence.',
    };
  }
  return report;
}

const escapeCell = value => String(value ?? 'unknown').replaceAll('|', '\\|').replaceAll('\n', ' ');
export function markdown(report) {
  const lines = ['## CI performance observations', '',
    '| Run | Event | First attempt | Elapsed min | Runner min (all attempts) | Artifacts MiB |',
    '| --- | --- | --- | ---: | ---: | ---: |'];
  for (const run of report.runs) lines.push(`| [${run.id}](${run.url}) | ${escapeCell(run.event)} | ${run.firstAttemptOutcome} | ${run.elapsedSeconds === null ? 'pending' : round(run.elapsedSeconds / 60)} | ${run.runnerMinutes} | ${round(run.artifactBytes / 1048576)} |`);
  const summary = report.summary;
  lines.push('', `First-attempt pass rate: ${summary.firstAttemptPassRate === null ? 'unknown' : round(summary.firstAttemptPassRate * 100) + '%'} of ${summary.firstAttemptEligible} completed decisive runs; ${summary.cancelledFirstAttempts} cancellations and ${summary.otherFirstAttempts} other outcomes reported separately. ${summary.retriedRuns} retried runs; ${summary.recoveredJobs} jobs passed after earlier failure.`, '',
    '| Slowest step | Samples | Median sec | Min–max sec |', '| --- | ---: | ---: | ---: |');
  for (const step of report.slowestSteps.slice(0, 20)) lines.push(`| ${escapeCell(step.name)} | ${step.samples} | ${step.medianSeconds} | ${step.minSeconds}–${step.maxSeconds} |`);
  if (report.comparison) lines.push('', `Comparison with ${report.comparison.baselineRunIds.join(', ')}: median elapsed ${report.comparison.medianElapsedPercentChange ?? 'unknown'}%; mean runner minutes ${report.comparison.meanRunnerMinutesPercentChange ?? 'unknown'}%; mean artifact bytes ${report.comparison.meanArtifactBytesPercentChange ?? 'unknown'}%. ${report.comparison.caution}`);
  if (report.selection) lines.push('', 'Selection/reuse receipt (descriptive only):', '', '```json', JSON.stringify(report.selection, null, 2), '```');
  lines.push('', ...report.limitations.map(line => `- ${line}`), '');
  return lines.join('\n');
}

export function collectRun(repository, id, api) {
  const base = `repos/${repository}/actions/runs/${id}`;
  const run = api(base);
  if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) throw new Error('Invalid run attempt count');
  const pages = (endpoint, key) => {
    const output = [];
    for (let page = 1; page <= 100; page++) {
      const response = api(`${endpoint}?per_page=100&page=${page}`);
      if (!Array.isArray(response[key])) throw new Error(`Missing ${key}`);
      output.push(...response[key]);
      if (response[key].length < 100) return output;
    }
    throw new Error('Pagination limit reached; refusing an incomplete report');
  };
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    attempts.push(summarizeAttempt(attempt, pages(`${base}/attempts/${attempt}/jobs`, 'jobs')));
  }
  return summarizeRun(run, attempts, pages(`${base}/artifacts`, 'artifacts'));
}

function main(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--repository', '--runs', '--out', '--baseline', '--summary', '--selection'].includes(key) || !argv[index + 1] || args[key]) throw new Error('Usage: report-performance.mjs --repository OWNER/REPO --runs ID[,ID] --out FILE [--baseline FILE] [--summary FILE] [--selection FILE]');
    args[key] = argv[index + 1];
  }
  const repository = args['--repository'];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Explicit owner/repository required');
  const ids = args['--runs']?.split(',') ?? [];
  if (!ids.length || ids.length > 100 || ids.some(id => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length || !args['--out']) throw new Error('One to 100 unique numeric run IDs and --out are required');
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const runs = ids.map(id => collectRun(repository, id, api));
  const report = buildReport(repository, runs, {
    baseline: args['--baseline'] ? JSON.parse(readFileSync(args['--baseline'], 'utf8')) : null,
    selection: args['--selection'] ? JSON.parse(readFileSync(args['--selection'], 'utf8')) : null,
  });
  mkdirSync(dirname(resolve(args['--out'])), { recursive: true });
  writeFileSync(args['--out'], JSON.stringify(report, null, 2) + '\n');
  if (args['--summary']) appendFileSync(args['--summary'], markdown(report));
  process.stdout.write(markdown(report));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`CI performance report failed: ${error.message}`); process.exitCode = 1; }
}
