# Rebuild the accepted sandbox contract — manual GHCR publication

## Current handoff — published image; smoke timeout repair

The corrected publisher [run 44844870974](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44844870974), attempt 2, succeeded after the owner corrected the existing GHCR package's Actions write access. The published image is `ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:83be22b96cdd83eaefa80c0ae321208bdff63f4ee926cc5ae28d064f91cee089`; source label, actual packaged code and the synthetic no-network protocol check passed. The owner verified the private image variable now points to this digest and paid generation remains disabled. **Do not republish this unchanged image to fix a regression-job timeout.**

Production [smoke 44846112054](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44846112054) passed host readiness, the actual gVisor no-egress probe and full sandbox/hostile fixtures, then reached the job's 25-minute limit during the sequential application regressions. The workflow is cancelled, not accepted. The owner launcher's final cleanup/reset receipt remains separately required. [Delivery state](../../DELIVERY-STATE.md) records the observed timings and limits.

**Next:** the parallel-regression repairs are merged in [private PR15](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/15) and [public PR102](https://github.com/jzwyrzyk/family-game-factory/pull/102). Register private `P=52729ad231179d633b2f15fa910aa2b23273a2d6` with its fresh immutable execution tag and exact variable, and run one corrected smoke after old resource cleanup and smoke authorization reset are verified. The existing public source and image stay pinned. All sandbox checks and all eight regression jobs must pass, followed by verified cleanup/reset. Only then reconcile the new private SHA with WIF/gateway during adult-only activation, immediately deploy the reviewed website, and perform real adult acceptance. See [complete release regressions](RELEASE-CONTINUITY.md#complete-parallel-release-regressions) and the exact merge evidence in [delivery state](../../DELIVERY-STATE.md).

The earlier PR98 fix and manual publication commands below describe the publisher's history and reuse contract. The current release already has its published replacement digest.

## November 20 manual-publication dry-run failure and repair

The initial manual `sandbox-publish.yml` run [44837433067](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44837433067) verified exact approved source `b472c224...`, staged all committed sandbox inputs, built the Docker image and compared actual packaged `worker.cjs`, `source-validator.cjs` and `quality-capture.cjs` SHA-256 bytes. It then **failed safely before GHCR publication**, during the local synthetic `{game:hopper}` protocol check: the fixture loader attempted `import {hopper}` from the repository's TypeScript module compiled as CommonJS, resulting in `SyntaxError: ... does not provide an export named 'hopper'`. Consequently the no-network container received no input and emitted `Unexpected end of JSON input`. **This is a fixture-loading defect in the publishing workflow, not evidence of an image or sandbox runtime failure. No new digest exists from this run.**

The follow-up fixes only the publisher's synthetic fixture-loading method: use Node `--import tsx` with CommonJS `require(...generated-fixtures.ts)`, verify fixture shape, write a bounded local `{game:...}` JSON input, validate it **before launching Docker**, and only then exercise the sandbox. An offline CI test invokes the same TypeScript fixture loader instead of merely checking a workflow string. Re-run manual image publication only after the follow-up PR has merged with its exact-head tests green; never re-dispatch the failed workflow commit or assume the old OCI image is acceptable.


**Release correction, November 20, 2026.** Owner production smoke [private run 44830655674](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44830655674) pulled the configured immutable image `ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:4495d9558b1c3f5c8b350f0f00030c934b742eb2e0a4e23dc0e4ada12a30f731` without credentials and verified gVisor `network=none` egress denial and all host readiness checks. The required full sandbox tests **failed** with `PLAYTEST_FAILED:GENERATED_ARTIFACT_REJECTED` before browser regressions. The owner launcher confirmed `SMOKE_STATUS=FAILED`, `CLEANUP_STATUS=VERIFIED`, `SMOKE_AUTH_STATUS=VERIFIED`, `FINAL_STATUS=FAILED`. That image is **not** accepted for current production execution.

## Determined compatibility cause

The historical published image was built on November 17 from application source `31f8c463f95260a2b5c64f442a53adfe603a2228`. The entrypoint in that source parses stdin directly as a generated game. The private reviewed worker now pins **S = `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`**: current `DockerArtifactGate.test` always sends `{game, captureQuality, independentIntentPlan?}`. Its source-matched sandbox `worker.cjs` unwraps `value.game` and returns quality evidence. An older direct-game entrypoint instead validates the envelope as a game and emits precisely the observed `GENERATED_ARTIFACT_REJECTED`. The source comparison establishes the compatibility discrepancy; it does **not** certify a new image or exclude additional issues that only a real production smoke can expose.

**Do not** change or disable game/artifact validators, downgrade the public worker pin, enable paid generation, or rerun the old OCI digest to get around this error.

## Cloud-to-cloud replacement publisher

Because local computer uploads to Cloud Shell are blocked, a separate **manual** GitHub Actions workflow [`sandbox-publish.yml`](../../.github/workflows/sandbox-publish.yml) builds the immutable reviewed S on a GitHub-hosted Docker runner and publishes to the existing GHCR sandbox package. No Docker install, cloud IAM permission, or source-file upload is required in Cloud Shell.

Its release boundary:

- Workflow must be manually dispatched on `main` in **`jzwyrzyk/family-game-factory`**; there are no automatic `push`/PR publication triggers. It checks out the exact pinned, already-merged application S, not latest HEAD or a user-supplied branch.
- Stages only committed `.dockerignore`, `server/sandbox/**`, `server/agent/game-assets.cjs`, and `server/quality/game-quality-evidence.cjs`; the historical local sandbox publisher also gets this missing input correction in `scripts/deployment/build.py`.
- Builds using the reviewed Dockerfile and stamps `org.opencontainers.image.revision=S`. Compares actual packaged `worker.cjs`, `source-validator.cjs` and `quality-capture.cjs` SHA-256 bytes with the pinned Git source, then exercises a real `{game:hopper}` envelope through a **no-network** container. This is a packaging and protocol gate, **not** a substitute for gVisor security or full gameplay acceptance.
- Only after that passing check does the workflow use its scoped `GITHUB_TOKEN` (`contents:read,packages:write`) to publish a new run/attempt-specific GHCR tag, never touching the older digest. It prints `PUBLISHED_SANDBOX_IMAGE=ghcr.io/...@sha256:<digest>` and records it in the run summary.
- Does **not** update the private `FACTORY_SANDBOX_IMAGE` variable, WIF, private worker SHA, trust tag, VM, gateway, environment secrets, provider budget, child policies, Pages, or paid AI activation.

Once the PR adding this workflow is merged and its required checks pass, the separate owner release action is:

```bash
gh workflow run sandbox-publish.yml \
  --repo jzwyrzyk/family-game-factory --ref main
```

Check the exact run conclusion and copy the **new immutable digest**, not the `source-...` tag. If GHCR denies the repository's built-in `GITHUB_TOKEN` package write, do not expose/paste a personal token or change package visibility reflexively; inspect whether the existing GHCR package grants this repository Actions package access. The existing image was anonymously pullable on the isolated VM, so retain this property for the replacement.

## Acceptance after publication (separate, billable)

1. Verify published image source label/actual entrypoint hash and anonymous pullability from the exact approved digest. Preserve the historical digest as a rollback reference.
2. **For an image-only change**, intentionally update only the private `FACTORY_SANDBOX_IMAGE` variable, retaining its old value for rollback. The current replacement digest is already set. The separate regression-workflow repair requires a fresh private main/tag/variable pin; preserve the existing public source, image, group policy and disabled paid-generation switch while that repair is accepted.
3. Run the reviewed private `scripts/runner/owner_smoke.sh --production-image NEW_DIGEST` **once** with its one-use smoke approval, billing authorization, group policy, full source/identity validation, gVisor/network/hostile gameplay/browser tests and cleanup. Require `SMOKE_STATUS=PASSED`, `CLEANUP_STATUS=VERIFIED`, `SMOKE_AUTH_STATUS=VERIFIED`, `FINAL_STATUS=SUCCESS`. A green GitHub-hosted packaging/wire test alone cannot establish this.
4. Only after full smoke succeeds, complete adult-only backend activation with the correct private trust pin, immediately publish the reviewed website, then perform the real Build → Test → Review → Play → Edit → Keep → Reload. Routine frontend deployments must preserve the approved backend. Keep child paid AI off.

This is **one sandbox-image release step**, not something to repeat for each cosmetic Pages deployment. It does not authorize continuously recreating Cloud VMs or unnecessary worker SHA/WIF rotations.
