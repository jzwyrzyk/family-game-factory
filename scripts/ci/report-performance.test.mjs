import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, collectRun, markdown, summarizeAttempt, summarizeRun } from './report-performance.mjs';

const job = (name, conclusion = 'success', extra = {}) => ({
  id: 10, name, status: 'completed', conclusion,
  created_at: '2026-11-23T10:00:00Z', started_at: '2026-11-23T10:00:10Z', completed_at: '2026-11-23T10:01:20Z',
  steps: [{ name: 'Run suite', conclusion, started_at: '2026-11-23T10:00:20Z', completed_at: '2026-11-23T10:01:10Z' }], ...extra,
});
const run = extra => ({ id: 123, html_url: 'https://github.com/owner/repo/actions/runs/123', name: 'CI', event: 'pull_request',
  head_sha: 'a'.repeat(40), head_branch: 'test', status: 'completed', conclusion: 'success', run_attempt: 1,
  created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-24T10:00:00Z', ...extra });

test('parallel elapsed differs from cumulative runner minutes and mutable updated_at', () => {
  const result = summarizeRun(run(), [summarizeAttempt(1, [job('a'), job('b')])], [{ id: 1, name: 'proof', size_in_bytes: 100, expired: false }]);
  assert.equal(result.elapsedSeconds, 80);
  assert.equal(result.runnerMinutes, 2.33);
  assert.equal(result.roundedJobMinutes, 4);
  assert.equal(result.attempts[0].jobWindowSeconds, 70);
  assert.equal(result.attempts[0].maxQueueSeconds, 10);
  assert.equal(result.artifactBytes, 100);
});

test('failed first attempt stays failed after a successful targeted retry', () => {
  const attempts = [summarizeAttempt(1, [job('slow', 'failure'), job('other')]), summarizeAttempt(2, [job('slow')])];
  const result = summarizeRun(run({ run_attempt: 2 }), attempts, []);
  assert.equal(result.firstAttemptOutcome, 'failure');
  assert.deepEqual(result.recoveredJobNames, ['slow']);
  assert.equal(result.runnerMinutes, 3.5);
  const report = buildReport('owner/repo', [result]);
  assert.equal(report.summary.firstAttemptPassRate, 0);
  assert.equal(report.summary.retriedRuns, 1);
  assert.equal(report.summary.recoveredJobs, 1);
});

test('cancelled, incomplete, absent and all-skipped jobs do not count as first-attempt passes', () => {
  const outcomes = [summarizeAttempt(1, [job('a', 'cancelled')]), summarizeAttempt(1, [job('a', null, { status: 'in_progress', completed_at: null })]), summarizeAttempt(1, []), summarizeAttempt(1, [job('a', 'skipped')])];
  assert.deepEqual(outcomes.map(value => value.outcome), ['cancelled', 'incomplete', 'incomplete', 'skipped']);
  const report = buildReport('owner/repo', outcomes.map(attempt => summarizeRun(run(), [attempt], [])));
  assert.equal(report.summary.firstAttemptPassRate, null);
  assert.equal(report.summary.cancelledFirstAttempts, 1);
  assert.equal(report.summary.otherFirstAttempts, 3);
});

test('ongoing workflow and missing or reversed timestamps remain unknown', () => {
  const attempt = summarizeAttempt(1, [job('a', null, { status: 'in_progress', completed_at: null }), job('b', 'success', { created_at: null, completed_at: '2026-11-23T09:00:00Z' })]);
  const result = summarizeRun(run({ status: 'in_progress' }), [attempt], []);
  assert.equal(result.elapsedSeconds, null);
  assert.equal(result.completedAt, null);
  assert.equal(attempt.jobs[1].durationSeconds, null);
  assert.equal(attempt.jobs[1].queueSeconds, null);
  assert.equal(attempt.timingComplete, false);
});

test('pagination and every attempt are read without silently dropping job 101', () => {
  const visited = [];
  const api = endpoint => {
    visited.push(endpoint);
    if (endpoint.endsWith('/123')) return run({ run_attempt: 2 });
    if (endpoint.includes('/artifacts?')) return { artifacts: [] };
    if (endpoint.includes('/attempts/1/jobs?') && endpoint.endsWith('page=1')) return { jobs: Array.from({ length: 100 }, (_, i) => job(`j${i}`, i === 0 ? 'failure' : 'success')) };
    if (endpoint.includes('/attempts/1/jobs?')) return { jobs: [job('j100')] };
    if (endpoint.includes('/attempts/2/jobs?')) return { jobs: [job('j0')] };
    throw new Error(endpoint);
  };
  const result = collectRun('owner/repo', '123', api);
  assert.equal(result.attempts[0].jobs.length, 101);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.recoveredJobNames, ['j0']);
  assert.equal(visited.length, 5);
});

test('API failures and malformed pagination fail the report instead of inventing zero cost', () => {
  assert.throws(() => collectRun('owner/repo', '123', () => { throw new Error('403'); }), /403/);
  assert.throws(() => collectRun('owner/repo', '123', endpoint => endpoint.endsWith('/123') ? run() : {}), /Missing jobs/);
});

test('baseline comparisons reject unrelated repository and preserve estimate warnings', () => {
  const result = summarizeRun(run(), [summarizeAttempt(1, [job('one')])], []);
  const baseline = buildReport('owner/repo', [result]);
  assert.throws(() => buildReport('different/repo', [result], { baseline }), /mismatch/);
  const report = buildReport('owner/repo', [result], { baseline, selection: { category: 'docs', reason: 'plain text only', evidence: null } });
  assert.equal(report.comparison.medianElapsedPercentChange, 0);
  assert.equal(report.selection.category, 'docs');
  assert.match(markdown(report), /actual charges are unknown/);
  assert.match(markdown(report), /does not establish the cause/);
});
