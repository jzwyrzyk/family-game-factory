# Studio compatibility integration

`studio-integration.patch` is the review record for the Studio adaptations applied to the game-quality feature branch. Studio and the design coach are already in `main` through `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`; the quality branch integrates that main baseline without changing its coaching behavior or publishing the arcade.

## Exact review baseline

- Native/generated parent: `16864e669d3c71f7f6b63b4eff68f1700e4f0f6c`.
- Main parent: `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`.
- Studio/design-coach source already in main: `9bc1b71686153d1a622af23ad62940c2c5ad30f2`.
- Target branch: `feature/game-quality-v1`; generated runtime: `quality-runtime-v2.0.1`.

The patch was originally checked against the exact Studio source above and reapplied to its identical tree in the main merge. It touches six Studio source files and three Studio test files. Current integration pins and CI scope are recorded in `docs/studio-review/quality-ci-pins.json` and `QUALITY_INTEGRATION_CI.md`.

## Prerequisites outside this patch

The package merge retains Planck 1.4.2 and all native/generated scripts, and adds main's Studio and coach scripts. Both client initializers are retained. Those two merge resolutions are deliberately excluded from the archived compatibility patch.

The native parent dispatches `factory-remix-request` with `cancelable: true` from both the Hill garage and legacy Improve button. Its legacy Live Remix listener returns immediately when `event.defaultPrevented` is true. These native prerequisites are retained from the final quality parent, rather than copied from an older integration checkout.

## Adaptation behavior

Studio notebook validation now shares the runtime's `GameId` contract. Hill notebooks, reloads, restores, starter cards, names, and icons work alongside the existing games. No notebook schema migration or existing saved-game replacement is required.

A capture listener claims only requests from the matching game currently embedded in Studio. It cancels the legacy route, flushes the current native game's saved state, and uses the existing Studio experiment loop. A garage preset while playing a candidate continues that test and preserves its parent reference. The main version remains unchanged until the child chooses to keep the experiment. Presets retain helper attribution.

An unfinished draft is preserved and combined with the selected preset for editing, without immediately submitting both. A full draft remains intact. Historical-version requests are saved as drafts and ask the child to choose a starting version. Pending math must finish before a change starts. Requests outside the active Studio keep their existing host behavior.

Both `generated-module-v1` and `generated-module-v2` select the generated builder endpoint. This is frontend compatibility only; it does not activate generation, enable paid services, update a private worker pin, or prove the v2 worker deployment.

Studio browser fixtures now target the physical builder's public snapshots and explicit Finish action. They include four starter cards, Hill garage routing with retained paint/trail/setup, continuation of an existing candidate, and a v2 remote transport fixture.

## Validation and remaining gate

The original isolated patch validation passed:

- `npm run build`, including strict TypeScript checking and the production Vite bundle.
- `node --import tsx tests/studio-unit.ts`: 22 tests.
- `node --import tsx tests/design-coach-unit.ts`: 34 tests.
- `node --import tsx tests/design-coach-http.ts`: 8 checks using fixtures.
- Syntax checks for both updated browser test files and `git diff --check`.
- Clean patch application against the exact staged baseline.

The original combined client bundle was 506.51 kB minified / 148.37 kB gzip; Vite emitted its standard warning for a chunk over 500 kB. That historical measurement predates the final native fixes and is not a browser performance result. Current build results belong to the final combined feature-branch commit.

Local preparation did **not run browsers**. The event-routing unit fixture models capture/bubble phases because Node's EventTarget does not implement browser capture ordering. The dedicated feature-branch workflow runs the real desktop/mobile Studio and coach journeys independently; its exact-commit results are the browser gate. No live inference or child enjoyment claim follows from unit or fixture checks.
