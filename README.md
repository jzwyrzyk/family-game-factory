# jems · Game Maker (formerly Family Game Factory)

jems is a child-led game creation and learning workshop built on the Family Arcade. Children play, describe a change, try a real experiment, compare versions and explicitly keep the one they choose.

## Start here

| Reference | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Context to load before project questions and development |
| [Product doctrine](PRODUCT-DOCTRINE.md) | Intent, principles and non-negotiables |
| [Current architecture](ARCHITECTURE-CURRENT.md) | Components, contracts, storage and trust boundaries |
| [Delivery state](DELIVERY-STATE.md) | Dated implementation, merge, release and verification evidence |
| [Documentation map](docs/README.md) | Feature contracts, decisions and historical sources |
| [Maintenance process](docs/context/MAINTENANCE.md) | Per-change reviews and automatic drift checks |

This README describes the source capabilities. Consult the delivery ledger and current service evidence for what is actually live.

## Studio-first homepage

The normal website route enters the child's **Studio library**, not the separate Arcade wizard. Six Factory Favorites, a clear **Invent a game** action, recent work, and saved creations lead into one Studio experience. The original Arcade remains available through `?arcade=1` for comparison or rollback; `?studio=1` remains a supported Studio alias. When the builder is unavailable, the homepage accurately describes ideas as saveable rather than promising a generated game. Frontend navigation does not activate providers or publish a release. GitHub Pages publishing is a separate manual workflow in this source baseline.

## Integrated child journey

The [child journey standard](docs/child-journey/README.md) combines the grades 1–4 learning service, physical games, and child-owned Studio. It adds play-first navigation, repeatable help, protected math focus, explicit ready previews, and durable ideas through asynchronous replies and save failures. [Acceptance](docs/child-journey/acceptance.md) distinguishes automated evidence from educator, child and actual-device review. Live release status belongs in [delivery state](DELIVERY-STATE.md).

## Create & code

The separate **Create & code** page (`?creation=1`) combines free scene creation with **Rebuild a scene** practice. Children move, jump, speak through bubbles, dance, repeat actions, branch on conditions, and respond to taps or signals using editable blocks. The same stage and interpreter power both modes. Five open challenges check actual trajectories, order, repetition, event responses, and conditional behavior; equivalent programs can succeed.

**Animate & code** carries a saved Dragon, Buckets, or Robot game into a new scene pinned to that source version, with its reviewed artwork and supported settings. New generated games may include a validated optional companion scene; older generated source is not automatically converted. Scenes have profile-separated drafts, immutable versions, explicit Keep, backups, editable JSON export, and supported silent video export. Host Math/Language checkpoints still apply. Read the [feature contract and limitations](docs/creation-studio/README.md) and [accepted decision](docs/decisions/0007-creation-and-rebuild-practice.md).

## Child continuity and six Factory Favorites

In the integrated Studio, **Factory Favorites** now lists six distinct native games: Bubble Gum Builders, Junkyard Rally, Splash or Pass, Dragon Island Rescue, Moon Donut Dash, and Robot Route Lab. New Moon/Robot play supports native safe math pause/resume, and device-local mission/route recovery. Remote build availability depends on the configured service, authenticated session and server-side gates; a URL alone does not establish readiness.

While a private build is pending, children can keep playing, open any favorite, use optional extra practice in My Powers, and make independent local quick edits on the same project without clearing the background job. A nonmodal build shelf shows acknowledged status across Studio. The composer accepts a bounded set of up to four known local mechanics updates in one atomic test. Unfamiliar edits still require an approved AI worker; there is no fake starter game, no automatic promotion and no crowdsourced publication.

