# Jems production activation and exact-source release

## Current gate: collect evidence, then review the additional IAM scope

The owner authorizes the production cutover using existing working Adult AI, worker, data and spending settings. The owner **has not approved the additional IAM bindings or enabling the two dedicated Google deployment providers**. A first pinned, read-only Cloud Shell collection recorded the direct activation proposal but could not evaluate effective access. The diagnosed cause is a disabled Policy Troubleshooter API. The owner has now approved enabling only that diagnostic API and rerunning the read-only collection. Do not apply the deployment proposal, set release variables, enable federation providers or publish images before the owner approves that concrete scope.

[`production_activation.py`](../../scripts/ops/production_activation.py) is a read-only collector. It has no activation/apply mode. Its output is evidence for review, not an executable authorization or a production-readiness receipt. The operator command must identify an immutable helper commit, verified downloaded bytes and a fresh private output directory. The release operator supplies that complete command after source review and tests; this document deliberately supplies no placeholder command to paste into Cloud Shell.

Use the owner's existing authenticated Cloud Shell when Codex has no approved Google connection. Preserve the prior release journal and the separate Cloud Shell preflight/plan files. Do not overwrite a receipt to make a repeat look like an initial run. Keep full policies, service metadata and any account identifiers in the private output; share only the bounded review summary. Never print tokens, secret payloads, private application data or child content.

## What is known, and what still needs a fresh read

| Evidence | Scope and limit |
| --- | --- |
| Reviewed application `023377f146c5cafdf828a6ad84c4466f3d564ac3`; protected main `f60f3b8f8cab67c0b97b7b136e6ce94de3b51844` | Source comparison verifies unchanged application/service inputs. Both produce service archive SHA-256 `ac5e9c531c399f893714fab17acf3b199f6e483fc4aa2bc87c3804d2e0a011de` (547,960 bytes). This is source equality, not a new deployed source. |
| Claims-only [image run45197519609](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45197519609) and [release run45197525238](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45197525238) | Independently verified successful exact-main `f60f3b8…` claim checks; mutating jobs skipped. They prove the expected GitHub claim projection for that revision, not token exchange with Google or effective IAM. |
| Three service baselines/configuration fingerprints and Adult `CURRENT_STATE_VERIFIED` | Owner-reported Cloud Shell observations. The reported files are private Cloud Shell artifacts; the Adult continuity output was not retained as a saved receipt. They do not constitute the new collector's fresh IAM/effective-access evidence. |
| Worker `dddf53dbc76796be19782c1bb5bbb99b86e99909`, disabled deployment providers, unset release flags/identity variables, empty immutable `jems-release-images`, Pages source `6cc9c3801ccb7ae53d8eb9f708ae851699ac3f2d` | Owner-reported current operational baseline. Re-read the relevant state immediately before any later activation or release. Preserve the worker pin and its separate trust. |
| Earlier `plan-production` proposed grants | A historical proposal, not a complete live IAM audit. The newer collector supersedes its direct diff; effective access remains unresolved. |
| Owner-supplied collector summary, November 23, 2026, 15:24:58 UTC; helper `62ef419613e7bcdc18d4028115f4620c062c0044` | Reports `EXACT_DIRECT_SCOPE_RECORDED`, 11 proposed bindings, all five earlier files present, four predefined roles read and zero mutations. All 66 effective-access checks returned HTTP 403, so status remains `READ_ONLY_REVIEW_INCOMPLETE`. Full evidence stays private in Cloud Shell; this sanitized receipt does not establish the cause of the 403s or effective access. |

The collector must distinguish direct policy snapshots from effective access. Read the exact repository/service/account/project policies, role definitions, dedicated providers/pools, service runtime identities and GitHub release controls. Retain available ancestor-policy and IAM evaluation evidence; permission-denied, unsupported or indeterminate results remain explicit gaps. Do not broaden IAM to make the audit complete, enable an API as a side effect, or infer absence of inherited privileges from an empty direct policy.

## Read the collection result without treating it as approval

