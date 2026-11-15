# Family Game Factory 2.0 foundation

A child-led local game-design loop built on the Family Arcade. See [Issues #3/#4 traceability](docs/requirements-traceability.md), [gaps](docs/gap-analysis.md) and the [implementation charter](docs/factory-v2-implementation-charter.md).

## Run locally

Node 22 or newer:

```sh
npm ci
npm run dev
```

Use the printed local URL. Vite serves the TypeScript modules; opening raw `index.html` as a file is no longer supported. `npm run build` typechecks and produces a static `dist/` site. No runtime server or provider key is needed.

## Try Live Remix

1. Open **Remix**, start a Splash or Pass remix, and **Play this version**.
2. After playing, go **Back to Live Remix**. Reflect or skip; optionally predict what your next change will do.
3. Type **Give me four buckets**, press **Try It**. Four selectable buckets really appear. Try **Show the safe bucket**, **Make the splash last 1 second**, **Hide the safe bucket**, or **Give me two buckets**.
4. Use **Undo last change**, or expand **Compare versions & save a new game** to compare/play/restore versions. Name and **Save as new game**; reopen it from **My Creations** after reload.

Each local Try saves an immutable private version on this browser; Keep pins a version. A connected secure builder can handle unsupported requests through a real acknowledged queue. The default configuration says “Needs builder” without pretending to queue anything. New-game Create has a one-button Try It action; remote previews can be played, kept, compared, revised, undone, forked and reopened from the family catalog. Undo retains alternate futures. Builder supports matching-piece highlights and extra decoys; Dragon supports hearts and breath speed. Game changes never change parent math difficulty. These are bounded local language rules, not an AI service. Unfamiliar mechanics are reported as unsupported and may be saved only as ideas, never represented as generated playable games.

**Play** retains all three existing games and presets. **Create** still saves new game ideas. **My Powers** retains the adaptive math practice. Grown-ups can use the footer for settings and JSON backups. There is no secure local parental login or cross-device sync.

## Storage and backups

- Existing `family-game-factory-state-v1` math/profile/idea data remains compatible and is not migrated away or cleared.
- New private workspace key: `family-game-factory-workspace-v2`. A versioned pre-release v1 game-list fixture migrates to the revision DAG; corrupt/unknown data is left intact and an error is shown. Original arcade play remains available.
- Parent JSON export includes optional `factoryWorkspace`; old progress-only backups still restore. Restoring an old backup preserves an existing remix workspace; restoring a combined backup replaces both stores. Keep backups private; they can contain learning history and child-written text.
- Writes are bounded (50 projects, 500 revisions, 1000 plays). Failed revisions retain the typed request and last working game; no automatic pruning. Clearing browser data or changing origins loses local data without a backup.

## Tests

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Strict TypeScript check, Vite production build, unit/contract tests, original v0.3 browser journeys and desktop/mobile five-iteration remix journeys run in CI on pinned Ubuntu 24.04. System Chromium is used when installed; otherwise Playwright's Chromium is used. `CHROMIUM_PATH` overrides it. Tests serve built assets under a repository-style `/arcade/` path and create synthetic screenshots in `test-results/`.

## GitHub Pages and cloud limits

The source now requires a Vite build. After review/merge, choose **GitHub Actions** as the repository's Pages source, then manually dispatch **Build reviewed Pages site** on `main` to publish `dist/`. The workflow refuses other branches. PR test runs never deploy. Existing live Pages content stays untouched until that explicit action. Relative asset URLs support repository subpaths.

`server/` contains typed managed-service ports plus an authenticated, budget-limited reference job API/worker, private preview renderer and OpenAPI spec. A durable single-process file adapter and a clearly labeled mock agent are exercised by tests. No production backend, identity provider, real coding-agent adapter or cloud resource is configured/deployed. See [pipeline](docs/agent-pipeline.md) and [Codex research](docs/codex-agent-research.md). Arbitrary generated JS is not accepted; the mock produces a genuine new star-catching mechanic through a closed declarative artifact. Arbitrary new mechanics, full original-game fidelity, offline PWA support and drawing workflows remain explicitly pending in the gap analysis.

Real-agent smoke testing is explicitly skipped: no verified funded production adapter/API exists here. Before adding a live smoke test, verify the destination, identity and billing authorization; do not export personal credentials to an arbitrary endpoint. No live-agent credentials are read by the test suite.
