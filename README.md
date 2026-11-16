# Family Game Factory 2.0 foundation

A child-led local game-design loop built on the Family Arcade. See [Assignment 002](docs/assignment-002/README.md), [Issues #3/#4 traceability](docs/requirements-traceability.md), [gaps](docs/gap-analysis.md) and the [implementation charter](docs/factory-v2-implementation-charter.md).

## Game Quality v1

The [Game Quality standard](docs/GAME-QUALITY.md) defines the physical-play implementation and its acceptance evidence. New Bubble Gum Builders games use a real construction simulation with ten household parts, breakable gum, three missions and free play. Junkyard Rally adds wheel suspension, terrain, throttle/brake, three trails, and handling changes saved as experiments. Both use local toy artwork, music and effects; gameplay makes no model requests.

Start a physical game, then choose **Improve this game** or a garage change. Try **Make wheels bigger**, **Make springs softer**, **Make car lighter**, **Make joints stronger**, or **Make fan stronger**. The build or ride carries into the new version. Compare, Keep, undo, or save a different game. Older saved gum versions keep their original engine. Drawing decomposition has a validated component/rig contract and remains a separate branch.

The generated-game pipeline also has a versioned v2 contract for trusted physics, illustrated parts, camera movement, pointer dragging, sound and 60 Hz fixed stepping. The engine and artwork are immutable approved packages separate from the model's 30 KB source allowance; saved v1 games retain their original contract. V2 smoke tests require an input-dependent scene response and clean replay/pause, while allowing ordinary losses and endless construction. Authored fixtures test specific physical goals. Automated checks do not establish child enjoyment or a hard per-game browser JavaScript memory cap. Paid generation and production acceptance remain behind the existing approval and isolated-worker controls.

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

Each local Try saves an immutable private version on this browser; Keep pins a version. A connected secure builder can handle unsupported requests through a real acknowledged queue. The default configuration says “Needs builder” without pretending to queue anything. New-game Create has a one-button Try It action; remote previews can be played, kept, compared, revised, undone, forked and reopened from the family catalog. Undo retains alternate futures. The physical workshop exposes gum supply, joint strength, gravity and fan power; Rally exposes motor, suspension, wheel size, body weight and grip. Restored Dragon exposes island resilience, fireball cadence and shield timing. Earlier saved engines retain their own controls. Game changes never change parent math difficulty. These are bounded local language rules, not an AI service. Unfamiliar mechanics are reported as unsupported and may be saved only as ideas, never represented as generated playable games.

**Play** includes four games and retains saved earlier engines and presets. **Create** still saves new game ideas. **My Powers** retains the adaptive math practice. Grown-ups can use the footer for settings and JSON backups. There is no secure local parental login or cross-device sync.

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

Strict TypeScript check, Vite production build, unit/contract tests, original v0.3 browser journeys and desktop/mobile five-iteration remix journeys run in CI on pinned Ubuntu 24.04. CI always uses the Playwright-pinned Chromium installed by the workflow. Local runs may use system Chromium when installed; otherwise Playwright's Chromium is used. `CHROMIUM_PATH` overrides it. Tests serve built assets under a repository-style `/arcade/` path and create synthetic screenshots in `test-results/`.

## GitHub Pages and cloud limits

The source now requires a Vite build. After review/merge, choose **GitHub Actions** as the repository's Pages source, then manually dispatch **Build reviewed Pages site** on `main` to publish `dist/`. The workflow refuses other branches. PR test runs never deploy. Existing live Pages content stays untouched until that explicit action. Relative asset URLs support repository subpaths.

`server/` contains typed managed-service ports, an authenticated and budget-limited job API, private preview rendering and an OpenAPI spec. Tests use durable local storage, declared mock agents and authored provider responses. The source-generation adapter and its isolated build/test path are described below; the default local app needs neither an account nor a model key. Generated code is accepted only through the approved pipeline and its versioned preview contract. It is never executed in the gateway process or inserted as arbitrary page HTML. This branch does not activate provider billing or deploy cloud resources. See the [pipeline](docs/agent-pipeline.md), [current quality contract](docs/GAME-QUALITY.md) and [Codex research](docs/codex-agent-research.md) for scope and evidence; drawing decomposition and private drawing import remain separate work.

Real-agent smoke testing is explicitly skipped: no verified funded production adapter/API exists here. Before adding a live smoke test, verify the destination, identity and billing authorization; do not export personal credentials to an arbitrary endpoint. No live-agent credentials are read by the test suite.

## Assignment 002: private source generation through Actions

The preferred path is now implemented as **website → authenticated GCP gateway → GitHub Actions → generated TypeScript → isolated build/test/repair → private preview**. It reuses the existing jobs, revisions, signed preview, keep/undo/fork, authentication and child UI contracts. A real metered OpenAI Responses coding adapter runs only in the Actions generation job; compilation/play runs in a different gVisor job without the model key. Reviewed immutable worker tags, stage-bound OIDC and private callbacks keep prompts/source out of public workflow inputs/artifacts. Subscription-based Codex entitlement remains unverified and disabled.

The default website configuration and paid activation remain **off**. No provider key, funded account, GitHub App, runner or GCP service is provisioned by this PR. Account-owner actions, pricing assumptions, evidence and remaining limits are in [setup](docs/assignment-002/owner-setup.md), [costs](docs/assignment-002/cost-estimate.md) and [evidence](docs/assignment-002/evidence.md); pricing must be reviewed before activation. No real inference is claimed from the mocked E2E. Full container smoke requires an explicitly provisioned immutable image and gVisor runtime. A successful ordinary CI run does not replace that gate.

`npm test` includes the original games/data regressions plus five source-generation/revision requests on desktop/mobile through mocked Actions and fixture provider responses, automatic repair, private preview, and worker containment probes. Quality suites add the physical workshop, driving game and authored generated-v2 cases. `npm run test:sandbox` separately requires an explicitly supplied immutable worker image and gVisor Docker socket. It never silently executes arbitrary generated source on the host. V1 source games use the original primitive canvas API. V2 adds approved illustrated sprites, bounded Planck capabilities, camera and local synthesis; neither contract admits arbitrary HTML, remote assets or imported packages from generated source.