The reviewed command binds `--helper-sha`, `--release-source`, the two exact-source claims run IDs and a new `--output-dir`. For the immediate review, T may inspect main `f60f3b8…` using the two claim receipts above; the helper checkout must be clean, full-SHA pinned, and contain that inspected source as an ancestor. The collector rechecks protected main and repeated policy reads for drift.

| Private output | Purpose |
| --- | --- |
| `raw-responses.json`, `audit.json` | Retain source responses, fixed-resource state, independent policy reads, ancestry and finite Policy Troubleshooter observations/errors. |
| `proposed-activation-plan.json` | Exact before/after proposal when the required state permits one; absence means no complete proposal was produced. |
| `prior-file-comparison.json` | Existence/hash and available-field comparison of the exact owner-supplied preflight files; does not execute or modify old helpers. |
| `summary.json`, `SHA256SUMS.json` | Bounded review metadata and file integrity manifest. Keep full output private and preserve any partial directory after an error. |

`READ_ONLY_REVIEW_COMPLETE` describes collection, not authorization or an exhaustive IAM result. Inspect every error and `effective_unknown_count`; an unsupported or ambiguous permission tuple remains unknown even if its API request completed. `READ_ONLY_REVIEW_INCOMPLETE` or `READ_ONLY_REVIEW_STOPPED` leaves the missing evidence unresolved. Every result retains `activation_ready: false` and `mutations: 0`. The review hash binds evidence; it neither grants permission nor proves the proposed privileges are effective. No new activation approval should be requested from a partial diff as if it were complete.

### Diagnose a denied effective-access read

[`diagnose_iam_review.py`](../../scripts/ops/diagnose_iam_review.py) is a separate read-only follow-up. The pinned command verifies the original private evidence against its recorded manifest hash, preserves it, and writes into a new private directory. It performs one Service Usage GET for the Policy Troubleshooter API and one repeat of the exact recorded registry permission tuple. It retains bounded response/error bodies privately and prints only reviewed status/reason fields and evidence checks.

HTTP 403 alone cannot distinguish a disabled API, quota-project authorization or another permission restriction. An empty effective-grants list with unknown probes is not proof of denied access. Do not enable an API, grant an inferred troubleshooting permission, remove the quota-project header or switch identities to make this check pass. The diagnostic does not retry the entire IAM audit, prove recovery readiness, authorize the proposal or change the production activation gate. A successful single probe still leaves the other permission tuples unresolved until a fresh full collection.

The owner's November 23 diagnostic receipt subsequently established API disablement: the successful Service Usage read returned `DISABLED`, and the rejected troubleshooting request identified `SERVICE_DISABLED` for `policytroubleshooter.googleapis.com` and the expected consumer. The owner then explicitly approved enabling only that API using existing operator authority and rerunning the full read-only collection. This approval does not approve the proposed IAM bindings, dedicated federation providers, release variables, publishing or traffic changes.

The owner subsequently supplied successful completion of the approved single-service enablement command. The next handoff verifies the live API state with a read-only request, retains the response privately and reruns the existing collector in a fresh directory. It contains no enablement command. A failed or uncertain request is not automatically resubmitted; preserve the receipt and establish current state before deciding any recovery. A denied request does not authorize a role grant or another API enablement. Do not automatically disable the API afterward without checking current usage and obtaining the applicable operational authorization.

## Scope of the proposal to review

Only project `family-game-factory-jzw` (`1054529152893`), region `us-east5`, the existing `jems-release-images` repository and the three named services are enrolled. The proposed accounts are `jems-image-publisher@family-game-factory-jzw.iam.gserviceaccount.com` and `jems-cloud-run-release@family-game-factory-jzw.iam.gserviceaccount.com`.

