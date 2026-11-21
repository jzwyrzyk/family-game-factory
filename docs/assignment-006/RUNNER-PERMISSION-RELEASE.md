# Production runner permission repair

## Observed failure and merged correction

Adult build [44872847752](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44872847752) completed generation at private source `52729ad231179d633b2f15fa910aa2b23273a2d6`. Prepare and cleanup failed to mint their runner App tokens with HTTP 422. The VM provisioning step was skipped, as were isolated testing and quality review.

The owner's metadata read identified App `5776342`, slug `family-game-factory-runner-admin`, installation `182384961`. Installed grants were repository Administration write, Metadata read and organization Self-hosted runners read. The organization runner APIs need Self-hosted runners write; private main/tag verification needs Contents read. The workflow explicitly requested Administration write and organization runner write, omitting Contents read.

[Private PR17](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/17) replaced the two unnecessary Administration token requests with Contents read. The two token steps remain scoped to the one private repository, use the same infrastructure-only App secret and retain organization Self-hosted runners write. All 170 offline tests and both hosted jobs in [44873596521](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44873596521) passed. The merge `ca2989988fd1cd66d9a858cbf167dd4a995640fc` has exactly reviewed tree `26a00dc72d4b39d12aa1b54dadfd38765b21b662`.

## Owner installation update

In the runner App registration's Permissions & events, set repository Contents to read-only and organization Self-hosted runners to read and write. Save and approve the new grants on [the existing organization installation](https://github.com/organizations/family-game-factory-lab/settings/installations/182384961). The release helper reads the installed grants before any mutation and rejects an incomplete approval. No new App or key is required.

This runner App is separate from the gateway App installation `182382304`, whose [configuration repair](GITHUB-INSTALLATION-REPAIR.md) is already accepted.

## Coordinated production switch

The owner-run `scripts/deployment/rotate_private_worker_pin.mjs`, alongside `repair_github_installation.mjs`, takes `--private-sha ca2989988fd1cd66d9a858cbf167dd4a995640fc --apply`. Omitting `--apply` is read-only.

It verifies the exact new main tree, installed runner grants, unchanged approved flag and sandbox image. It resolves the current config version 7 from the known repaired gateway revision and changes only `workerApprovedSha`. The corrected gateway installation, session keys, adult restrictions, prices, limits and all other settings are preserved.

The helper creates a missing immutable execution tag, stages the same gateway runtime with the new numeric secret version, verifies the complete config/runtime difference and checks the candidate through a temporary zero-traffic tag. It then replaces only the old private SHA in the existing WIF condition, updates the private SHA variable, promotes the exact checked revision, verifies canonical health and trust coherence, and removes its own temporary tag. Zero-traffic `latestReadyRevisionName` need not equal the candidate. A previously staged matching candidate can be resumed after exact verification.

Failed staging leaves the previous serving traffic unchanged. Applied-but-error trust changes are read back before safe restoration. Failed canonical health attempts to restore previous traffic and changes to WIF/variable values. The helper never rewrites main, resets a job, changes approval or recreates session/budget state. Traffic rollback alone is not a coherent release rollback after main has moved; an incomplete receipt must be resolved before another game attempt.

Eight independent offline scenarios verify success, missing grants/identity drift, plan mode, Retired staging, staged and live health failures, ambiguous trust writes and concurrent configuration preservation. These tests make no real cloud/API calls. A production `ROTATION_STATUS=SUCCESS` receipt remains pending at this source publication.

## Next acceptance

Public application `b472c224f7e8ef8ab0986ce6f755728d7cc63d46` and sandbox `sha256:83be22b96cdd83eaefa80c0ae321208bdff63f4ee926cc5ae28d064f91cee089` stay unchanged. No new website/image build or repeat of unrelated application regressions is needed for these two permission lines; the existing nine-job production smoke receipt remains evidence for its original scope.

After a verified switch, use a fresh adult Build request. A GitHub rerun of the failed workflow would violate the deployed `run_attempt=1` identity policy. The owner explicitly authorized additional game attempts while completing this repair. Complete Build → Test → Review → Play → Edit → Keep → Reload acceptance; child paid AI remains disabled and issue #93 remains open until acceptance is actually observed.
