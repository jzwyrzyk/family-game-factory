## Intent and resulting behavior

<!-- What user need or defect does this address? Link the request/issue and relevant doctrine, feature contract or decision. Explain what actually changes for the user. -->

## Implementation and integration

<!-- Summarize the approach, important tradeoff and affected components. Identify overlapping/stacked PRs, base/source SHA, compatibility or saved-data implications. Preserve newer merged behavior when reconciling old branches. -->

## Evidence

| Claim / acceptance criterion | Check or observation | Exact SHA / run / artifact | Result and limits |
| --- | --- | --- | --- |
| | | | |

<!-- For CI changes, record exact base/head/tested-merge identities, selection reasons, full versus reused versus shadow scope, original-command coverage, first-attempt failures/retries, wall time including queue, runner minutes and artifact retention. A green draft is not protected-main activation. Follow docs/evidence/README.md#ci-architecture-and-performance; executable narrowing needs proven dependency coverage and unknown/shared/security-sensitive changes stay full. -->

<!-- Include relevant negative/recovery cases. Distinguish mocks/fixtures, real providers, real devices, visual review and observed play/learning evidence. Unrun checks and remaining gaps belong here. -->

<!-- For child-facing UI, apply docs/brand/CHILD_INTERFACE.md: remove redundant copy, retain 18px labels / 20px task text, verify actual-surface contrast at phone sizes and in help/error states, and preserve explicit friendly narration and cancellation. State observed coverage, not a site-wide claim from one screenshot. -->

## Preview and acceptance
<!-- For creative assets and worlds, identify the storage or rendering owner and dependent PRs. Verify exact source/revision preservation, role and mechanics, older saves, offline recovery and profile changes. Provide the rendered activity on phone, tablet and desktop, artwork provenance and the status of visual approval. General generated-game private-art delivery requires separate qualification. See docs/creation-studio/CREATIVE_ASSET_AND_WORLD_STANDARD.md. -->


<!-- Follow docs/development/DEV-TEST-PROD.md. Applicable application changes need an interactive private DEV preview; documentation-only changes may state not applicable. Automated status must bind the current PR head and actual deployment receipt. A merged PR is not necessarily deployed. -->

- DEV preview URL, deployment status and exact deployed source:
- Affected user journeys and suggested manual acceptance steps:
- Before/after screenshots, when relevant:
- Owner visual/interactive acceptance and exact reviewed source, or pending:
- Known limitations and integration readiness:
- TEST release identity / included changes / deployed UAT evidence, when available:
- Remaining production approval, deployment verification or recovery evidence:

<!-- Keep mocked-provider, real-provider, real-device and owner acceptance separate. Any relevant source/artifact/configuration change invalidates prior release approval. Never paste secrets, private transcripts or family data into this public PR. -->

## Documentation review

<!-- Run npm run docs:check. Inspect each affected area; update its documents or record a specific no-impact reason with npm run docs:review -- <area> --outcome updated|unchanged --reason "...". Commit the registry change. A generic checkbox or fresh timestamp is not a review. -->

- References consulted:
- Documents / decision records changed:
- Areas reviewed; rationale for any unchanged documents:
- Documentation-check result:

## Delivery and follow-up

<!-- State implemented/merged/deployed/activated/verified separately. Link an existing rollout/rollback plan only when this PR affects a release. Describe remaining work, owner/dependency and current release scope; future research does not automatically ship. Reuse existing authorization instead of requesting it again. -->

- Current disposition and remaining acceptance:
- Deployment/configuration/worker-pin implications, if any:
- Follow-up issue(s), if needed:

<!-- Before reporting a merge, release, activation or rollback, update DELIVERY-STATE.md with the exact evidence and observation time. Never commit credentials, child content or private consent records. -->
