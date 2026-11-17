# Family Game Factory 2.0 — Studio-first homepage

A child-led local game-design loop built on the Family Arcade. See [Assignment 002](docs/assignment-002/README.md), [Issues #3/#4 traceability](docs/requirements-traceability.md), [gaps](docs/gap-analysis.md) and the [implementation charter](docs/factory-v2-implementation-charter.md).

## Studio-first homepage (review PR)

The normal website route enters the child's **Studio library**, not the separate Arcade wizard. Six Factory Favorites, a clear **Invent a game** action, recent work, and saved creations lead into one Studio experience. The original Arcade remains available through `?arcade=1` for comparison or rollback; `?studio=1` remains a supported Studio alias. When the builder is unavailable, the homepage accurately describes ideas as saveable rather than promising a generated game. This changes frontend entry and presentation only: **no paid AI, remote services, or public sharing are activated**. GitHub Pages publishing remains manual.

## Integrated child journey review

The [child journey standard](docs/child-journey/README.md) combines the grades 1–4 learning service, physical games, and child-owned Studio. It adds play-first navigation, repeatable help, protected math focus, explicit ready previews, and durable ideas through asynchronous replies and save failures. Review with `?studio=1`; [acceptance](docs/child-journey/acceptance.md) distinguishes automated evidence from the remaining educator/child/device review. The live site and paid activation are unchanged.

## Child continuity & six Factory Favorites draft

In the optional review Studio (`?studio=1`), **Factory Favorites** now lists six distinct native games: Bubble Gum Builders, Junkyard Rally, Splash or Pass, Dragon Island Rescue, Moon Donut Dash, and Robot Route Lab. New Moon/Robot play supports native safe math pause/resume, and device-local mission/route recovery. Novel AI builds are still disabled by the public config.

While a private build is pending, children can keep playing, open any favorite, use optional extra practice in My Powers, and make independent local quick edits on the same project without clearing the background job. A nonmodal build shelf shows acknowledged status across Studio. The composer accepts a bounded set of up to four known local mechanics updates in one atomic test. Unfamiliar edits still require an approved AI worker; there is no fake starter game, no automatic promotion and no crowdsourced publication.

Read the [implementation and release limitations](docs/child-continuity/README.md). This remains an unmerged draft reviewed in [PR #25](https://github.com/jzwyrzyk/family-game-factory/pull/25), not a change to the live site. Observed child enjoyment and live provider latency have not been established.

## Adaptive Math v1 draft

The grades 1–4 learning implementation is documented in [Adaptive Math v1](docs/adaptive-math/README.md), with a [73-unit coverage catalog](docs/adaptive-math/curriculum.md), [game integration contracts](docs/adaptive-math/integration.md), and [acceptance evidence](docs/adaptive-math/acceptance.md). It shares learning across games, keeps math enabled, separates independent and assisted work, and supports checkpoints and mathematical answer construction. It builds on the optional Studio draft (`?studio=1`) and also works in the ordinary arcade.

## Game Quality v1

The [Game Quality standard](docs/GAME-QUALITY.md) defines the physical-play implementation. The [validation report](docs/game-quality/VALIDATION.md) records source pins, tests, screenshots, measurements, and remaining release checks. New Bubble Gum Builders games use a real construction simulation with ten household parts, breakable gum, three missions and free play. Junkyard Rally adds wheel suspension, terrain, throttle/brake, three trails, and handling changes saved as experiments. Both use local toy artwork, music and effects; gameplay makes no model requests.

Start a physical game, then choose **Improve this game** or a garage change. Try **Make wheels bigger**, **Make springs softer**, **Make car lighter**, **Make joints stronger**, or **Make fan stronger**. The build or ride carries into the new version. Compare, Keep, undo, or save a different game. Older saved gum versions keep their original engine. Drawing decomposition has a validated component/rig contract and remains a separate branch.

The generated-game pipeline also has a versioned v2 contract for trusted physics, illustrated parts, camera movement, pointer dragging, sound and 60 Hz fixed stepping. The engine and artwork are immutable approved packages separate from the model's 30 KB source allowance; saved v1 games retain their original contract. V2 smoke tests require an input-dependent scene response and clean replay/pause, while allowing ordinary losses and endless construction. Authored fixtures test specific physical goals. Automated checks do not establish child enjoyment or a hard per-game browser JavaScript memory cap. Paid generation and production acceptance remain behind the existing approval and isolated-worker controls.

## Run locally

Node 22 or newer:

```sh
npm ci
npm run dev
```

Use the printed local URL. Add `?studio=1` to use the integrated play-and-design Studio review route; the default arcade and its saved games remain available. Vite serves the TypeScript modules; opening raw `index.html` as a file is no longer supported. `npm run build` typechecks and produces a static `dist/` site. No runtime server or provider key is needed.

The [device and play review guide](docs/game-quality/PLAY_REVIEW.md) explains how to try the reviewed build on a phone or tablet and record specific usability or performance observations. It is a blank guide, not evidence of completed child testing.

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

Strict TypeScript check, Vite production build, unit/contract tests, original v0.3 browser journeys and desktop/mobile five-iteration remix journeys run in CI on pinned Ubuntu 24.04. CI always uses the Playwright-pinned Chromium installed by the workflow. Local runs may use system Chromium when installed; otherwise Playwright's Chromium is used. `CHROMIUM_PATH` overrides it. Tests serve built assets under a repository-style `/arcade/` path and capture browser screenshots from authored test fixtures in `test-results/`.

## GitHub Pages and cloud limits

The source now requires a Vite build. After review/merge, choose **GitHub Actions** as the repository's Pages source, then manually dispatch **Build reviewed Pages site** on `main` to publish `dist/`. The workflow refuses other branches. PR test runs never deploy. Existing live Pages content stays untouched until that explicit action. Relative asset URLs support repository subpaths.

`server/` contains typed managed-service ports, an authenticated and budget-limited job API, private preview rendering and an OpenAPI spec. Tests use durable local storage, declared mock agents and authored provider responses. The source-generation adapter and its isolated build/test path are described below; the default local app needs neither an account nor a model key. Generated code is accepted only through the approved pipeline and its versioned preview contract. It is never executed in the gateway process or inserted as arbitrary page HTML. This branch does not activate provider billing or deploy cloud resources. See the [pipeline](docs/agent-pipeline.md), [current quality contract](docs/GAME-QUALITY.md) and [Codex research](docs/codex-agent-research.md) for scope and evidence; physical drawing decomposition and playable-rig import remain separate work.

Real-agent smoke testing is explicitly skipped: no verified funded production adapter/API exists here. Before adding a live smoke test, verify the destination, identity and billing authorization; do not export personal credentials to an arbitrary endpoint. No live-agent credentials are read by the test suite.

## Assignment 002: private source generation through Actions

The preferred path is now implemented as **website → authenticated GCP gateway → GitHub Actions → generated TypeScript → isolated build/test/repair → private preview**. It reuses the existing jobs, revisions, signed preview, keep/undo/fork, authentication and child UI contracts. A real metered OpenAI Responses coding adapter runs only in the Actions generation job; compilation/play runs in a different gVisor job without the model key. Reviewed immutable worker tags, stage-bound OIDC and private callbacks keep prompts/source out of public workflow inputs/artifacts. Subscription-based Codex entitlement remains unverified and disabled.

The default website configuration and paid activation remain **off**. No provider key, funded account, GitHub App, runner or GCP service is provisioned by this PR. Account-owner actions, pricing assumptions, evidence and remaining limits are in [setup](docs/assignment-002/owner-setup.md), [costs](docs/assignment-002/cost-estimate.md) and [evidence](docs/assignment-002/evidence.md); pricing must be reviewed before activation. No real inference is claimed from the mocked E2E. Full container smoke requires an explicitly provisioned immutable image and gVisor runtime. A successful ordinary CI run does not replace that gate.

`npm test` includes the original games/data regressions plus five source-generation/revision requests on desktop/mobile through mocked Actions and fixture provider responses, automatic repair, private preview, and worker containment probes. Quality suites add the physical workshop, driving game and authored generated-v2 cases. `npm run test:sandbox` separately requires an explicitly supplied immutable worker image and gVisor Docker socket. It never silently executes arbitrary generated source on the host. V1 source games use the original primitive canvas API. V2 adds approved illustrated sprites, bounded Planck capabilities, camera and local synthesis; neither contract admits arbitrary HTML, remote assets or imported packages from generated source.
