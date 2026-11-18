# Objective 5 — Independent rendered-game verification

**Status:** Draft research code in PR #43, not merged or deployed. The priority is functioning games, not predicted enjoyment.

## Why this objective exists

Jems already runs generic desktop/mobile browser smoke tests with input response, visible changes, replay, pause, resource bounds and isolation. That is necessary but cannot prove the child's actual requested interaction or payoff occurs. Random gestures may also miss a valid sticker mechanic and unfairly reject a working game.

O5 adds externally authored, source-anchored functional probes that press the *actual* rendered controls and observe the trusted canvas host. Neither the game source nor a model can supply its own acceptance tests or mark itself successful.

## Implementation

### Requirement-level browser playtest

- server/sandbox/intent-playtest-v2.cjs drives the existing sandboxed v2 preview using real desktop mouse/buttons and mobile touch. It checks displayed keyed commands, real movement, physical bodies and joints, bounded outcomes and replay; it rejects missing/offscreen/zero-sized "success" markers.
- Unknown requirements produce **not-tested**, not pass. A plan that only waits or checks decorative labels cannot substitute for actual input-effect evidence. Tests return safe IDs rather than logging child prompts/source.
- tests/intent-playtest-browser.ts verifies an authored sticker/Launch game, robot-grid game and real physical car on desktop and mobile. It also verifies broken-launch, ignored-robot-controls and nonphysical-car counterparts FAIL. These are reviewed source fixtures, not paid model output.

### Internal-only optional test plan

- A server-owned job may carry a vetted independentIntentPlan. The public build request validator rejects this field. No new child data API or plan-submission endpoint exists.
- The existing Actions coordinator validates the plan against the original child text before the credential-free test-stage claim. The generation/provider stage never receives the plan. A tampered source hash or missing attestation cannot make the job ready.
- worker-cli and DockerArtifactGate pass the vetted plan into the existing runsc gVisor container. The independent browser checker runs in the same isolated test stage, not in the privileged generator.
- worker.cjs must pass the independent plan on both desktop and mobile before setting compiled.tests.intent=true. Otherwise the existing test-failure report is returned to the same bounded repair coordinator. No second repair service is created.
- A proven goal-directed input test can replace ONLY the generic random exploratory input-effect heuristic, which can miss a legitimate drag/placement activity. All sandbox security, no-network, resource, responsive-layout, replay, pause, isolation and existing learning gates remain mandatory.
- The Dockerfile copies the new browser checker for a future *separately reviewed* pinned image. No worker image, WIF, authentication, runner configuration or deployed source pin is changed by this R&D draft.

### Unit and system verification

- tests/intent-worker-binding.test.ts proves that a browser request cannot inject an intent plan, that a source-tampered plan fails before the test claim, that a false intent attestation cannot make a ready revision, and that an objective failure retains the vetted plan on the existing repair attempt.
- The browser suite calls the existing sandbox worker CLI on whitelisted authored source (the working sticker rocket and its missing-launch counterpart). The working fixture must receive intent=true; the broken one must return a bounded intent-test failure.
- A local CI worker run on reviewed fixtures is NOT a production gVisor attestation; only the separately pinned and reviewed production image will provide that security guarantee.
- No real paid model calls or arbitrary generated games are run in Node, vm, or any environment outside their approved sandbox.

## Status meanings and limitations

**Pass:** independently specified and genuinely visible behavior was observed after real input, on the tested game version/device.

**Fail:** the required input-to-output or payoff did not occur; the prior working version must be preserved and the existing repair system receives bounded diagnostics.

**Not tested:** no independently vetted requirement is available, or a required mechanic cannot be safely observed. Generic browser smoke passing does not mean full child-intent fidelity passed.

The present O1/O2 language interpretation is conservative; the research does not automatically invent reliable requirements for every arbitrary child idea. Three authored fixture games are not proof of a universal verifier. No model-generated "fun score," false success, artistic redesign or silent release promotion is permitted.

## What remains for later objectives

O6: extend the existing repair loop with specific objective diagnostics, ensure repaired behavior passes the same independent tests, and never auto-Keep a version.
O7: verify actual full child Create/Play/Modify/Compare/Keep/Return, learning, drawing and voice/coach integration.
O8: benchmark real reliability gains and errors; evaluate child enjoyment separately with consent.
O9: security review, image build/pinning, approved private worker update, merge/deployment and rollback.

## O5 acceptance gate

1. Exact-head TypeScript and unit/contract tests pass.
2. Three positive observed real-browser fixture experiences pass desktop/mobile; three broken counterparts fail without false green.
3. The real existing worker's optional independently sourced plan path is verified on reviewed fixture source, with failed or forged attestations denied.
4. Existing safety, learning, creative, visual and browser regressions stay green; the private worker security controls and production remain unchanged.

**Do not call the optional gate active for arbitrary production games.** Its source-independent specification mechanism must be validated before enabling broad hard-failure decisions.
