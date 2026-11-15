/*
 * No-secret handoff from the children's local-only arcade to an adult's development workflow.
 * This module NEVER sends data automatically. Opening an issue is an explicit parent action.
 * Avoid child names, math responses, learning history, device identifiers and secrets in issues.
 */
(function () {
'use strict';
const FG = window.FG = window.FG || {};
const DEFAULT_REPOSITORY = 'jzwyrzyk/family-game-factory';
const VALID_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function repository(locationLike) {
  const loc = locationLike || window.location;
  try {
    const host = String(loc.hostname || '').toLowerCase();
    const parts = String(loc.pathname || '').split('/').filter(Boolean);
    if (host.endsWith('.github.io') && parts[0]) {
      const owner = host.slice(0, -'.github.io'.length);
      if (VALID_REPO.test(`${owner}/${parts[0]}`)) return `${owner}/${parts[0]}`;
    }
  } catch (_) { /* Offline/file pages intentionally fall back to the named repository. */ }
  return DEFAULT_REPOSITORY;
}
function formatIdea(idea) {
  const game = String(idea.game || 'new').slice(0, 40);
  const type = String(idea.type || 'feature').slice(0, 40);
  const text = String(idea.idea || '').slice(0, 1500);
  return [
    '## Child-led game-design idea',
    `**Game:** ${game}`,
    `**Feedback type:** ${type}`,
    '',
    '**What to change**',
    text,
    '',
    '## Development instructions',
    '- Ask the parent to approve any material game-design changes.',
    '- Preserve other approved game behavior and the shared math engine.',
    '- Make small, testable code changes and add or update regression tests.',
    '- Check mobile and keyboard interactions and win/lose/replay paths.',
    '- Create a pull request. Do not merge or publish automatically.',
    '',
    '_Parent: review this text for personal information before submitting publicly._'
  ].join('\n');
}
function issueUrl(idea, repositoryFullName) {
  const repo = repositoryFullName || repository();
  if (!VALID_REPO.test(repo)) throw Error('Invalid GitHub repository name');
  const title = `[Family Arcade] ${String(idea.game || 'new').slice(0, 32)} — ${String(idea.type || 'feature').slice(0, 32)}`;
  const url = new URL(`https://github.com/${repo}/issues/new`);
  url.searchParams.set('title', title);
  url.searchParams.set('body', formatIdea(idea));
  return url.toString();
}
function developmentBrief(ideas, repo) {
  const list = (ideas || []).slice(0, 20);
  return [
    `Work on the Family Game Factory source repository ${repo || repository()}.`,
    'Read AGENTS.md and .github/copilot-instructions.md before editing.',
    'Please triage these game ideas, recommend the smallest safe implementation, and then make a PR with code and tests once the parent approves scope.',
    'Do not edit or publish children\'s personal information or local learning data.',
    '',
    ...list.map((i, index) => `${index + 1}. ${i.game} (${i.type}): ${i.idea}`)
  ].join('\n');
}
FG.bridge = {repository, formatIdea, issueUrl, developmentBrief};
})();