| Target | Proposed identity and exact permission boundary |
| --- | --- |
| Artifact Registry `jems-release-images` | Publisher gets `roles/artifactregistry.writer`; release account gets `roles/artifactregistry.reader`. Neither grant belongs on the whole project. Preserve immutable tags and retained images. |
| Each of `factory-gateway`, `factory-preview`, `factory-coach-private` | Release account gets custom role `jemsProductionServiceRelease` with only `run.services.get`, `run.services.update`, `run.revisions.get`, bound separately on each service. |
| Production project | Release account gets separate custom role `jemsProductionOperationReader` containing only `run.operations.get`. This broader operation-metadata visibility needs explicit review; it is not service-update authority. |
| Each verified runtime account | Release account gets `roles/iam.serviceAccountUser` only on that exact account. Expected accounts are `factory-gateway`, `factory-preview` and `factory-coach` in the production project; confirm live service identity before proposing a binding. No project-wide `actAs` or Token Creator. |
| Each dedicated publisher/release account | One separately restricted `roles/iam.workloadIdentityUser` binding for that lane's exact reviewed GitHub subject. Preserve issuer, audience, repository/owner immutable IDs, protected-main workflow, environment and GitHub-hosted runner restrictions. No cross-lane or private-worker trust changes. |
| Dedicated providers | Enable only `github-main` under pools `jems-github-image-publish` and `jems-github-cloud-run`, after the existing disabled definitions exactly match reviewed trust. Do not create replacement providers or rewrite conditions to accommodate a mismatch. |
| GitHub repository variables | Set only the four lane identity variables below after approval. Both release enable flags remain absent until actual federated access and permission checks pass. |

The exact lane variables are:

| Variable | Proposed value |
| --- | --- |
| `JEMS_PUBLISH_WIF_PROVIDER` | `projects/1054529152893/locations/global/workloadIdentityPools/jems-github-image-publish/providers/github-main` |
| `JEMS_PUBLISH_SERVICE_ACCOUNT` | `jems-image-publisher@family-game-factory-jzw.iam.gserviceaccount.com` |
| `JEMS_RELEASE_WIF_PROVIDER` | `projects/1054529152893/locations/global/workloadIdentityPools/jems-github-cloud-run/providers/github-main` |
| `JEMS_RELEASE_SERVICE_ACCOUNT` | `jems-cloud-run-release@family-game-factory-jzw.iam.gserviceaccount.com` |

An activation implementation must be separately reviewed after the fresh diff is available. It must re-read the approved baseline, refuse changed source/policies/trust/runtime identities, preserve unrelated bindings and use supported concurrency preconditions. Persist the exact intent before the first write, record each completed write, and recover by readback after interruption rather than blindly replaying a batch. Provider and GitHub-variable updates need explicit pre/post comparison where the API lacks conditional-write support. No such mutations are implemented by the read-only collector.

## Keep tool, publication and intent revisions distinct

Use the following identities; these are explanatory names, not runnable placeholders.

| Identity | Meaning |
| --- | --- |
| **T** | Immutable reviewed collector/tool commit. It may be an unmerged read-only helper whose ancestor is the live protected main being inspected. Running T to inspect `f60f3b8…` does not make T a release candidate. |
| **S** | Final **merged** release source. If the helper or verification workflow is merged first, freeze that resulting main SHA as S and prove that its approved application/service inputs remain identical to `023377f…`. |
| **D** | Immutable per-service image digest published from S, with matching OCI source label and signed GitHub provenance. |
| **R** | Later protected-main release-intent commit referring to source S and image D. It changes the reviewed intent/compatibility record; it does not relabel or rebuild the image. |

The current image publisher has no `source_sha` override: archive staging, image labels, tags and signed provenance use its **`GITHUB_SHA`**. Publish while S is current protected main. Never publish a newer commit and put the older approved `023377f…` in `intent.source`, even when the application bytes match. Do not weaken the attestation source check or dispatch from a detached/tag ref to avoid this sequence.

Before activation, S needs its successful exact-main Arcade run and all applicable checks, plus fresh claims-only runs in both lanes. The f60 claim receipts remain historical after main advances. Obtain owner approval for the exact live activation diff, then revalidate it before any later mutation.

After publication, commit R with `ops/compatibility.json` identifying S, service, D, baseline revision/image and the successful main-push Arcade run for S. `ops/release.json` must agree and bind the SHA-256 of the exact compatibility file bytes. The controller requires S to be an ancestor of R and current main to equal R. Signed-image verification still requires source digest S and `refs/heads/main`. Later stage/canary/promote intents can retain S and D without republishing images.

