# Game Quality v1 — validation review

Evidence date: 16 November 2026. This report separates implemented behavior, measured engineering evidence, browser verification, and release decisions.
The product standard remains [GAME-QUALITY.md](../GAME-QUALITY.md): a game should be worth playing before a learning prompt appears.

## Review scope and source pins

The work is reviewed in [PR #20](https://github.com/jzwyrzyk/family-game-factory/pull/20), branch `feature/game-quality-v1`.
Studio and the design coach are already in main; this feature integrates that main baseline and preserves its coaching flow.

| Source | Exact commit or contract |
| --- | --- |
| Current-main baseline, including Studio | `ca73ceba4ae2c79f9f669c3fcbaa66922230d601` |
| Studio source already merged into that main | `9bc1b71686153d1a622af23ad62940c2c5ad30f2` |
| Native/generated parent of the integration | `16864e669d3c71f7f6b63b4eff68f1700e4f0f6c` |
| Original combined integration | `832a705256ec28f0ce917ff40bd91bc1e826c527` |
| Original measured native client, including the paused scene | `d957657e8db31d5044830f070aab22c36f48ed12` |
| Original application/test revision accepted by CI | `ca9b53d70e89bb2dba86654b2face902752d4795` |
| Continuation client and review source | `562d5ba6bb008edb7509c470b316798c5af663aa` |
| Trusted generated runtime in the current review batch | `quality-runtime-v2.0.2` |

The bundle report retains each measured source independently. The latest native-client row includes v2.0.2-era routing, the bounded paused scene and the subsequent paused-render/keyboard corrections; generated worker archives remain outside its core-client transfer totals.
See [integration decisions](../studio-review/QUALITY_INTEGRATION_CI.md) and [compatibility notes](STUDIO_COMPATIBILITY.md).

## Original CI status — passed

**The original application and test changes passed the full suite at `ca9b53d70e89bb2dba86654b2face902752d4795`.**
The original report and retained screenshots were added in documentation revision `2558fb7e0c53e6c793cdaec8536c01f961825df9`. Subsequent code changes and their verification are recorded in the continuation section below.

| Required evidence | Observed result |
| --- | --- |
| Full `npm test`, exact feature head | **Passed** — [push run 43813161848](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43813161848) |
| Full `npm test`, PR integration against the main baseline | **Passed** — [PR run 43813166576](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43813166576) |
| Independent generated/Studio/coach/mocked generation review | **Passed** — [run 43813161679](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43813161679), with the exact feature SHA recorded in its artifact |
| Core and policy checks | Build/typecheck, **70 core tests**, generated-runtime assertions, **11 deployment-policy tests**, **26 Studio tests**, **34 coach tests**, **8 coach HTTP checks** passed |
| New physical games | Workshop and Rally desktop/touch journeys passed, including editing, real goals, replay, tuning, save failures and profile ownership |
| Generated v2 | Desktop/mobile fixtures, actual touch drag/cancel, keyboard/focus, audio lifecycle, replay and **14 containment probes** passed |
| Historical behavior | Existing creation/remix, five generated revisions per layout, v1 worker probes, restored Dragon/Splash/gum, learning, offline, construction touch and private-drawing regressions passed |
| Retained screenshot artifact | `14201881270`, `browser-evidence`, from the passing PR run; ZIP SHA-256 `a9a3eccedda25f01456ede134470065aa9a9c1214f05076b33c7ce540cd4a778` |
| Independent exact-head artifact | `14201706474`, `studio-quality-review-evidence`; ZIP SHA-256 `8e6edbd2c4c81dbd0ab8fbb35b2b0147cee19e3e5357354d393b7a811b4cbd90` |
| Live paid generation, provisioned gVisor gate, private-worker rollout | **Not executed.** The full suite explicitly skips the unfunded real-agent smoke; browser success does not replace isolated-container acceptance |

The complete logs were inspected and both downloaded artifact digests were verified. Selected actual screenshots and per-image hashes are retained in [screenshots/evidence.json](screenshots/evidence.json).
Automated acceptance establishes the tested behavior, not target-device thermals, measured end-to-end input latency, child enjoyment or learning efficacy.

## Continuation review — passed

**All continuation application and test changes passed at `562d5ba6bb008edb7509c470b316798c5af663aa`, against main `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`.** The follow-up evidence commit updates only this report and bundle measurements; it does not change the accepted executable source.

| Evidence | Result |
| --- | --- |
| Full exact-feature-head `npm test` | **Passed** — [run 43817401659](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43817401659) |
| Full PR integration `npm test` | **Passed** — [run 43817410341](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43817410341) |
| Independent generated/Studio/coach/mocked generation review | **Passed** — [run 43817401679](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43817401679) |
| Local and CI core checks | Build/typecheck and **77 core tests passed**; existing deployment-policy, Studio, coach, HTTP and historical browser suites also passed |
| New native browser regressions | Desktop/touch layouts verify quiescent pauses, painted resized canvases, paused drag/cancellation and paint changes without simulation advance, browser-shortcut preservation and restored keyboard editing focus |
| New v1 input regression | The real-browser test reproduces an unsampled click and then wins the unchanged authored fixture through ordinary held input; complete desktop/mobile generation journeys pass afterward |
| Full PR browser artifact | `14203507207`, `browser-evidence`, 5,929,482 bytes; ZIP SHA-256 `93dd8daa72860a9d8dfae3b742a165aab004f698f34a00b77b557bda949fa85b` |
| Independent review artifact | `14202643769`, `studio-quality-review-evidence`, 2,246,265 bytes; ZIP SHA-256 `8cda94b9f6bd110f0c529da2bf614c9bc6801bda3b86a0b2d54f0674c4ef97e5`; its source-pin file records the accepted SHA above |

Both downloaded artifact ZIP digests were verified, the independent source pin was checked, and the completed logs were inspected. The selected screenshots retained in this repository remain the original `ca9b53d…` captures with their original provenance; the continuation browser evidence is linked above.

### Changes and why they were needed

- **Paused rendering:** [the shared native clock](../../src/quality/clock.ts) paints once and becomes quiescent. Explicit invalidation handles resize, editing, paint and scene changes. The tests verify stopped scheduling, one coalesced redraw, independent pause reasons, safe resumption and disposal, and actual rendered pixels after paused edits/resizing. No simulation constants change.
- **Keyboard continuity:** [Rally](../../src/games/quality-hill.ts) ignores Ctrl/Meta/Alt-modified keydown commands while retaining keyup cleanup. [The workshop](../../src/games/quality-builder.ts) restores canvas focus after Edit hides the activated control. Browser tests immediately select and move a restored part with the keyboard.
- **V1 acceptance-playtest ordering:** [the gate](../../server/sandbox/worker.cjs) now holds an ordinary control across at least two existing 50 ms sampling periods and observes fresh frames before releasing, within a bounded observation. A frame increment alone cannot complete the hold because a reply may already be in flight. Releasing outside the button avoids the legacy click-cleanup timer interfering with a later press. Cleanup always attempts pointer release through `finally`; win, visible-change, replay, isolation and overall fixture-timeout requirements remain intact.
- **Actual-device review:** [PLAY_REVIEW.md](PLAY_REVIEW.md) provides a local phone/tablet setup and concrete observation tasks. It is a blank guide and introduces no telemetry or completed child/device results.

The input investigation followed a new repeat failure. Both full runs on documentation revision `2558fb7e0c53e6c793cdaec8536c01f961825df9` passed: [feature push](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43814706176) and [PR integration](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43814711922). Its [independent repeat](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43814706234) failed in the mocked Actions journey after the known v1 hopper exhausted repair with `NO_ACHIEVABLE_WIN_IN_PLAYTEST`.

The [deterministic regression](../../tests/generated-v1-playtest.test.ts) executes the unchanged trusted v1 preview and exact authored fixture: all 30 old click-then-canvas iterations can produce zero sampled hops despite recorded input events. The corrected gesture reaches a genuine win, including when stale frames are injected; separate cases retain stalled-game and loss rejection. The [browser regression](../../tests/generated-v1-input-browser.ts) confirms the input ordering with real pointer events and a real Worker. This supplies a reproducible explanation for the observed repeat failure; it does not retroactively prove the cause of every earlier unexplained stall.

V1 preview bytes and immutable v2 archives remain unchanged. The measured native client adds **724 raw / 207 gzip bytes** over the preceding client. The headless physics benchmark's four source pins remain unchanged; it was not rerun. Live paid generation, provisioned gVisor execution and private-worker rollout were not performed.

## Implemented behavior

| Area | Implemented scope and evidence entry point |
| --- | --- |
| Physical construction | Ten built-in household/toy parts; mass, collisions, directed thrust, lift, off-centre torque, damped gum joints, stress and snapping. Three world-based missions plus free play. [Physics](../../src/quality/physics.ts), [parts](../../src/quality/parts.ts). |
| Construction editing | Drag/tap/keyboard placement, rotation, attachment preview, detach/remove, undo, per-mission saves, and restoration of the intact blueprint after a run. [Builder](../../src/games/quality-builder.ts), [blueprints](../../src/quality/blueprint.ts). |
| Hill driving | Chassis and two independent wheels, suspension/motors, braking, traction, three tracks, follow camera, paint, and version/profile-local best distance. Tuning changes physical values. [Rally](../../src/games/quality-hill.ts). |
| Presentation and timing | Vector toy artwork, scenery, bounded effects, procedural music/sound, separate mute controls, 60 Hz fixed steps, interpolation, capped catch-up, focus/pause cleanup. Restored Dragon uses the shared clock. [Art](../../src/quality/art.ts), [clock](../../src/quality/clock.ts), [audio](../../src/quality/audio.ts). |
| Creative continuity | Supported local requests create experiments; explicit Keep changes the main version. Save/copy/reload preserve builds and rides. Old gum revisions retain their prior engine. [Studio adapter](../../src/studio/adapter.ts), [runtime contracts](../../tests/quality-runtime.test.ts). |
| Studio compatibility | Four starters, Hill notebook validation, generated-v2 classification, and garage requests entering the current Studio experiment. Legacy fallback waits for dispatch completion; Studio claims synchronously. A bounded static scene remains visible after native teardown while designing, and is cleared on profile/project changes. [Routing](../../src/factory/remix-routing.ts), [Studio bridge](../../src/studio/host-navigation.ts). |

Native blueprints cap at **32 parts and 48 joints**; the exposed gum allowance is bounded to **4–20**.
Physics outcomes use positions, contacts, loads and elapsed simulation time, rather than a required list of part names.
Starter machines are examples; an alternative valid construction is exercised by tests.
These are authored toy physics and introductory challenges, not an engineering simulator or a complete content catalogue.

## Local tests and actual browser evidence

The original integration preflight passed build/typecheck, 69 core tests and 22 Studio tests. The later `d957657…` runs passed **70 core tests**, **26 Studio tests**, **34 coach tests**, **8 coach HTTP checks**, and **11 deployment-policy tests**, alongside production build/typecheck. The final source subsequently passed the complete browser suite, as recorded above.

- [Physics tests](../../tests/quality-physics.test.ts): reachable goals, alternative designs, mass/lift/torque, redirected thrust, load-dependent breaks, independent runs, deterministic replay, braking/reversal, exposed tuning corners, and invalid saves.
- [Clock/audio tests](../../tests/quality-clock.test.ts): timestamp zero, initial focus, bounded catch-up disposal, pause scheduling, motor cleanup, and delayed audio unlock after disposal.
- [Native browser tests](../../tests/quality-builder.cjs) and [Rally tests](../../tests/quality-hill.cjs): desktop/touch editing, input lifecycle, saving, replay, and remix behavior.
- [Studio units](../../tests/studio-unit.ts) use real `EventTarget` ordering for deferred fallback, cancellation, and cleanup; [Studio journeys](../../tests/studio-journey.cjs) retain candidate/main, paint/trail, ancestry, draft/profile, and explicit-Finish checks.
- [Coach browser journeys](../../tests/design-coach-browser.cjs) and [HTTP checks](../../tests/design-coach-http.ts) exercise preserved coaching decisions and explicitly labeled fixtures.
- [Generated browser tests](../../tests/quality-generated-browser.ts) use authored fixtures to check real controls/touch, replay/pause, drawing response, boundaries, and failure behavior.

Local browser execution was restricted in this workspace; no browser launch or approval bypass is represented as local evidence.
Browser evidence comes from actual GitHub Actions runs and their artifacts:

| Existing run | What it establishes and what it does not |
| --- | --- |
| [Native quality evidence, 43809107536](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43809107536) | Native quality suites supplied desktop/mobile screenshots at `226e44d…`. The overall run failed in a separate generated-v2 suite. |
| [Combined Studio run, 43810157999](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43810157999) | At `832a705…`, build, unit/HTTP steps and desktop/mobile coach journeys passed; Studio journeys failed at the Hill candidate check. The deferred fallback addressed that observed failure; the final source passed both layouts. |
| [Combined Arcade PR run, 43810165028](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43810165028) | At `832a705…`, Actions desktop/mobile, three v1 worker probes, restored games/Dragon desktop/mobile, learning, offline, construction touch and private drawings passed. Overall failure was the Studio candidate check. This is not a final acceptance claim. |

An earlier Actions stall did not recur on `832a705…`; the added diagnostics do not establish that stall's root cause.

The audio observer is bundled before browser injection: serializing its TypeScript callback had omitted a compiler helper and left an empty probe. A VM regression now checks installation and actual cue capture. The pause test also distinguishes a successfully suspended/stopped voice from delivery of its later `ended` notification. It verifies real prior music, completed suspension, a frozen audio clock, successful immediate stops, no new notes, old-voice completion after resume, and a bounded victory cue. This follows the [Web Audio suspension and source-lifecycle contract](https://www.w3.org/TR/2021/REC-webaudio-20210617/#dom-audiocontext-suspend). The final observer corrections changed tests only; runtime v2.0.2 was preserved.

[Screenshot provenance](screenshots/evidence.json) pins hashes and source for [workshop desktop](screenshots/workshop-desktop.png), [workshop mobile](screenshots/workshop-mobile.png), [Rally desktop](screenshots/rally-desktop.png), and [Rally mobile](screenshots/rally-mobile.png). It also retains [generated desktop](screenshots/generated-desktop.png), [generated mobile](screenshots/generated-mobile.png), [paused Studio desktop](screenshots/studio-paused-desktop.png), and [paused Studio mobile](screenshots/studio-paused-mobile.png).
The [dedicated workflow](../../.github/workflows/studio-quality-review.yml) runs generated presentation, Studio, coach and mocked generation checks independently after build success; the [full workflow](../../.github/workflows/test.yml) runs `npm test`.

## Existing headless CPU benchmark

[Raw benchmark](benchmark-2026-11-16.json), generated by [quality-benchmark.ts](../../tools/quality-benchmark.ts), records `quality-headless-cpu-v1` / Planck **1.4.2**.
The host was Linux x64, Node **v24.22.1**, V8 **13.6.233.17-node.58**, Intel Xeon Platinum **8573C**, with **9 logical CPUs** reported.
It used 1/60-second steps, three warm-up episodes and twelve measured episodes per scene, with fresh deterministic scenes and active-tick limits.
The report records a dirty worktree at `7f3e4fc37c65513bb95892e11cfa286b7e401d95`; its four SHA-256 source pins, not that commit alone, identify the measured implementation.
Those pins for parts, blueprints, physics and the benchmark tool were verified unchanged in this review. The benchmark was not rerun or relabeled.

The table reports **milliseconds per active tick, including step + snapshot/event collection**; elapsed and process CPU are separate measurements.

| Scene | Samples | Elapsed p50 | Elapsed p95 | Elapsed p99 | Process CPU p95 | Process CPU p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Delivery: 5 parts, 4 joints | 2,124 | 0.026357 | 0.143332 | 0.473324 | 0.203 | 2.698 |
| Bridge: 6 parts, 5 joints | 2,160 | 0.019308 | 0.081408 | 0.242812 | 0.132 | 2.799 |
| Meadow: 3 bodies, 2 suspension joints | 4,320 | 0.018091 | 0.069623 | 0.217463 | 0.090 | 0.966 |
| Bounded stress: 32 bodies, 20 connections | 2,880 | 0.134466 | 0.485329 | 1.043039 | 0.719 | 3.565 |

The stress scene uses gravity 16, joint strength 2, gum budget 20, four active fans, collisions and real breaks.
`performance.now()` measures elapsed time; `process.cpuUsage()` includes process GC/helper work and measurement overhead. Baseline overhead is reported, not subtracted.
Frozen post-goal ticks are excluded; episode caps also mean some standard scenes are measured before their goals. This is not a universal completion-rate test.
No Canvas/GPU, WebAudio, browser pacing, touch latency, mobile heat, retained-memory/leak verdict, or child enjoyment is measured.
These results support feasibility for the tested bounded scenes on this host; they establish neither a device FPS promise nor a ranking against other engines.

## Exact bundle-size evidence

[Raw bundle report](bundle-size-2026-11-16.json) preserves historical measurements, the current-main/combined builds from detached worktrees, and a subsequent reviewed-client build with application inputs verified unchanged from its source commit.
The scope is `dist/index.html` plus `dist/assets/*.js` and `dist/assets/*.css`, each compressed separately at **gzip level 6**.

| Build | Source | Raw bytes | Gzip bytes |
| --- | --- | ---: | ---: |
| Historical pre-quality baseline | `9b7f1d201afea845ae9e3816ff7d6d285ba10b9b` | 175,453 | 62,985 |
| Historical native quality | `226e44dc44e54de237c0faf4e1038087f4c1738a` | 486,523 | 140,729 |
| Current main with Studio | `ca73ceba4ae2c79f9f669c3fcbaa66922230d601` | 254,591 | 85,716 |
| Original combined quality + Studio | `832a705256ec28f0ce917ff40bd91bc1e826c527` | 567,155 | 163,919 |
| Reviewed client with paused scene | `d957657e8db31d5044830f070aab22c36f48ed12` | 569,723 | 164,651 |
| Continuation with quiescent pauses and keyboard corrections | `562d5ba6bb008edb7509c470b316798c5af663aa` | 570,447 | 164,858 |

The latest measured increment over current main is **315,856 raw bytes / 79,142 gzip bytes** (about 79 kB compressed).
Measurements use Node v24.22.1 / Vite 6.4.1. The isolated comparison reused dependencies matched against every non-root lockfile entry. The continuation build completed before its commit was created; its identical app/build inputs were subsequently verified at the recorded source SHA and their Git objects are recorded. Build metadata files are excluded consistently from the core totals. The continuation adds **724 raw / 207 gzip bytes** over the preceding reviewed client.
The same **23 original Dragon PNGs total 4,367,688 bytes** in all six sources and are excluded from core totals; their manifest digest is recorded.
Generated-runtime archives, service-worker cache transfers and startup time are outside those core measurements. Vite's own printed gzip estimate is not this report's level-6 total.
The reviewed JavaScript chunk is 512,869 raw bytes and triggers Vite's standard 500 kB warning; actual device loading and frame behavior remain to be measured.

## Generated runtime and execution boundary

[Runtime v2](../../server/sandbox/runtime-v2.ts) provides validated physics, approved sprites, transforms, camera, controls/drag, sound and fixed stepping through frozen handles.
Budgets include **40 exposed bodies, 60 joints, 24 queued events, 240 drawing commands, 4 catch-up steps, 500 capability operations per tick, and 8 queued sounds**.
Capability/frame bounds and a worker watchdog do not impose a hard heap limit on arbitrary browser JavaScript allocations.

Immutable archives remain for [v2.0.0](../../server/sandbox/trusted/quality-runtime-v2.0.0/manifest.json), [v2.0.1](../../server/sandbox/trusted/quality-runtime-v2.0.1/manifest.json), and [v2.0.2](../../server/sandbox/trusted/quality-runtime-v2.0.2/manifest.json).
[The registry](../../server/sandbox/bundle-v2.cjs) binds each version to its package hash; source and compiled-code hashes are separate. Earlier archives are retained, and new attestations require the current package.
V2.0.1 captured Planck's private collision-profiler clock without giving generated code ambient `Date`; v2.0.2 addresses focus/control and terminal-audio behavior. [Archive contract](../../server/sandbox/trusted/README.md).
Generated v1 keeps its original contract. [Trusted tests](../../tests/quality-generated.test.ts) and browser fixtures do not demonstrate a live model's game quality.
**No live paid generation or gVisor execution is claimed.** The [isolated gate](../../server/sandbox/docker-gate.ts) requires its provisioned immutable image and `runsc`; private worker source/image pins need their separate reviewed update.
This review does not activate paid services, dispatch the private runner, change credentials/trust policy, or publish the live arcade.

## Drawing decomposition: prepared contract, unfinished feature

[PartDefinition and DrawingRig](../../src/quality/parts.ts) validate versioned components, bounded colliders/materials, pivots, attachments, offsets, parent relationships and fixed/axle/suspension/gum bindings.
Tests accept a car rig and reject unsafe geometry, missing references and parent cycles. The native workshop still instantiates the reviewed built-in catalogue.
The drawing recognizer/segmenter, ambiguity handling, component-correction UI, asset registration and end-to-end drawing-to-playable-rig importer are **not built**.
The schema leaves a concrete integration point for that separate branch; it does not itself turn a drawing into a working vehicle.

## Remaining release checks

The automated source review and screenshot inspection above are complete. The remaining evidence requires the intended devices, children, or the separately authorized production environment.

1. Play on the intended touch devices and a lower-end device. Measure frame stability, loading, input latency, heat, sound comfort, focus/background recovery and sustained play.
2. Observe children in the intended age range: first-minute comprehension, self-directed retry, explanations of cause and effect, accessible controls, and comfortable stopping/switching.
3. Tune challenge, feedback and content from those observations. Automated goals and responsive graphics do not establish enjoyment or learning benefit.
4. Before accepting live generated v2 games, run the approved gVisor gate against the exact package/image and complete the separately reviewed private-worker rollout.

Use [PLAY_REVIEW.md](PLAY_REVIEW.md) for the local-device setup and observation tasks. It is a blank guide; no actual child or device observations have been collected by this implementation work.

Useful entry points: `npm run build`, `npm run test:unit`, `npm run test:quality`, `npm run test:studio`, and `npm run test:coach`.
`npm run benchmark:quality` reproduces CPU evidence; `npm run test:sandbox` requires the separately provisioned isolated environment. Neither command's presence is evidence that it ran successfully.
