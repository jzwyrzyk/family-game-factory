# Keeping the project context current

The development author owns the documentation impact of a change; the reviewer checks it alongside the implementation. The release operator owns the corresponding delivery evidence. These are roles in the existing workflow, not a new approval committee. Existing user authorization remains valid for its stated scope.

## 1. Update at the event that changes the truth

| Event | Required update |
| --- | --- |
| Accepted product intent, principle or meaningful tradeoff changes | Update [doctrine](../../PRODUCT-DOCTRINE.md), the relevant feature contract and an [ADR](../decisions/README.md). Link the actual supporting decision. |
| Components, route contracts, persistence, trust or compatibility changes | Update [architecture](../../ARCHITECTURE-CURRENT.md) and affected feature/runbook documents in the implementation PR. |
| A feature or fix changes behavior, acceptance, limitations or operating method | Update the affected feature document, test/evidence links and relevant canonical summary. |
| Source changes without changing documented behavior | Inspect the diff and persist a specific **unchanged** review reason in the registry. Do not make meaningless prose edits. |
| A PR merges, is superseded, is closed, changes its dependency, or enters/leaves release scope | Refresh affected entries in [delivery state](../../DELIVERY-STATE.md); preserve the distinction between integration and live operation. |
| Deploy, activate, rollback, incident or live acceptance | Record environment, audience, exact source/image/config identity, observed result, evidence link/time and remaining gaps in delivery state. A failed or unverified attempt is also a result. |
| A Gem Pal direction, selected asset, growth rule, or recurring quality lesson changes | Update the established character-reference index and applicable [Studio guide](../pals/STUDIO.md); preserve superseded references and scope corrections. Review the `pal-design` area. Keep personal skill distributions routed to the repository or explicitly dated. |
| A new document or code area is introduced | Add its entry point to [the index](../README.md) and route the new source paths in [the registry](registry.json). |

Make code and document changes in the same PR where possible. Post-merge or external operational facts necessarily arise later: add a small documentation follow-up promptly rather than pretending a premerge record knew the outcome. Do not rewrite historical test results or old deployment evidence to look current.

## Environment evidence and automatic status

The [DEV → TEST → PROD contract](../development/DEV-TEST-PROD.md) governs preview, TEST, approval and release reporting. Route environment scripts, workflows, tests, infrastructure and these contracts through the review registry. Automated summaries may update factual deployment states only from validated run, artifact and resource receipts for the exact source. They must not infer owner acceptance from CI, approval from a merge, or production deployment from integration. Keep failed, expired, stale and unknown states visible. A generated directory/PR summary complements delivery state; it does not silently rewrite doctrine or historical receipts.

After setup, two-preview acceptance, complete TEST acceptance, production promotion or recovery, record the actual observation and remaining definition-of-done gaps. Do not mark the method complete merely because source or infrastructure exists.

Creative asset PRs identify the workstream responsible for the shared interface, affected consumers, and the exact base of each dependent PR. Review reference remapping, archive behavior and parent backups when adding a new destination. The [Creative Asset & World Design Standard](../creative-universe/STANDARD.md) defines the shared contract.

## 2. Use the review registry

The problem-solving feature has a dedicated review area for its evidence schema, deterministic practice, reports and tests. Its standards/claim contract is linked from product and experience reviews, while source hooks remain in their existing subject, Creation and Studio areas.

The Art Studio area similarly routes private drawing storage, picture/movement editing, portable art and the focused integration tests. Changes to native revision bindings and local scene references also require their existing experience, games and Creation reviews. Art evidence and camera/device limitations belong in the feature record; a green local browser run does not establish a website release or cloud storage.

The dependency-free checker reads [registry.json](registry.json). Each area lists the source paths that affect it, documents to review, a content fingerprint and the explicit review outcome/reason. The fingerprint includes path/content changes and routing definitions, so a stale branch cannot silently reuse a review made against different source. It is a change detector, not an assertion that an assistant understands the code.

Changes to the registry's areas, routing, required files, link scope or review intervals also require an explicit **context** review. That review includes the normalized registry policy; review timestamps and outcomes are excluded to avoid hashing the registry into itself. Removing the context area is invalid. Broad source rules in other areas must not include the registry.

Run the checks with Node 22, without installing application dependencies:

```sh
npm run docs:check
```

For each reported area, inspect its source diff and the linked documents. Correct the documents, or decide that the documented contract remains accurate. Then record that review:

```sh
npm run docs:review -- services --outcome updated --reason "Documented the new session route and its revocation contract."
npm run docs:review -- validation --outcome unchanged --reason "Only corrected a test fixture; subject selection, scoring, persistence and evidence labels are unchanged."
npm run docs:check
```

These examples illustrate two different outcomes; they are not commands to run blindly. Commit the registry update alongside the change. There is no routine refresh-all operation. A timestamp or fingerprint refresh without inspecting the relevant source and prose defeats the purpose.

For a PR-range check:

```sh
npm run docs:check -- --base BASE_SHA --head HEAD_SHA
```