Pages subsequently dispatches from current main with input `source_sha` equal to S. Its ancestry check permits this; `build-info.json`, `jems-release.json`, service OCI labels, signed provenance, compatibility source and intent source must all agree on S. The final image digest cannot appear in the same immutable source commit that produces it, so publication and release intent are separate commits.

## Release-specific checklist after explicit IAM approval

1. **Reconcile and preserve.** Freeze merged S and its checks/claims; retain fresh exact IAM diff and owner approval, previous service revisions/images/configuration fingerprints, Pages artifacts, private journals, parent backups and worker/runtime identity. Verify in-flight paid work and receipt state before any cutover. Source tests do not prove actual backup or drain readiness.
2. **Activate only the approved diff.** Use the reviewed, idempotent, receipt-backed operator procedure, rechecking state before writes. Keep `JEMS_IMAGE_PUBLISH_ENABLED` and `JEMS_CLOUD_RUN_RELEASE_ENABLED` absent. Do not use `deploy.py`'s inactive bootstrap or the historical PR107 apply pathway against working production.
3. **Prove GitHub-to-Google access without publication.** The prepared optional `verify_access` modes in the same two workflows are default-off and mutually exclusive with `verify_identity`. They require protected main, the correct lane environment and both enable-flag values to resolve empty. GitHub expressions cannot distinguish absent variables from stored empty strings; a fresh collector/API read must separately establish actual absence. After approval and activation, use fresh exact-S runs to verify actual federation, the effective Google account using the same short-lived token, registry/service/runtime-account/operation permissions and selected excessive-permission denials. The bounded receipts are point-in-time permission evidence, not an exhaustive IAM proof or application health test. The source addition is not yet a successful live proof.
4. **Publish S.** Only after the access proofs and release gates pass may the corresponding enable flags be set through a separately reviewed concrete step. Publish immutable candidate images from current S; independently verify digest availability, labels and signed provenance before making an intent. Preserve old images and spending/provider settings.
5. **Stage compatible backends.** Reassess whether Preview needs any change; unchanged compatible Preview may be retained. Stage Gateway and private Coach with exact digest/configuration and baseline traffic preserved. The existing controller's `stage` verifies revision readiness, image and configuration metadata; it creates **no candidate tag or routable candidate URL**. It does not provide a pre-traffic HTTP smoke test.
6. **Canary, observe, promote.** The established path shifts 5% to the candidate, then performs authorized functional smoke and sanitized monitoring before promotion. Prove legacy and v2 Coach behavior, gateway request lookup, old worker callbacks, trusted-device/Adult separation and receipt settlement. If pre-traffic HTTP acceptance is mandatory, stop and review a narrowly scoped routing capability; never call metadata staging a functional test. Gateway and private Coach must be compatible and fully serving before dependent Pages publication.
7. **Publish Pages S and accept the live product.** Require the build and all eight release shards. Verify actual production manifests/assets/configuration, clean and compatible returning sessions, Games/Mining/Factory/Bubble Gum/Coding, profiles/Notifications, Coach v2.1 and saved-work continuation. Perform bounded Adult Build → Review → Play → Keep → Reload only with existing valid grants, consent/provider settings and allowance; never replay uncertain paid requests or activate child paid AI for a test.
8. **Recover safely and close.** Use retained compatible backend traffic recovery only after draining incompatible writers. Keep readers for v2 evidence, chapters, Notifications and pending identities; an old website is not a no-loss fallback. Retain an approved authenticated operator route if a new rollback-intent PR cannot pass protected-main checks. Record actual serving revisions/digests, traffic, Pages deployment/source, acceptance and limitations in delivery state. No live completion claim precedes observed acceptance.

The [Coach/reliability release control](COACH_RELIABILITY_RELEASE_CONTROL.md), [continuity contract](../assignment-006/RELEASE-CONTINUITY.md), [Coach evaluation gate](../design-coach/RELEASE_AND_EVALUATION.md) and [storage/rollback contract](../child-continuity/RELIABILITY-2026-11-23.md) remain applicable. This runbook neither expands the private-worker release scope nor authorizes PR106, provider activation, additional spending or destructive storage changes.
