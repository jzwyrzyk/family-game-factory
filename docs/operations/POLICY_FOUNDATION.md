# Operations policy foundation

## Why this is separate from release activation

On November 21, 2026, the active main ruleset required **Jems operations policy**,
but its workflow existed only in draft [PR107](https://github.com/jzwyrzyk/family-game-factory/pull/107).
That ordering blocked the game-generation repairs in
[PR111](https://github.com/jzwyrzyk/family-game-factory/pull/111) and the related
release work. The owner directed that the game fixes ship now.

This foundation installs the actual policy check and its complete source/test
dependencies from PR107 at `2ced4fb227b94c9ad216ad58aed41b35072e7e23` on current
main `c43a18148421ea22edfba5f7e891530678ad4f4f`. The workflow, tests, operational
modules and fixed fixtures are copied without changing their assertions or
behavior. It preserves the newer PR108 application and packaging work.

## Installed validation

The [operations contracts workflow](../../.github/workflows/jems-operations-contracts.yml)
runs on pull requests and pushes to main with a read-only repository token:

1. Run every `test_*.py` in `scripts/ops`, including the release-controller,
   scoped-log, exact-identity and administrator-plan failure cases.
2. Build and boot both fixed synthetic images as non-root with network access
   disabled for their build/run commands; check health and reject POST requests.
3. Validate any nonempty [release intent](../../ops/release.json) against its
   immutable image and compatibility record.

The checked-in intent and compatibility files remain `{}`. The policy check
does not authenticate to Google Cloud, request an OIDC token, publish images,
dispatch production workflows or modify a service. Local fixture success and
the synthetic Docker smoke do not establish a live Cloud Run rollout drill.

## Boundaries that remain separate

The privileged `jems-service-images.yml` and `jems-cloud-run-release.yml`
workflows are **not installed by this foundation**. Their installation and
activation remain in PR107, with the scoped account setup, actual claim proofs,
Logging redaction proof and isolated live drill still outstanding. Keep
`JEMS_IMAGE_PUBLISH_ENABLED` and `JEMS_CLOUD_RUN_RELEASE_ENABLED` unset.

The administrator and controller modules are included so their real guard
tests can run. They are not run against an account by CI. The administrator
program still requires a clean checkout pinned to the current open draft
PR107 and authenticated administrator access. Mutations and dispatches also
require a fresh plan-bound review code; the default plan is read-only.
The foundation does not make an old review code valid. Diagnostic clients also
retain their separate managed-identity and network prerequisites.

Existing main protections, six required checks, zero mandatory human approvals,
no-bypass policy and exact-main environment restrictions remain unchanged.
No release check is synthesized or replaced with an unconditional success.

## Game-fix integration

After this foundation passes the actual required checks and merges, update
the game-fix branches from main and review any combined documentation changes.
The ordinary protected merge and existing deployment path can then ship the
game fixes. PR109 owns the coordinated PR108 backend/website cutover; PR111's
gateway fix must use the serving baseline verified after that cutover. PR110
preserves repair helpers and receipts and is not a runtime prerequisite.

Record actual source merges and deployment results in
[delivery state](../../DELIVERY-STATE.md). The current split changes the missing
CI dependency; it does not claim any pending cloud setup or gameplay acceptance
has succeeded.
