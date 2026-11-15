# Child-led one-button build: implementation contract

Tracked by [Issue #4](https://github.com/jzwyrzyk/family-game-factory/issues/4).

## Truthful operating modes
1. `local`: no network and no LLM. Only validated changes supported by the mechanics schema. Must update playable game, not just a concept card.
2. `remote`: secure authenticated job queue and real coding agent. UI displays progress only after a job ID is acknowledged.
3. `unavailable`: do not show a working "AI build" button, suggest copying to Codex, or fabricate a queued job. Child can keep playing and save a private draft.

## User flow
Choose game or new game -> type/speak idea -> Try It -> local mechanic match OR remote build -> preview -> play -> keep, undo, revise, fork. Child can return later; saved versions survive reload. The factory may ask one short design-coach question after play; skip always available.

## Job contract
`POST /v1/jobs` body: `{gameId, baseRevisionId, prompt, clientRequestId}` -> `{jobId, status:"queued"}`.
`GET /v1/jobs/:id` -> `{jobId, status, phase?, revisionId?, childMessage?, errorCode?}`.
`POST /v1/jobs/:id/cancel` -> acknowledgement.
`GET /v1/revisions/:id/preview` -> scoped preview capability (not raw public credentials).
All endpoints require family-scoped authorization, validation, rate limits and audit records. Requests are idempotent by family/clientRequestId.

## Job lifecycle
`queued -> building -> testing -> ready`; any nonterminal -> `failed|cancelled`. Revisions immutable; keep/undo changes active pointer only. No failed build can replace active revision.

## Agent contract
`AgentAdapter.generate({gameManifest, baseRevision, childIntent, allowedCapabilities, budget}) -> candidateArtifact`.
Adapters must not get cloud credentials or unrestricted repository write access. `MockAgent` for tests, paid API adapter only when funded. A ChatGPT/Codex subscription is **not** a general-purpose callable API. Validate any unattended Codex integration against actual auth/entitlements and cost before claiming it works.

## Security gates
Authenticated parent-managed family membership; child pseudonyms; private drafts; no public GitHub issues containing child prompts; server-side secrets; worker and preview sandboxing; static analysis plus browser smoke tests; CPU/time/token limits; allowlisted assets and network; manual recovery switch; release rollback.

## Cost
Default paid jobs disabled. Parent opts in to monthly usage allowance and per-job model budget. Cloud budget alerts are not hard caps. Meter model tokens and worker time, stop accepting jobs at threshold. Static local remixes stay free.

## Compatibility
Existing README describes one-file static arcade and localStorage `family-game-factory-state-v1` backup. Migrate without loss; maintain three games, learning/profile separation and Playwright tests.

## First acceptance test
Five consecutive changes from child UI with real mechanic effects, undo, compare, fork, reload, and no GitHub/Codex/manual upload steps. Include a novel mechanic via mock adapter; do not label mock output as real AI generation.
