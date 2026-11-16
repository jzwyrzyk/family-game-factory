# Game-quality compatibility with the current Studio

Studio and the design coach are already part of `main` through merge commit `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`. The game-quality feature branch integrates that main baseline, preserves its coaching behavior, and adds compatibility for the physical games and generated runtime. It does not create or merge a separate Studio PR.

## Exact source

- Native/generated parent: `16864e669d3c71f7f6b63b4eff68f1700e4f0f6c`.
- Main parent: `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`.
- Studio source already contained in main: `9bc1b71686153d1a622af23ad62940c2c5ad30f2`.
- Target branch: `feature/game-quality-v1`.
- Generated trusted runtime: `quality-runtime-v2.0.1`.

The two-parent integration commit must retain the exact native/generated and main parents above. `quality-ci-pins.json` records those inputs and the compatibility-patch digest. The local preparation branch is only a worktree convenience; no additional remote review branch is needed.

## Integration decisions

The merge keeps the final native package scripts/dependencies and adds the Studio/coach scripts from main. The client entry retains both quality-card and opt-in Studio initialization. The package lock remains the native parent's lock because Studio adds no dependencies. The guarded resolver writes only the two known conflict files and never stages, commits, or pushes.

The nine-file compatibility patch adds Hill notebook/starter support, preserves generated-v2 request classification, and sends embedded garage requests through Studio's existing experiment loop. It retains the current project, draft, saved build/ride state, and candidate ancestry. Native requests outside Studio retain their existing host. Presets retain helper attribution; no coaching decisions, observations, tests, or plans are discarded.

All latest native/generated files come from the pinned quality parent, including the workshop keyboard/drag fixes, Hill save/retry/track handling, v2.0.1 private collision-profiler clock, and both archived runtime versions. Old integration worktrees are retained as historical evidence and are not the source for native files.

## Local validation

Local validation on the combined tree used an independent dependency directory installed with `npm ci --offline`. The production build/typecheck passed, along with 69 core unit tests (including generated-runtime assertions), 22 Studio unit tests, 34 coach unit tests, and 8 coach HTTP checks. Both browser scripts passed syntax checks. The generated runtime and archived runtime assets remain byte-for-byte identical to the pinned quality parent.

The combined production JavaScript measured 510.53 kB minified / 149.76 kB gzip. Vite emitted its standard warning for a chunk over 500 kB; these are transfer/build measurements, not frame-time or device-performance results.

Browser execution belongs to CI in this environment. Local preflight does not establish desktop/mobile behavior, device performance, remote-worker rollout, or child enjoyment. Recorded run results should name the exact tested integration commit rather than either parent alone.

## Dedicated CI behavior

The workflow **Studio quality integration review** accepts only pushes or manual runs on `feature/game-quality-v1`. Its permissions are read-only. It uses Ubuntu 24.04, Node 22, a clean `npm ci`, and the project's pinned Playwright Chromium. It has no deployment, generation-activation, or private-worker-repin steps.

After a successful build, Studio unit, coach unit, coach HTTP, Studio browser, and design-coach browser steps run independently. Each uses `!cancelled()` plus the build outcome, so an earlier failed test does not prevent the other browser suite from reporting. The existing **Arcade journeys** workflow remains unchanged and runs the complete combined `npm test` suite separately.

The dedicated artifact `studio-quality-review-evidence` contains the tested commit, parent history, Node version, and screenshots. The browser suites use local/offline behavior and explicitly labeled remote transport fixtures; they do not call a live model.

Assess the exact feature-branch commit for four starters; physical blueprint preservation through preview/keep/undo/copy/reload; actual success followed by explicit Finish; Hill garage requests staying in Studio; retained paint/trail/setup and candidate ancestry; absence of accidental legacy remix or paid jobs; profile/draft isolation; and v2 remote request classification.

Successful fixture results do not imply that paid generation, the private worker, or production deployment is enabled. Browser failures must remain visible and be fixed on the feature branch before any further merge or release decision.
