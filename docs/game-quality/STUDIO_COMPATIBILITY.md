# Studio compatibility patch

`studio-integration.patch` contains only Studio adaptations for the native game-quality slice. It has not been applied to the main checkout, committed to PR18, or published.

## Exact review baseline

- Native game-quality commit: `7f3e4fc37c65513bb95892e11cfa286b7e401d95`.
- PR18 Studio/design-coach commit: `9bc1b71686153d1a622af23ad62940c2c5ad30f2`.
- Integration checkout: `quality-studio-integration`, with the existing merge left uncommitted.

The patch compares against the staged PR18 Studio files in that integration checkout. A clean application was checked against copies of those baseline files, and every resulting file matched the tested adaptation. The patch touches six Studio source files and three Studio test files.

## Prerequisites outside this patch

Keep both branches' package scripts when resolving `package.json`: retain Planck 1.4.2 and the native quality tests, and add PR18's Studio and coach scripts. That merge resolution is deliberately excluded from this patch.

The native host must dispatch `factory-remix-request` with `cancelable: true` from both the Hill garage and legacy Improve button. The legacy Live Remix listener must return immediately when `event.defaultPrevented` is true. Those three native-file changes were copied into the integration checkout for validation; they belong to the native review and are excluded here.

## Adaptation behavior

Studio notebook validation now shares the runtime's `GameId` contract. Hill notebooks, reloads, restores, starter cards, names, and icons work alongside the existing games. No notebook schema migration or existing saved-game replacement is required.

A capture listener claims only requests from the matching game currently embedded in Studio. It cancels the legacy route, flushes the current native game's saved state, and uses the existing Studio experiment loop. A garage preset while playing a candidate continues that test and preserves its parent reference. The main version remains unchanged until the child chooses to keep the experiment. Presets retain helper attribution.

An unfinished draft is preserved and combined with the selected preset for editing, without immediately submitting both. A full draft remains intact. Historical-version requests are saved as drafts and ask the child to choose a starting version. Pending math must finish before a change starts. Requests outside the active Studio keep their existing host behavior.

Both `generated-module-v1` and `generated-module-v2` select the generated builder endpoint. This is frontend compatibility only; it does not activate generation, enable paid services, update a private worker pin, or prove the v2 worker deployment.

Studio browser fixtures now target the physical builder's public snapshots and explicit Finish action. They include four starter cards, Hill garage routing with retained paint/trail/setup, continuation of an existing candidate, and a v2 remote transport fixture.

## Validation and remaining gate

Passed in the isolated checkout:

- `npm run build`, including strict TypeScript checking and the production Vite bundle.
- `node --import tsx tests/studio-unit.ts`: 22 tests.
- `node --import tsx tests/design-coach-unit.ts`: 34 tests.
- `node --import tsx tests/design-coach-http.ts`: 8 checks using fixtures.
- Syntax checks for both updated browser test files and `git diff --check`.
- Clean patch application against the exact staged baseline.

The combined client bundle was 506.51 kB minified / 148.37 kB gzip; Vite emitted its standard warning for a chunk over 500 kB. This is a build measurement, not a browser performance result.

Browser journeys were **not run** in this environment. The event-routing unit fixture models capture/bubble phases because Node's EventTarget does not implement browser capture ordering. Real desktop/mobile Studio journeys, native-game pause/input behavior, visual review, and remote preview isolation remain browser-CI gates before merging this adaptation. No live inference or child enjoyment claim follows from these checks.
