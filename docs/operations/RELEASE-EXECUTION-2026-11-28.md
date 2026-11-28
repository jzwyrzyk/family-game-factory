# Coordinated household release execution

**Scope:** owner's November 28 release instruction. Preserve working static DEV/TEST automation; add persistent adult-authorized live DEV and integrated TEST; deliver the complete #223 application once. External family invitations remain disabled. This package records source preparation and proposed setup, not infrastructure, inference or production authorization.

## Verified baseline and selected integration

Protected main resolved directly through GitHub and Git to `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0` (#234). Reconciliation joins #226 `9d0b4c679637452d4d37205659f71cd7899b9733`, including #223 `b1169673050a8be83ed5ba69a27b04c23a87903f`, with that main. #226 is the selected release integration; #223 remains the immutable application review reference. No old feature PR is reopened or independently merged.

The entire `src/` and `public/` trees match the original #226; its application inputs are retained. The server adds the targeted isolated DEV port while retaining the consolidated authorization, premium, retry, narration and TEST paths. Static `ops/environments.json`, `scripts/environments/automation.py`, `scripts/environments/cloud.py`, `tests/environments/deployed-smoke.cjs`, and the native diagnostic workflow retain current-main bytes. The added TEST and exact-manifest jobs come from #226, without changing the current static jobs. No production intent, image publication list, private production worker ref or live setting is changed.

| Observed fact | Evidence | Scope |
| --- | --- | --- |
| Private DEV #223 deployed | GitHub deployment `8124168209`; source `b1169673050a8be83ed5ba69a27b04c23a87903f`, bundle SHA256 `d701b71e4f78672a0896ca8da87e94221cefe69b35db17090b29fc639405b2ef` | Static, disconnected application; no live-AI acceptance |
| Static TEST controller and browser success | [run 46112675847](https://github.com/jzwyrzyk/family-game-factory/actions/runs/46112675847) on `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0` | `prepare`, `deploy`, `deployed-browser` succeeded; not integrated TEST |
| Current household observation | [run 46114058342](https://github.com/jzwyrzyk/family-game-factory/actions/runs/46114058342) on the same main | `observe` succeeded; `plan`, `transition`, access and identity mutations skipped |
| Private DEV preparation | worker #16 `f0c7750a2f5a72a7f90e3dfb0b8850297a944a25` | 23 tests passed again; clean export and exported tests passed; not a provisioned worker |
| Existing private production main | `dddf53dbc76796be19782c1bb5bbb99b86e99909` | Read only; no tag, WIF, image or credential rotation |

Environment settings/branch-protection-detail API reads returned HTTP 403 for this connection. Branch metadata independently reports `protected=true`; the public environment listing reports main-restricted environments but does not prove their secret/variable values or effective cloud rights. These observations are capability limits, not missing settings by assumption. The organization repository list visible to this connection contains only the production worker; verify actual DEV/TEST repositories with the administrator before creating names.

## Completed work disposition

- #218 Learning, #220 Creative Universe, #221 design-system migrations, #191 directory and #222 operational preparation are ancestors of #226. They remain in the application. The [existing per-workstream disposition](https://github.com/jzwyrzyk/family-game-factory/blob/2f0a1427a2d183524507b3c81258fe4137c9c3a9/PR-DISPOSITION.md) accounts for #192–217, including content reconciled without ancestry. Preserve the local-only/private-art limits and missing raw-master provenance; do not replay the superseded #207/#209 aggregations.
- #225 and #228–234 are in current main and retained. #227's native diagnostics were integrated through #228. #231 is a held-source verification companion, not a second application implementation. Do not merge its stale resolution over current main.
- #224 is dated documentation reconciliation. Its historical frozen-source facts are retained as historical evidence; current #223/#226 and deployed static facts supersede its old activation status. It adds no application feature that needs release integration.
- Public #169 and private #22 remain release-relevant publication/worker preparations. Private #22 `38bd36a6f705b8f2006fe80aa38c68e28bc5370e` consolidates private #19–21. Its public-source pin, published sandbox and runtime must be rebound to the final accepted application, independently qualified, and approved before production rotation.
- Public #106 and private #16 supply persistent DEV preparation only. The old #106 backend cannot be merged wholesale: it conflicts with newer family authorization, premium accounting, retry settlement and TEST execution. Its adult IAP, synthetic grant, durable spend counter, DEV worker identity and origin contracts are the reuse boundary. Their current-source port is now prepared in this same candidate, with narration, allowance expiry and premium repair spending reconciled. Hosted packaging qualification and actual deployment/acceptance remain required; no claim of activated DEV is made.
- Independent assessment/research and optional telemetry proposals (#54/#60/#83) remain outside this release. Historical release branches and competing #45 automation are not reopened. The inspection identified no additional finished product feature that should be added beyond the consolidated application and the operational dependencies above.

## One setup package, separate authority boundaries

| Scope | Reuse | Increment to review | Must remain isolated |
| --- | --- | --- | --- |
| Static DEV and TEST | Existing enabled project `jems-jzw-nonprod` / `1092405124984`, IAP, registry, controller, deploy/UAT identities | None for current static behavior | Per-PR origins; role-free static runtimes |
| Persistent live DEV | #106's existing DEV contract and worker #16 clean export; stable adult DEV origin, exact-source services | Separate labelled/billed DEV project; `jems-dev-app`, gateway, preview, coach; DEV data, images, network, private `-dev` repository, restricted runner group, dispatch and runner Apps | No production or TEST database, signing material, model key, worker identity or ledger. Verify IAP adults and short-lived synthetic grants. Existing adult permit/tab proof still required |
| Integrated TEST | #226 root `infra/nonproduction/family-beta/terraform`; existing environment controller and its deployment/UAT identities | Named `jems-test` database, TEST artifacts/registry/secrets, gateway/household/preview/coach, private TEST worker/network, delegated TEST DNS/TLS/IAP edge | Dedicated runtime accounts and bindings, private `-test` repo/App/group/WIF, separate provider credentials and durable trial ledger; no production data |
| Routine infrastructure operation | Existing exact saved-plan operator, locks, HMAC approval, state/history checks, uncertainty markers and readback | GitHub execution adapter with scoped WIF and private durable state/plan storage; no public state or secret artifacts | Existing static state stays with its current owner. Do not adopt or rewrite it. Planner cannot apply; approved executor must preserve the exact operator guards |
| Production | Existing release-intent, service image, sandbox and Pages controllers plus #226 exact-manifest gate | Reviewer/evidence environment bindings and private read-only worker-evidence access, verified before use | Exact source/artifacts/configuration approval; current household recovery tuple retained |

The persistent DEV experience is a stable deployment, independent of temporary PR preview TTL. Live AI is available for ordinary authorized adult development within a separately approved allowance, not just a single acceptance session. Every renewal changes explicit authorization; no implicit monthly ledger reset, no new allowance from fixture reset, and no replay after an uncertain paid result. On exhaustion/expiry stop paid admission while retaining saved work and normal local editing.

## Incremental cost worksheet

USD estimates, 730 hours/month, before free allowances, tax, egress and account discounts. Rates checked against official Google pricing on November 28. This is not an authorization or a hard cloud cap. The existing $15 nonproduction alert does not cover the new stack and cannot enforce a spending ceiling.

| Increment | Planning arithmetic | Monthly illustration |
| --- | --- | ---: |
| TEST HTTPS forwarding rule | 730 × $0.025/hour | $18.25 |
| DEV and TEST worker NAT external IPs, one allocated address each | 2 × 730 × $0.005/hour | $7.30 |
| NAT gateway work/data | $0.0014 per VM-hour (small gateway) + $0.045/GiB processed | 20 VM-hours and 10 GiB total: $0.48 |
| Request-billed service compute | Existing 1 vCPU/512 MiB reference: $0.0909/billable instance-hour; actual TEST sizing must use its selected resources | 50 aggregate comparable instance-hours: $4.55 |
| Additional registry storage | $0.10/GiB-month planning reference | 10 GiB: $1.00 |
| Worker Spot VM/disks, Cloud Build, DNS, database/PITR, object storage, logs, secrets, private Actions, LB data and network egress | Selected zone/machine, actual volume and billing plan required | Not yet priced; must be included before apply |
| Ordinary DEV AI | Separate provider, model/token/request/concurrency caps, USD allowance and expiry/renewal terms required | Unapproved; no amount assumed |
| TEST fixture AI | Deterministic fixtures | $0 inference |
| TEST real-provider acceptance | Separate finite approval, cumulative lineage ceiling and coach allowance | Unapproved; the existing $5 lineage cap is not permission to spend $5 |

The illustrated subtotal is **$31.58/month plus the explicitly unpriced components and AI**, additional to existing static/production charges. It is not a complete quote or proposed ceiling. NAT IP standing cost depends on actual allocation. A load-balancer forwarding-rule IP is not counted as a second VM/NAT IP charge. Do not claim scale-to-zero removes standing network cost. Keep the already selected architecture; optimize only if the completed quote exceeds the approved allowance.

Sources: [Cloud NAT](https://cloud.google.com/nat/pricing), [VPC/load balancing](https://cloud.google.com/vpc/network-pricing), [Cloud Run](https://cloud.google.com/run/pricing), [registry](https://cloud.google.com/artifact-registry/pricing), [existing detailed assumptions](../development/COSTS.md). The model-price/entitlement and selected VM/SKU quote remain explicit inputs to the saved-plan package.

## Minimum remaining administrator actions

Batch these into one setup review. Do not ask the owner to run routine Cloud Shell commands.

1. Confirm the real DEV project/billing target, TEST delegated zone and hostnames, enabled worker zones, allowed adult principals and OAuth clients. Supply separate DEV recurring/finite allowance and TEST trial ceilings, expiry and concurrency. Store any private values in the protected destination, never chat/public GitHub.
2. Verify or create the two private worker targets, each exact protected main/tag, repository/owner IDs, repository-only dispatch App, restricted runner-registration App/group and exact workflow WIF. Use the clean DEV export; production private main/tag remains unchanged. Install separate provider credentials privately only after entitlement/data-policy approval.
3. Approve the exact additive setup/IAM plan and configure GitHub's protected execution identities plus private durable state/plan storage. The current static deployer must not gain project-administrator rights. Install the minimum secret/variable bindings, DNS delegation/OAuth and read-only evidence access. Record resource IDs and effective permission readback once. Routine plans, apply, build, deploy, diagnostics, acceptance and cleanup then run through GitHub.

**Current package status:** not ready for infrastructure authorization. The domain, budgets and private bindings are unresolved; #226's operator still requires the GitHub adapter, and the persistent DEV runtime still needs exact-source hosted packaging and live acceptance. A source-only Terraform rehearsal is not a cloud saved plan. Produce the full actual resource/action list, selected SKU totals, exact source/configuration/state/plan digest and administrator delta before asking for apply approval. No credentials, production promotion or new infrastructure were authorized by this document.

## Execution order and stop conditions

1. Complete the current-source persistent DEV port and protected operational GitHub setup after its applicable approval. Preserve static previews. Deploy the exact candidate to persistent DEV with isolated approved allowances. Observe real adult IAP login, denied unauthorized/cross-environment access, live coach/build/test/review/play/edit/Keep/reload, original-art and save/recovery journeys, no sandbox egress and verified worker cleanup. Obtain actual owner/device acceptance; fixture tests are insufficient.
2. Only after actual DEV acceptance, integrate the consolidated application through protected main with all required current-source checks. Do not bypass review or write release intent during merge. Repeat evidence when the accepted source/configuration changes.
3. Provision/advance TEST through approved foundation → services → edge → isolated worker trust. Use `jems-environments.yml` protected `prepare-uat`, `qualify-fixture`, `uat` and separately funded `live-uat`. Preserve ledgers during synthetic reset, verify recovery, bind exact images/frontend/runtime/configuration and record owner/device acceptance independently.
4. Seal the exact tested manifest, verify production compatibility and retained recovery artifacts, then request the separate exact-manifest production approval. Promote through the existing ordered controller and verify actual serving identity and bounded household journeys. Keep external invitations disabled until separately approved.

Any denied prerequisite, uncertain paid or infrastructure result, stale plan, changed source/configuration, failed UAT or missing owner acceptance stops the next stage. Preserve pending jobs, reservations, state history and user work; diagnose through GitHub instead of substituting owner-run terminal operations.