Read the [implementation and release limitations](docs/child-continuity/README.md). [PR25](https://github.com/jzwyrzyk/family-game-factory/pull/25) is merged. Historical review reports retain their original evidence limits; code integration does not establish observed child enjoyment or live provider latency.

## Adaptive learning

The grades 1–4 learning implementation is documented in [Adaptive Math v1](docs/adaptive-math/README.md), with a [73-unit coverage catalog](docs/adaptive-math/curriculum.md), [game integration contracts](docs/adaptive-math/integration.md), and [acceptance evidence](docs/adaptive-math/acceptance.md). It shares learning across games, keeps math enabled, separates independent and assisted work, and supports checkpoints and mathematical answer construction. The integrated Studio and original arcade use the host learning services. [Language Arts](docs/adaptive-language/README.md) has its own curriculum and evidence. The parent-selected subject and learning difficulty remain separate from game difficulty.

## Lifetime gems and Rewards

The shared [Rewards experience](docs/rewards/README.md) connects saved learning activities, scene challenges, qualifying developed games and milestones to a nonspendable lifetime gem total. Its page and compact entry show the next gem milestone, how to earn and recent saved grants alongside the existing evidence-based maker rank. Supported work earns the same activity reward; gems do not measure proficiency or buy a maker rank. Durable source outboxes and a local IndexedDB ledger provide retry-safe grants, owner isolation and explicit backup/reset behavior. The existing synchronous sources use one writing tab per origin. Companions, collectible inventory, spending, stores and cloud synchronization are separate work.

## Game Quality v1

The [Game Quality standard](docs/GAME-QUALITY.md) defines the physical-play implementation. The [validation report](docs/game-quality/VALIDATION.md) records source pins, tests, screenshots, measurements, and remaining release checks. New Bubble Gum Builders games use the [version 3 assembly builder](docs/bubble-gum-builders/README.md): recognizable objects, structural pink gum joins, a shake test and a 29-second launch/adventure whose distance depends on the chosen pieces. Saved sticker-v2, physical-v1 and earlier games retain their recorded engines and construction state. Junkyard Rally adds wheel suspension, terrain, throttle/brake, three trails, and handling changes saved as experiments. Both use local toy artwork, music and effects; gameplay makes no model requests.

For an existing physical-v1 game or Rally, choose **Improve this game** or a garage change. Try **Make wheels bigger**, **Make springs softer**, **Make car lighter**, **Make joints stronger**, or **Make fan stronger**. The build or ride carries into the new version. Compare, Keep, undo, or save a different game. Older saved gum versions keep their original engine. Drawing decomposition has a validated component/rig contract and remains a separate branch.

The generated-game pipeline also has a versioned v2 contract for trusted physics, illustrated parts, camera movement, pointer dragging, sound and 60 Hz fixed stepping. The engine and artwork are immutable approved packages separate from the model's 30 KB source allowance; saved v1 games retain their original contract. V2 smoke tests require an input-dependent scene response and clean replay/pause, while allowing ordinary losses and endless construction. Authored fixtures test specific physical goals. Automated checks do not establish child enjoyment or a hard per-game browser JavaScript memory cap. Paid generation and production acceptance remain behind the existing approval and isolated-worker controls.

## Brand identity
The approved jems brand system and its usage/release rules are documented in [docs/brand/README.md](docs/brand/README.md). Visual brand assets are in `public/jems-*.svg`; legacy storage keys remain unchanged.

## Run locally

Node 22 or newer:

```sh
npm ci
npm run dev
```

Use the printed local URL. The default route opens Studio; `?studio=1` is an alias and `?arcade=1` opens the original arcade with its saved games. Vite serves the TypeScript modules; opening raw `index.html` as a file is no longer supported. `npm run build` typechecks and produces a static `dist/` site. No runtime server or provider key is needed.

The [device and play review guide](docs/game-quality/PLAY_REVIEW.md) explains how to try the reviewed build on a phone or tablet and record specific usability or performance observations. It is a blank guide, not evidence of completed child testing.

## Try Live Remix in the original arcade

Open `?arcade=1` for the original arcade's Remix flow below. The default Studio provides its integrated creation and experiment interface.

1. Open **Remix**, start a Splash or Pass remix, and **Play this version**.
2. After playing, go **Back to Live Remix**. Reflect or skip; optionally predict what your next change will do.
3. Type **Give me four buckets**, press **Try It**. Four selectable buckets really appear. Try **Show the safe bucket**, **Make the splash last 1 second**, **Hide the safe bucket**, or **Give me two buckets**.
4. Use **Undo last change**, or expand **Compare versions & save a new game** to compare/play/restore versions. Name and **Save as new game**; reopen it from **My Creations** after reload.

Each local Try saves an immutable private version on this browser; Keep pins a version. A connected secure builder can handle unsupported requests through a real acknowledged queue. The default configuration says “Needs builder” without pretending to queue anything. New-game Create has a one-button Try It action; remote previews can be played, kept, compared, revised, undone, forked and reopened from the family catalog. Undo retains alternate futures. The physical workshop exposes gum supply, joint strength, gravity and fan power; Rally exposes motor, suspension, wheel size, body weight and grip. Restored Dragon exposes island resilience, fireball cadence and shield timing. Earlier saved engines retain their own controls. Game changes never change parent math difficulty. These are bounded local language rules, not an AI service. Unfamiliar mechanics are reported as unsupported and may be saved only as ideas, never represented as generated playable games.

**Factory Favorites** includes six games and retains saved earlier engines and presets. **Create** still saves new game ideas. **My Powers** retains the adaptive math practice. Grown-ups can use the footer for settings and JSON backups. There is no secure local parental login or cross-device sync.

## Storage and backups

Lifetime reward receipts use the separate local IndexedDB database `family-game-factory-rewards-v1`; family/adult namespaces and each owner's grants remain isolated. Family backups carry rewards and pending source outboxes. Legacy backups restore an empty reward history, and corrupted reward data remains available for explicit recovery. See the [reward persistence contract](docs/rewards/README.md#backup-restore-and-deletion).

- Existing `family-game-factory-state-v1` math/profile/idea data remains compatible and is not migrated away or cleared.
- New private workspace key: `family-game-factory-workspace-v2`. A versioned pre-release v1 game-list fixture migrates to the revision DAG; corrupt/unknown data is left intact and an error is shown. Original arcade play remains available.
- Parent JSON export includes optional `factoryWorkspace`; old progress-only backups still restore. Restoring an old backup preserves an existing remix workspace; restoring a combined backup replaces both stores. Keep backups private; they can contain learning history and child-written text.
- Writes are bounded (50 projects, 500 revisions, 1000 plays). Failed revisions retain the typed request and last working game; no automatic pruning. Clearing browser data or changing origins loses local data without a backup.

## Documentation checks

Run `npm run docs:check` after changes and record each affected area review as described in the [maintenance process](docs/context/MAINTENANCE.md). `npm run test:docs` exercises the checker itself without application dependencies.

## Tests

The [CI architecture and evidence guide](docs/evidence/README.md#ci-architecture-and-performance) describes the source-bound browser shards, conservative change classification, exact evidence reuse, performance reporting and three validation tiers. New functionality needs meaningful validation without automatically lengthening every routine PR's critical path. Assign new suites explicitly and run `npm run test:ci` to check the orchestration contracts; `npm test` remains the complete local regression entry point.

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Strict TypeScript check, Vite production build, unit/contract tests, original v0.3 browser journeys and desktop/mobile five-iteration remix journeys run in CI on pinned Ubuntu 24.04. CI always uses the Playwright-pinned Chromium installed by the workflow. Local runs may use system Chromium when installed; otherwise Playwright's Chromium is used. `CHROMIUM_PATH` overrides it. Tests serve built assets under a repository-style `/arcade/` path and capture browser screenshots from authored test fixtures in `test-results/`.

## GitHub Pages and cloud limits

The source now requires a Vite build. After review/merge, choose **GitHub Actions** as the repository's Pages source, then manually dispatch **Build reviewed Pages site** on `main` to publish `dist/`. The workflow refuses other branches. PR test runs never deploy. Existing live Pages content stays untouched until that explicit action. Relative asset URLs support repository subpaths.

`server/` contains typed managed-service ports, an authenticated and budget-limited job API, private preview rendering and an OpenAPI spec. Tests use durable local storage, declared mock agents and authored provider responses. The source-generation adapter and its isolated build/test path are described below; the default local app needs neither an account nor a model key. Generated code is accepted only through the approved pipeline and its versioned preview contract. It is never executed in the gateway process or inserted as arbitrary page HTML. A source merge does not activate provider billing or deploy cloud resources. See the [pipeline](docs/agent-pipeline.md), [current quality contract](docs/GAME-QUALITY.md) and [Codex research](docs/codex-agent-research.md) for scope and evidence; physical drawing decomposition and playable-rig import remain separate work.

Default tests distinguish fixtures from real-agent acceptance. A live smoke result requires a verified destination, identity, current authorized scope and linked evidence from that exact release. Reuse existing owner authorization when applicable; do not infer a live result from CI or a configured endpoint.

## Private generation and isolated execution

The preferred path is now implemented as **website → authenticated GCP gateway → GitHub Actions → generated TypeScript → isolated build/test/repair → private preview**. It reuses the existing jobs, revisions, signed preview, keep/undo/fork, authentication and child UI contracts. The generation coding adapter runs in the Actions generation job; compilation/play runs in a different gVisor job without that model key. The separately approved [private coach](docs/issue-28/CLOUD_RUN_OWNER_PLAN.md) has its own isolated service and coach-only credentials; it does not move the generation key into the gateway. Reviewed immutable worker tags, stage-bound OIDC and private callbacks keep prompts/source out of public workflow inputs/artifacts. Subscription-based Codex entitlement remains unverified and disabled.

Historical Assignment 002 [setup](docs/assignment-002/owner-setup.md), [cost assumptions](docs/assignment-002/cost-estimate.md) and [evidence](docs/assignment-002/evidence.md) describe that implementation stage, not the current live inventory or current provider pricing. Use [architecture](ARCHITECTURE-CURRENT.md) and [delivery state](DELIVERY-STATE.md) for the maintained references. No real inference is claimed from the mocked E2E. Full container smoke requires an explicitly provisioned immutable image and gVisor runtime. A successful ordinary CI run does not replace that gate.

`npm test` includes the original games/data regressions plus five source-generation/revision requests on desktop/mobile through mocked Actions and fixture provider responses, automatic repair, private preview, and worker containment probes. Quality suites add the physical workshop, driving game and authored generated-v2 cases. `npm run test:sandbox` separately requires an explicitly supplied immutable worker image and gVisor Docker socket. It never silently executes arbitrary generated source on the host. V1 source games use the original primitive canvas API. V2 adds approved illustrated sprites, bounded Planck capabilities, camera and local synthesis; neither contract admits arbitrary HTML, remote assets or imported packages from generated source.