An **updated** review for an impacted area must have an applicable document change in the PR. An **unchanged** review must have a concrete explanation. Neither a general checkbox nor a single global "docs not needed" label replaces the area review. A source path without an assigned area must be routed explicitly. The registry declares the link-check scope; legacy evidence archives are not advertised as exhaustively checked.

## Starting a session and adding a regression

Read the current sections of the three root references, inspect related open PRs and diff the last verified source against current main. Use the dated [delivery](../history/2026-11-26/DELIVERY-STATE.md), [architecture](../history/2026-11-26/ARCHITECTURE-CURRENT.md) and [doctrine](../history/2026-11-26/PRODUCT-DOCTRINE.md) records for historical questions. Keep new dated receipts in the relevant evidence record and link them from current state. Maintain old heading routes when archiving.

Add a regression to its applicable npm test chain and shard. Run `npm run test:ci`. The independent frozen argv inventory in `scripts/ci/retained-coverage.json` protects the historical groups against coordinated deletion. Additions are discovered from npm and verified against the assigned commands. Hosted CI also reads the independently committed PR base or preceding main commit so regressions added after the freeze remain protected on later changes. Review command identities, fixture prerequisites and cross-group duplication. Local editing checks never issue hosted receipts.

## 3. Automatic repository checks

CI policy and test assignment are maintained with application contracts. Changes to the test manifest, classifier, aggregate checks or evidence verifier require validation and delivery reviews. New suites must have an explicit shard assignment; the coverage check rejects missing, duplicated and unassigned commands. Compare elapsed time, cumulative runner minutes, queue time and first-attempt outcomes before claiming a speed improvement. Preserve failure receipts and distinguish fixture regression from visual, device, provider and owner acceptance. See the [CI evidence guide](../evidence/README.md#ci-architecture-and-performance).

The shared DEV/TEST evidence adapter is maintained with CI at `scripts/environments/ci_evidence.py`; run `python3 -m unittest discover -s tests -p test_environment_ci_evidence.py -v` after changing it. Mandatory Arcade preparation runs the same negative checks. Keep PR155 consumers on this implementation, preserve fresh exact-main TEST eligibility, and treat preview archive identity and deployed acceptance as separate evidence. Do not duplicate a weaker success-only check in an environment controller.

[Documentation workflow](../../.github/workflows/documentation.yml) runs on pull requests, pushes to main, a weekly schedule and manual dispatch. It checks canonical file/link integrity, source coverage, content fingerprints and review records. It warns when an area has not been reviewed within its declared interval; routine age warnings do not block unrelated development. Content mismatches or invalid required records fail the check.

The workflow uses a read-only token, does not execute a deployment, call a model, auto-refresh review records or write new claims to main. It prints deterministic source digests as diagnostics; printing a digest does not record or approve a semantic review. Its report explains what needs attention. It does not prove that prose is correct, that an external service is healthy, or that an accepted idea was implemented faithfully.

A check that runs is distinct from a repository rule requiring it before merge. Branch protection/rulesets were not changed by this PR. The current branch-protection observation is not a guarantee about future settings. Reviewers should treat failed documentation checks as unresolved work; repository administrators can make the named check required through their normal rules process.

## 4. Recurring semantic and delivery audit

A companion ChatGPT upkeep task checks for meaningful drift using the connected GitHub repositories. Its operating instructions are:

1. Read current canonical references and the last recorded evidence; inspect current main/PR states, relevant diffs, worker pins and release workflow evidence.
2. Reconcile objective changes to documentation, distinguishing source behavior, code integration, deployed revisions, activation and acceptance. Do not infer live settings from default-off code or assume a deployment from a merge.
3. Update an existing documentation-maintenance PR or open a focused draft when supported corrections are needed. Reuse current approved intent; label unsupported facts as unverified. Do not merge, deploy, alter permissions, spend on providers or change product policy as an upkeep side effect.
4. Notify the owner only of material drift, a prepared correction or a specific access failure that blocks verification. Stay quiet when nothing needs attention. Avoid duplicate maintenance PRs and do not churn dates without a substantive review.

This external audit complements CI: release/configuration events may happen without a source diff, and semantic contradictions are not solved by hashes. Its confirmed schedule and status are managed in ChatGPT Tasks, not inferred from the existence of this file. If the task is paused, disconnected or unavailable, PR checks and the operator's evidence-update duty still apply; do not claim automatic upkeep is running without confirmation.

## 5. Preserve useful context across queries

[AGENTS.md](../../AGENTS.md) is the repository entry point. [ChatGPT Project instructions](CHATGPT-PROJECT-INSTRUCTIONS.md) provide a matching short retrieval rule for ordinary project chats. Keep intent, method, architecture, decisions and delivery evidence in their designated references; link them rather than copying them into every prompt.

Use a short task/PR handoff containing the goal, verified source SHA, related work, decisions, validation and remaining uncertainty. Keep detailed evidence scoped to its run. If an old document must remain, mark it **historical** and link its replacement. If a decision is reversed, add a superseding ADR and retain the original rationale. This preserves why the project took its current shape without turning the reference set into a transcript archive.
