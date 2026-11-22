# Private-coach diagnostic rollout

This is the owner-approved, narrowly scoped rollout of [PR124](https://github.com/jzwyrzyk/family-game-factory/pull/124)'s conversation-failure diagnostics. It publishes one private-coach image and updates only `factory-coach-private` in `family-game-factory-jzw`, `us-east5`. It does not establish that the original conversation failure is repaired.

## Source and operational boundaries

The application source must be the reviewed merged PR124 tree. The exact hosted-tested head is `5688bb3f6a01a766af8b78c783faccd8cce8f89c`; its tree is `d50cd56848fd3f31ad3eab323d5e4fbc36e111a9`. The operator checks source/tested tree equality, successful exact-head checks, protected-main ancestry and the absence of a later private-coach runtime change. The [delivery ledger](../../DELIVERY-STATE.md) records observed merge and deployment receipts separately.

The operator reuses the release primitives at immutable source `804574895d8ab86fe270e590ecfa05fa5d4bc290`. Those primitives contain the previously exercised journal, conditional Cloud Run replacement, configuration comparison, build provenance and recovery checks. Their historical coordinated-release entry point is not executed. The wrapper restricts writable service resources to the private coach and narrows the component order to that single service. It uses the current reviewed `build.py` source archiver and `build_coach.py` configuration, because the historical source archive scope predates newer package inputs.

The approved starting revision is `factory-coach-private-pr115-19f5e46ae114-fb5fa6`, from source `19f5e46ae1141da3df7bf14d682757de7e9aec69`. The operator rejects a different serving baseline or a service template that disagrees with its serving revision. Private executable changes are limited to `private-provider.ts` and `private-executor.ts`, with package script changes excluded from the runtime comparison. The three previously approved Pal allowlist additions in `.dockerignore` are accepted only at exact Git blob `a1dc71d4b19121f33ca69d9e65fa3f8c5251f858`; later ignore-file drift still blocks release. Runtime dependencies and Dockerfile settings remain bound.

It preserves the observed service identity, internal ingress, environment, numeric secret references, networking, scaling, resources, concurrency and deadlines. IAM is read and compared. The gateway is captured as a read-only guard, so an overlapping gateway change stops continuation instead of being overwritten. Pages, preview, worker, sandbox, provider settings, approved audiences and PR107's release activation are outside this operation.

## Cloud Shell prerequisites

Use the owner's existing GitHub and Google Cloud authentication. The script does not change either CLI's authentication configuration or grant permissions. Required local tools are Git, GitHub CLI, gcloud, Python, Node, npm and flock. Docker runs in the existing Cloud Build service; local Docker execution is not needed.

Use clean checkouts for three distinct roles:

1. The pinned operator source containing `scripts/deployment/release_coach_diagnostics.py` and the current publisher modules.
2. The exact merged application source to archive and inspect.
3. The pinned `80457489…` primitive source.

The operator checkout must also contain the merged application, tested head and deployed source Git objects. Fetch those exact immutable SHAs; a shallow checkout containing only the operator commit is insufficient. Install the application's locked dependencies with `npm ci --include=dev --ignore-scripts --no-audit --no-fund` for the local budget arithmetic check. That check uses synthetic contexts and never calls a provider.

Keep the state directory outside all three checkouts, private to the owner. Its journal contains operational configuration and must not be committed or pasted into chat. The operator prints only selected release metadata and fixed failure codes.

### Cloud Shell disk recovery

The owner observed an exhausted persistent home disk during bootstrap: 4.8 GB total, 4.6 GB used, zero available bytes and only 8% of inodes used. The VM filesystem containing `/tmp` had 9.7 GB available. The incomplete operator checkout occupied 464 MB, had no checked-out commit, and reported its source files as untracked. Application and primitive checkouts had not been created and no release journal existed. The preservation attempt then failed at `mktemp`, before moving the checkout or invoking the operator. These observations establish a local storage failure, not the cause of the earlier private chat HTTP 503.

The pinned [low-space recovery bootstrap](../../scripts/deployment/resume_coach_diagnostics_low_space.py) keeps reproducible checkouts, locked npm dependencies, Node and package caches in a private `/tmp` workspace. It invokes the unchanged approved operator at `9986ab4be38680cc8f2a9cc29f823b440ce03319`, with application `b4734b1323de87dfee96bb91769cbab3cff432e6`, tested source `5688bb3f6a01a766af8b78c783faccd8cce8f89c`, and primitives `804574895d8ab86fe270e590ecfa05fa5d4bc290`. The existing source-keyed persistent release directory, bootstrap lock and `state/` journal remain the recovery authority. Temporary workspace loss permits reconstruction of the same source; it never permits replacement of the journal or replay of uncertain cloud operations.

Home-space recovery is limited to downloaded npm cache content and, only if needed, the Git-ignored installed `node_modules` in the exact historical PR115 application checkout. That fallback checks repository identity, the deployed source, the dependency directory and the absence of tracked files before removing installed packages. Source files, lockfiles, the incomplete checkout and release journals are retained. The old PR115 rollback does not require npm installation. The helper checks free bytes before preparing the temporary checkouts and before invoking the operator. It does not replace `HOME`, expand service scope, change model settings or perform a model call.

Use the separately supplied immutable recovery-helper commit and SHA-256 in the owner handoff. The application and release-operator pins above do not change when this bootstrap is published. A successful local preparation or offline check is not a deployment receipt; `COACH_DIAGNOSTICS_SERVING` and subsequent explicit conversation acceptance remain required.

The helper accepts `execute`, `plan` or `rollback`. Reuse the same pinned helper after an interruption; its temporary checkouts are reusable, and missing temporary files are reconstructed against the same persistent journal. Cached rollback checks existing Git objects locally and does not refetch them or reinstall npm dependencies. At least 8 MiB of persistent space is required for journal updates; new temporary checkouts require 3 GiB, and the execution/plan handoff checks for another 256 MiB of temporary headroom after dependency installation.

Eight focused offline checks cover narrow cache cleanup, real Git-worktree dependency cleanup, source/journal preservation, dirty-source and symlink rejection, cached-source reuse, competing locks, one operator invocation with the original journal, and checksum rejection before executing a downloaded binary. The actual official Node 22.23.5 download, checksum, extraction and npm 10.9.9 setup also passed with cache/log/temporary paths confined to its temporary workspace. These checks made no Google Cloud or model calls.

## Execute and resume

The checksum-verified `run_coach_diagnostics.sh` bootstrap accepts the immutable operator SHA, merged application SHA and `plan`, `execute` or `rollback`. It prepares the three clean checkouts and required Git objects, records a successful locked dependency installation, and serializes the entire invocation with a local lock. Its stable source-keyed directory makes the same handoff resumable. The underlying invocation is:

```bash
python3 "$JEMS_COACH_TOOL_DIR/scripts/deployment/release_coach_diagnostics.py" \
  --reviewed-source-sha "$JEMS_COACH_SOURCE_SHA" \
  --tested-source-sha 5688bb3f6a01a766af8b78c783faccd8cce8f89c \
  --application-dir "$JEMS_COACH_APP_DIR" \
  --primitives-dir "$JEMS_COACH_PRIMITIVES_DIR" \
  --state-dir "$JEMS_COACH_STATE_DIR" \
  --execute
```

Without `--execute`, the operator performs its cloud reads and displays a plan; it makes no cloud mutation. Execution follows this sequence:

1. Verify source, checks, repository/project identity, serving configuration and locally calculated coach budget.
2. Record a private journal before submitting one Cloud Build. Bind the source archive, immutable source, dedicated build identity, exact executable steps and unique release tag. Verify the returned build and registry digest. The image also passes a non-root, network-disabled import check inside Cloud Build.
3. Record and conditionally stage the immutable image with zero traffic. Validate the API's proposed settings, preserve the current resource version, and compare the actual created revision against the expected configuration.
4. Record and conditionally promote only the private-coach candidate. Read back its exact revision, digest, full configuration, IAM and traffic, and verify the gateway guard.

A successful run prints `COACH_DIAGNOSTICS_SERVING` with the candidate revision, immutable image, build ID, source/tool identities and rollback revision. It explicitly reports `conversationVerified:false` and `providerCall:false`.

If interrupted, rerun the same command with the same tool and state directory. An attempted build is recovered through its recorded ID or unique release tag; it is never automatically resubmitted. Attempted service writes are observed and reconciled rather than replayed. Keep the journal when an operation is uncertain. A baseline, source, IAM, configuration or journal mismatch is a stop requiring inspection, not permission to delete state or relax a comparison.

## Rollback

Use the same invocation and original journal, replacing `--execute` with `--rollback`, or select the bootstrap's `rollback` mode. The bootstrap reuses existing pinned checkouts and Git objects without GitHub fetches or reinstalling dependencies; Git, gcloud, Python and flock must remain available. It restores the captured private-coach traffic through the existing conditional recovery path without a build or model request. The candidate remains available as a revision; rollback does not delete resources or rewrite the other services. A release marked for rollback cannot subsequently be promoted by rerunning `--execute`.

## Conversation acceptance

After deployment, make one explicit text-chat attempt through a valid Adult profile. Do not automatically retry a paid request. A configuration/health response is not conversation acceptance.

For a failed attempt, read only `jems_private_coach_failure` events for the exact candidate revision. Scope the query to the project, region and private-coach service, bound it to five entries in fifteen minutes, and project only timestamp, revision, `stage`, `reason`, `elapsedMs`, `providerHttpStatus` and `incompleteReason`. Do not print complete log payloads, provider bodies, prompts, replies, request headers or the private deployment journal.

The event identifies a failing step and category. For example, an inference output-limit category supports a token-limit diagnosis; an inference HTTP400 identifies a rejected provider request but does not itself identify the invalid parameter. A failed POST without an application event can still involve a platform-level or pre-handler failure. A successful visible, validated reply is distinct evidence and must be recorded separately from the instrumentation rollout.

Normal-profile chat remains subject to the current Adult-only pilot policy, and private dictation remains disabled. Neither setting is changed by this diagnostic operation.
