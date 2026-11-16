# Unified Studio — review candidate

Scope: architecture and child-facing interface only. Game mechanics, learning algorithms, worker security, credentials, billing and cloud activation are unchanged. Based on public repository main `9b7f1d201afea845ae9e3816ff7d6d285ba10b9b`.

## How to review

Run the repository's normal `npm ci` / `npm run dev`, then add `?studio=1` to the URL. The default entry point stays unchanged until the owner reviews the new experience. The query enables only this UI, NOT paid AI. No deployment was performed as part of this development.

## Implemented

- My Games library with existing local remix import, clear draft/playable/preview/building statuses, and continue-last-project.
- One desktop game-and-conversation studio; mobile Game/Talk/Versions panels stay in the same project.
- Persistent per-player/per-project conversation and unfinished prompt. Reopen without losing context.
- Local edits use the existing interpreter and mechanics validation. Try creates a separately persisted candidate; only Keep promotes it. Undo/redo, compare/play previous, and save-as-new are explicit.
- Construction snapshots are copied—not shared—into previews and forks. Existing game/learning host continues handling gameplay and math overlays.
- Optional post-play reflection and skip, anchored to an actual outcome. This is a local helper, not a newly connected conversational LLM.
- Remote requests reuse the existing BuilderClient, authentication cookies and validated preview-origin contract. Real queued state requires server acknowledgement. No signed preview URL is stored. Only scoped revision IDs are persisted; reopening requests a fresh preview capability.
- Unavailable and failed builds retain the draft and working game. Existing paid-generation configuration is untouched.
- Parent JSON export includes optional `factoryStudio`, alongside original progress and the latest revision workspace. Older backups remain accepted.

## Architecture boundaries

`notebook.ts`: validated UI-only state, bounded conversation/project storage, no secrets or code.
`adapter.ts`: current revision repository and immutable preview/copy semantics; re-reads canonical storage before mutations.
`ui.ts`: unified navigation and views, native game-host adapter, provider-independent request routing through the existing client.
`style.css`: namespaced visual layout, desktop/mobile, no replacements to individual game mechanics.

## Evidence and limits

- New studio modules pass local strict TypeScript compilation (available compiler 5.8.3).
- 17 local unit checks passed: per-profile separation, draft/reload, staged previews, independent copies, quota/corrupt data handling, stale-base protection, undo/redo, construction copying and unchanged math evidence.
- Desktop 1400px and mobile 390px local browser harness passed with the unchanged current construction engine: partial construction -> requested gum setting -> preview -> keep -> fork -> reopen/draft/history -> unavailable builder.
- Local browser navigation to network origins is blocked by the execution environment. Therefore local visual/harness checks use inlined modules, a StoragePort fixture and the source-matched construction module. They do NOT prove a production Vite deployment, live cross-device storage or real model generation.
- `tests/studio-journey.cjs` is the additional production-build CI gate, using the repo's existing dist server. It covers the five-change flow, actual game outcomes, real browser storage, and explicitly labeled remote transport fixtures. Full repository CI must pass before promotion.
- No new provider account, API key, model funding, private-worker changes or cloud deployment.
- Public release/sharing, drawing processing, learning-policy repair and expanded game mechanics remain outside this UI update.

## Release gate

Review the actual generated screenshots; run `npm test` including the new studio tests; leave the PR in draft until the production-build checks pass. Then merge/review and publish through the existing Pages process only when the owner approves. Promote the UI to default in a separate explicit change after review; preserve a simple return to the previous entry point.
