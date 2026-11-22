# Private-coach readiness repair rollout

This operation releases [PR131](https://github.com/jzwyrzyk/family-game-factory/pull/131)'s private readiness representation. The observed Adult failures reached reply validation and returned `readiness_invalid`; a later connected banner indicates a successful turn under the reviewed frontend contract. The repair addresses the mismatch between allowed model output and exact host evidence requirements. A serving receipt alone does not establish reliable live conversation.

## Bound source and configuration

The tested application head is `ae084f6b2b0364830adc9ae47c87046cbf7c2d72`, tree `2938d39799d66ac8d7a409dd0ad2208bd957aeb7`. The selected release source must be on protected main and have exactly that complete tested tree. Exact-head hosted checks, the application's clean checkout and absence of newer private runtime changes are checked before execution. Source preparation does not assert these gates have passed; the dated delivery record carries their observed results.

The starting private revision is `factory-coach-private-chatdiag-b4734b1323de-a14b8b`, from application source `b4734b1323de87dfee96bb91769cbab3cff432e6`. The wrapper allows private runtime changes only in `server/coach/private-provider.ts`, `server/coach/policy.ts` and `server/coach/private-creation-wire.ts`. Runtime dependencies, Docker inputs, shared validators and publisher modules remain bound. The older diagnostics operator at `9986ab4be38680cc8f2a9cc29f823b440ce03319` is not suitable for this release.

The current operator retains the filename [release_coach_diagnostics.py](../../scripts/deployment/release_coach_diagnostics.py) at a new immutable tool commit. It uses the unchanged release primitives at `804574895d8ab86fe270e590ecfa05fa5d4bc290`, limiting writable service resources and transition order to `factory-coach-private`. Service identity, internal ingress, environment, numeric secret references, networking, resources, scaling, concurrency, deadlines and IAM are preserved. The gateway is a read-only drift guard during forward execution and resume. Model settings, budgets, normal-profile access, dictation, worker, Pages and PR107 activation are outside this operation.

## Dynamic budget preflight

The [operator-local budget helper](../../scripts/deployment/coach_release_budget.cjs) loads the selected application's `prepareCreationWire`, policy and configuration. It includes actual projected input and dynamic schema bytes in each synthetic reservation, matching the runtime's accounting. Original public context length remains the input-limit check. The old primitive helper's static context/schema estimate is insufficient for this representation.

The helper emits bounded arithmetic and approval/pinning booleans, never context text or credentials. Its synthetic examples are lower-bound checks, not a guarantee that every larger conversation fits. No universal context-byte allowance is inferred from a context-dependent schema. No model, moderation or secret-value call occurs during preflight.

## Low-space preparation and persistent state

Use the separately checksum-verified readiness bootstrap with the published operator, merged application and tested-head pins. It stages code, locked dependencies, Node 22.23.5, npm cache and temporary archives under `/tmp`. The previous HOME-staging `run_coach_diagnostics.sh` is historical; it is not the entry point for this repair.

Only the small private state and locks belong under:

```text
$HOME/jems-releases/coach-readiness-<full-application-SHA>/
    bootstrap.lock
    state/release.lock
    state/release.json
```

Reproducible files use `/tmp/jems-coach-readiness-<uid>-<source12>-<tool12>/`. The bootstrap requires 8 MiB of persistent journal headroom, 3 GiB before fresh temporary setup and 256 MiB before running the operator. It makes no HOME cleanup decision. The comprehensive storage audit remains a separate task.

Keep the old `coach-diagnostics-b4734b...` state intact. A fresh readiness release has its own purpose, source, tool, nonce, build and candidate identities. Never copy, repin or reset the old completed journal to begin this release. The active journal stays private and outside all three clean checkouts.

## Execution, interruption and rollback

The operator defaults to a cloud-read-only plan. `--execute` follows the existing sequence:

1. Verify exact source/checks, repository/project, the serving baseline, identity, pinned configuration and dynamic budget arithmetic.
2. Save the journal before submitting one Cloud Build. Bind source archive, build identity, labels and immutable registry digest. Cloud Build includes a non-root, network-disabled import of the bundled private executor.
3. Journal and conditionally stage the image with zero traffic. Compare the created revision with the preserved configuration.
4. Journal and conditionally promote the private candidate; verify its configuration, IAM, traffic, digest and unchanged gateway.

The final readiness serving receipt reports the source/tool/tested identities, build, immutable image and captured rollback revision. `providerCall:false` and `conversationVerified:false` remain explicit.

Resume with the same tool, source and journal. A submitted build is recovered through its recorded ID or unique release tag; an uncertain service write is observed instead of automatically replayed. During forward execution/resume, source, gateway, IAM or configuration drift requires inspection, never deletion of the journal or weakening of a comparison.

Use the same bootstrap's `rollback` mode to restore the captured **chatdiag baseline**. Cached rollback needs no Node/npm installation, GitHub source fetch, new image build or provider request. It validates local source/tested/tool/journal identity and private-coach baseline, configuration and IAM; it deliberately does not require fresh protected-main or gateway-drift checks. This is the inherited recovery behavior. An unavailable cached checkout or original journal is a stop. A release marked for rollback cannot subsequently be promoted by rerunning execute.

## Live acceptance

After a verified serving receipt, one explicit Adult chat attempt must receive a visible validated reply. An incomplete idea should retain a contextual follow-up and disabled Build; a coherent idea may be ready, with building still requiring the user's action. Do not automatically retry a paid request. Under the reviewed UI, `available` is status-only while `connected` follows an accepted model turn.

If that attempt fails, inspect only the fixed failure fields for the exact new private revision: timestamp, revision, stage, reason, elapsed milliseconds and optional provider status/incomplete reason. Bound the query to five records in fifteen minutes. Do not publish complete payloads, source text, provider bodies or the private release journal. Normal-profile unavailability under the existing Adult-only setting remains a separate policy boundary.
