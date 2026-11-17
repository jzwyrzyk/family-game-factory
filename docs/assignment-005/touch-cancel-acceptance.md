# Production acceptance: touch cancellation regression

Baseline application: `ef18d48` (merged PR #22); private worker: `039e492ed960c95091d4c7fdce2364ccd2309b52`. Exact failed run: [44002072240](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44002072240), job `133768348136`. It tested public source `31f8c463f95260a2b5c64f442a53adfe603a2228` and image:

```text
ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:4495d9558b1c3f5c8b350f0f00030c934b742eb2e0a4e23dc0e4ada12a30f731
```

The logs confirm immutable image preparation, all 10 host checks, real gVisor network denial, all four v1/v2 sandbox fixtures and hostile-source checks passed. The run then failed in the separate host-browser `npm test` at the mobile assertion `released.y > after.y + 2`. The run remains **failed acceptance**, not a production pass. Nothing here provisions a VM or triggers another live run.

## Root cause and evidence

The assertion conflates release with downward displacement in 250 wall-clock milliseconds. The actual path is `pointercancel` → `pointer.down=false, released=true` → fixture `physics.drag(null)` → `world.destroyJoint(drag)`. The runtime already implements that path. It correctly preserves the body's momentum; release does not zero velocity. Rotating spring motion, gravity, floor contact, interpolated frames and the number of completed simulation ticks all affect the old observation. A wall-clock delay does not establish a fixed amount of simulated motion on a constrained runner.

A deterministic counterexample using the existing physics engine explicitly calls `drag(null)`, then advances 15 fixed ticks (250 ms of simulation). Starting with upward velocity **−75.56 px/s**, the released body moves from **y=216.52** to **y=210.96**, a **−5.56 px** displacement, even though its spring has been removed. The old assertion rejects this valid release. The exact cloud velocity/tick count was not logged, so we do not claim to reconstruct that particular trajectory; this counterexample establishes the incorrect assumption independently.

Reproduce the counterexample from the application checkout (no generated source or provider execution):

```sh
node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {createCapabilities} from './server/sandbox/runtime-v2.ts';
const r=createCapabilities(),p=r.api.physics;
p.reset();p.body({id:'floor',type:'static',shape:'box',x:360,y:370,width:600,height:36});
p.part({id:'toy',part:'capsule',x:170,y:270});
for(let i=0;i<12;i++){r.beginTick();r.step();}
const initial=p.transform('toy');
for(let i=0;i<20;i++){r.beginTick();p.drag('toy',initial.x+(i+1)*4,initial.y-(i+1)*3.5);r.step();}
for(let i=0;i<4;i++){r.beginTick();p.drag('toy',initial.x+80,initial.y-70);r.step();}
const before=p.transform('toy');p.drag(null);
for(let i=0;i<15;i++){r.beginTick();r.step();}
const after=p.transform('toy');
console.log({before,after,dy:after.y-before.y,oldAssertion:after.y>before.y+2});
assert.ok(after.y<=before.y+2,'a successful release can fail the old assertion');
JS
```

## Replacement requirement, not a relaxed threshold

The original mouse/touch drag movement, replay, focus/pause, math, security and gameplay checks remain. The new **test-only authored fixture** uses the exact archived renderer/worker/physics package without adding runtime inspection hooks. It has one body, zero gravity and no collisions. A constant horizontal force is applied while the spring holds it near its anchor for at least 60 completed simulation ticks. CDP then delivers a real `touchCancel`; the canvas must observe exactly one `pointercancel` of type `touch`, and the worker must transition from holding to released. After at least 30 released ticks, the same force must move the body more than 50 px from its held position.

This proves both input clearing and real physical release: the assertion **must reject** a deliberately disabled cancel handler and a fixture that deliberately omits `drag(null)` while still reporting a released phase. Neither event receipt nor a generated release flag alone suffices. The positive test also runs with 4× CPU throttling. Polling uses simulation ticks with a bounded 10-second failure deadline; elapsed wall time is not the physics assertion.

Focused command, also exercised by the normal mobile quality suite and full CI:

```sh
node --import tsx tests/quality-generated-browser.ts --touch-cancel-only
```

Local focused results (Playwright Chromium 141.0.7390.37): normal CPU held 62 ticks at x=200.81, then 30 released ticks at x=304.14; 4× CPU held 62 ticks at x=200.81, then 31 released ticks at x=311.03. Both observed one real touch cancel. Both negative controls were rejected. Exact full-suite/CI source SHAs and run URLs are recorded in the draft PRs.

## Existing image reuse and minimum resumption steps

**Reuse the exact published digest above unchanged. No rebuild, republish, application deployment or new trusted-runtime version is required.** This correction changes only host-browser tests and this evidence document. The Dockerfile, `.dockerignore`, package locks, all `server/sandbox` inputs (including archived runtime packages), generated fixtures and production code are byte-for-byte unchanged from the image's source `31f8c463...`. Verify the committed correction with:

```sh
git diff --exit-code 31f8c463f95260a2b5c64f442a53adfe603a2228 HEAD -- \
  server/sandbox package.json package-lock.json .dockerignore
```

The private workflow checks out `npm test` from its pinned public SHA, so merely merging the browser test cannot affect the next smoke. A small companion pin-only update selects the exact corrected public commit in both workflows, readiness and owner/controller source declarations, and their agreement test. It adds no workflow input or different acceptance mechanism. Normal generation code and the image are unchanged.

1. Review/authorize the application correction and companion private pin update. Use the companion PR's exact tested public source SHA S and final merged private main SHA P. Refresh the private checkout to P; align its protected new `factory-execution-P` tag and `FACTORY_PRIVATE_WORKER_SHA`. Do not move old tags or change runner-group policy. These are future owner actions, not changes made by this task.
2. Keep `FACTORY_ACTIONS_APPROVED=false`. Preserve `FACTORY_SANDBOX_IMAGE` at the exact existing digest above. No registry credential, image visibility or permission update is needed for this already-successfully-pulled image.
3. Only after separate authorization for one billable retry, use the existing one-shot smoke approval and reviewed runner checksum:

```sh
I=ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:4495d9558b1c3f5c8b350f0f00030c934b742eb2e0a4e23dc0e4ada12a30f731
bash scripts/runner/owner_smoke.sh --approved-private-sha "$P" \
  --restricted-runner-group-id 3 --runner-version 2.338.2 \
  --runner-sha256 "$EXISTING_REVIEWED_RUNNER_TARBALL_SHA256" \
  --production-image "$I" --execute --authorize-billing --trust-reviewed
```

Require the **entire** exact-image workflow, including corrected browser regression, to pass; retain S/P/I and run/job evidence, then independently verify VM/disk/runner absence and smoke-approval reset. The owner-run acceptance path does not use production hosted WIF, so repinning its workflow-SHA condition is not an additional gate for this retry. Align WIF to final P separately before any later paid production activation. Paid AI, deployment and all production credentials remain untouched here.
