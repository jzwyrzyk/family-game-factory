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

## 2. Use the review registry

The problem-solving feature has a dedicated review area for its evidence schema, deterministic practice, reports and tests. Its standards/claim contract is linked from product and experience reviews, while source hooks remain in their existing subject, Creation and Studio areas.

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

## 3. Automatic repository checks

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
