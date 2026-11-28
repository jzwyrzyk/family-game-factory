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
- Public #106 and private #16 supply persistent DEV preparation only. The old #106 backend cannot be merged wholesale: it conflicts with newer family authorization, premium accounting, retry settlement and TEST execution. Its adult IAP, synthetic grant, durable spend counter, DEV worker identity and origin contracts are the reuse boundary. Their current-source port is now prepared in this same candidate, with narration, allowance expiry and premium repair spending reconciled. Hosted packaging qualification passed on candidate `f5edfb8`; actual deployment/acceptance remains required; no claim of activated DEV is made.
- Independent assessment/research and optional telemetry proposals (#54/#60/#83) remain outside this release. Historical release branches and competing #45 automation are not reopened. The inspection identified no additional finished product feature that should be added beyond the consolidated application and the operational dependencies above.

## One setup package, separate authority boundaries

| Scope | Reuse | Increment to review | Must remain isolated |
| --- | --- | --- | --- |
| Static DEV and TEST | Existing enabled project `jems-jzw-nonprod` / `1092405124984`, IAP, registry, controller, deploy/UAT identities | None for current static behavior | Per-PR origins; role-free static runtimes |
| Persistent live DEV | #106's existing DEV contract and worker #16 clean export; stable adult DEV origin, exact-source services | Separate labelled/billed DEV project; `jems-dev-app`, gateway, preview, coach; DEV data, images, network, private `-dev` repository, restricted runner group, dispatch and runner Apps | No production or TEST database, signing material, model key, worker identity or ledger. Verify IAP adults and short-lived synthetic grants. Existing adult permit/tab proof still required |
| Integrated TEST | #226 root `infra/nonproduction/family-beta/terraform`; existing environment controller and its deployment/UAT identities | Named `jems-test` database, TEST artifacts/registry/secrets, gateway/household/preview/coach, private TEST worker/network, delegated TEST DNS/TLS/IAP edge | Dedicated runtime accounts and bindings, private `-test` repo/App/group/WIF, separate provider credentials and durable trial ledger; no production data |
| Routine infrastructure operation | Existing exact saved-plan operator, locks, HMAC approval, state/history checks, uncertainty markers and readback | Prepared [GitHub transport](GITHUB-TEST-INFRASTRUCTURE.md) with separate planner/executor WIF, native private GCS state and durable approval/history storage; no public state or secret artifacts | Existing static state stays with its current owner. Do not adopt or rewrite it. Planner cannot apply; approved executor must preserve the exact operator guards |
| Production | Existing release-intent, service image, sandbox and Pages controllers plus #226 exact-manifest gate | Reviewer/evidence environment bindings and private read-only worker-evidence access, verified before use | Exact source/artifacts/configuration approval; current household recovery tuple retained |

The persistent DEV experience is a stable deployment, independent of temporary PR preview TTL. Live AI is available for ordinary authorized adult development within a separately approved allowance, not just a single acceptance session. Every renewal changes explicit authorization; no implicit monthly ledger reset, no new allowance from fixture reset, and no replay after an uncertain paid result. On exhaustion/expiry stop paid admission while retaining saved work and normal local editing.

## Planning decision — November 28 follow-up

The owner supplied these **planning limits only**. They authorize neither project creation, infrastructure/IAM changes, paid builds/inference nor production promotion. No live manifest, secret, allowance or workflow binding was changed. The proposed DEV project ID is `jems-jzw-dev`; it is **not independently confirmed or reserved**. Existing TEST remains `jems-jzw-nonprod` (`1092405124984`). Use `us-east5` for the DEV cost scenario, matching the existing TEST region; select an available worker zone within that region during administrator verification, without silently moving regions.

| Boundary | Proposed limit | Activation rule |
| --- | ---: | --- |
| Persistent DEV infrastructure | $40/month | Separate project; all DEV cloud, build, storage, network and private Actions charges count |
| TEST infrastructure | $60/month | Includes existing static TEST **and static PR previews** in the shared nonproduction project; new integrated TEST is not an extra $60 |
| DEV AI | $25 cumulative | 25,000,000 micro-USD; expires exactly 30 days after the separately approved activation timestamp; explicit renewal against retained spend |
| TEST AI | $10 finite acceptance envelope | 10,000,000 micro-USD; expires seven days after the separately approved TEST activation timestamp; no automatic renewal |
| Premium game lineage | $5 cumulative | Existing independent 5,000,000 micro-USD ceiling retained across build/edit/repair/retry/fork history |
| Paid DEV concurrency | One operation | Existing transactional DEV admission covers generation, coach, dictation, narration and additional repair holds |

The clocks do not start on this planning date. Record exact UTC start/expiry and authorization IDs in the final private activation receipt. Ordinary authorized adult DEV remains available while its allowance is active; short IAP/device sessions may renew without funding or resetting the durable counter. Exhaustion/expiry stops new paid work and preserves saved work/local editing. Existing guardian/adult, provider entitlement, privacy and image/audio approvals remain distinct.

### Existing TEST trial constraint

The current release code in `server/beta/test-trial.ts` permits a funded acceptance session of at most **24 hours**, with `limitMicrousd` equal to the premium lineage ceiling (at most **$5**). `scripts/environments/test-journeys.cjs` independently requires that bound and an initially unspent allowance. Therefore **do not insert $10/seven days into the current runtime configuration**, reset its ledger, or claim seven-day live availability.

The release-first proposal is one existing-contract session of at most $5/24 hours, wholly inside the $10/seven-day approval envelope. Schedule that session away from a UTC monthly-ledger rollover. This includes the acceptance lineage and coach together; $5 is a limit, not a promised amount of successful output. The remaining envelope stays unactivated. If another session proves necessary, reconcile all prior settled/reserved/uncertain spend and retained state before a distinct bounded approval; never issue a fresh $10 or refill through fixture reset. A continuous seven-day/$10 runtime trial would require a separately qualified change; it is not needed for the proposed single acceptance session and is not introduced here.

## Resource inventory and ownership

This is a **source-derived proposed inventory**, reconciled to candidate `f5edfb82d2286b98cf5237276e7ec9449a47b76d` and protected main `4aec7aa67129ca074671c3cc9e1ae7e23f679fd0` (both rechecked unchanged for this follow-up). The candidate has 42 successful hosted checks and one intentionally disabled check. The documentation follow-up does not establish new live acceptance. Source-only diagnostic preflight returned `SOURCE_VERIFIED_IDENTITY_UNCHECKED`, zero mutations. The existing diagnostic capability does not provide an authoritative DEV-project, organization-wide resource or billing inventory; no denied identity endpoints were retried. Absence from visible repositories, a project lookup error, or a proposed name is not proof of global availability.

| Resource group | Existing / preserve | Proposed additive delta and source |
| --- | --- | --- |
| Static nonproduction | Existing project, `jems-environments` registry, IAP, deploy/UAT accounts, two role-free static runtimes, WIF and controller-owned state | **No changes** to their current ownership/configuration. Existing max 10 previews, 72-hour TTL, zero minimum/one maximum instance remain. Include their actual charges in TEST's $60 |
| DEV project and services | None independently confirmed | Proposed `jems-jzw-dev`, labels `environment=development,application=jems`; 4 Cloud Run services `jems-dev-{app,gateway,preview,coach}`, each 1 vCPU/512 MiB, min 0/max 1; authenticated app/preview native `run.app` origins. Reuse `dev_contract.py`, `dev_bootstrap.py`, `dev_release.py` |
| DEV storage/build | No reuse of TEST/PROD data | 1 delete-protected native `(default)` Firestore database; 2 private regional buckets (`<DEV_PROJECT>-artifacts`, `-build-source`); 2 immutable registries (`jems-dev-images`, `jems-dev-sandbox`); 5 declared secret containers (app/gateway/preview config, dispatch key, coach key), with numeric versions; E2_MEDIUM builds for app/gateway/preview/coach/sandbox. DEV PITR or scheduled backups are not added by this source |
| DEV identities/network | Worker #16 remains preparation | 7 helper-declared accounts (4 runtimes, build, release, worker-provisioner), plus separately scoped keyless bootstrap/workflow trust. Private worker target, runner group and repository-only Apps; exact private main/tag and stage identities. Worker preparation owns 1 custom VPC/subnet/router/NAT and its finite firewall/WIF rules. Ephemeral `e2-standard-4` Spot, 40 GiB `pd-balanced`, no public IP/VM service account, maximum 90 minutes, verified VM/disk/runner cleanup |
| TEST foundation/services | Reuse existing project and deployment/UAT controllers | Named delete-protected Firestore `jems-test` with PITR; 1 versioned/soft-delete private artifacts bucket; immutable `jems-test-services` registry; 4 runtime accounts plus builder/worker-provisioner; 3 configuration secrets plus coach-key container. 4 Cloud Run services (gateway, household, preview, coach), 1 vCPU/1 GiB, min 0/max 1. Three digest-only service images; separate frontend bundle and sandbox pin. Root: `infra/nonproduction/family-beta/terraform` |
| TEST edge | No domain/zone confirmed | 1 delegated public Cloud DNS zone as administrator prerequisite; root creates 3 DNS authorizations/CNAMEs, 1 managed certificate covering 3 hosts plus workshop wildcard, 1 map/4 entries, 6 backends (including deny fallback), 5 serverless NEGs, 1 URL map, 1 global IPv4/HTTPS proxy/443 forwarding rule, 4 serving A records. Management/household IAP allowlists and OAuth; exact routes remain authoritative |
| TEST worker | Private identity not independently confirmed | Existing root declares separate VPC/subnet/router/NAT, 4 firewall rules, scoped custom roles, worker account and separately gated private-worker WIF. Price same prepared 4-vCPU/40-GiB ephemeral worker shape; verify the actual TEST worker export/controller before activation. Do not point TEST at production or DEV workers |
| TEST operations | Reuse original saved-plan/stage/uncertainty operator | 1 private versioned GCS state/receipt bucket; 2 distinct planner/executor accounts; new provider in existing nonproduction WIF pool; 2 protected GitHub environments. Native Terraform state/locks plus private operator history. Existing static state is not imported, adopted or rewritten |
| Production | Current live release/worker and recovery tuple | No mutation in this package. Retain exact-manifest/evidence gate. #169/private #22 publication prerequisites must bind the finally accepted source before separately approved production promotion |

Before any approved creation, the administrator records existing resource IDs, project numbers, ownership/state locations and effective IAM. Adopt no unknown resources. If the proposed DEV project or bucket name is unavailable, stop that creation and review the actual replacement; do not provision an unreviewed project. Project creation is not an availability probe. The existing TEST root requires the delegated DNS and worker metadata even for its first enabled foundation plan, so these inputs must precede that plan.

## Minimum DNS configuration

**Recommended lowest-cost option preserving the current architecture:** use an already-owned domain and delegate only `test.<owned-domain>.` (or `jems-test.<owned-domain>.`) to one public Cloud DNS managed zone in `jems-jzw-nonprod`. No domain registration, transfer, paid DNS upgrade or hosting redesign is proposed. The administrator must identify the owned parent domain; none is assumed to exist.

Proposed labels, not live names:

| Record | Owner/action |
| --- | --- |
| Parent `test.<owned-domain>.` NS delegation | Parent-domain administrator installs the exact authoritative name servers returned by the new child zone. Parent production records stay unchanged |
| `hub.test.<owned-domain>.` A | Existing TEST Terraform edge points to its reviewed global IPv4 |
| `home.test.<owned-domain>.` A | Same IPv4, separate household host/routing/IAP |
| `preview.test.<owned-domain>.` A | Same IPv4, separate untrusted-preview origin |
| `*.hub.test.<owned-domain>.` A | Same IPv4, preserves existing per-workshop host routing; external invitations remain off |
| Three certificate authorization CNAMEs | Use exactly the generated `PER_PROJECT_RECORD` names/targets for hub/home/preview; retain for renewal |

The three hosts must be distinct, strictly below the child zone and not nested under one another. Existing source uses TTL 300 for its 4 A and 3 authorization records. SOA/NS are zone-managed. No AAAA record is needed for the proposed IPv4 edge. Verify effective CAA allows the selected Google-managed certificate issuer if the parent has restrictive CAA; do not remove parent restrictions blindly. Configure the reviewed IAP OAuth client and its IAP redirect URI, plus explicit adult allowlists; do not invent redirects from these example names.

Cost: one Cloud DNS zone $0.20/month plus $0.40/million regular queries; 100,000 queries gives **$0.24/month**. Certificate Manager's first 100 certificates/project are free; the estimate nevertheless reserves $0.20 for this one certificate if that free tier is unavailable. DEV uses native authenticated `run.app` and needs no custom zone or load balancer. If no owned domain is available, integrated TEST edge is blocked on a separate domain decision; no purchase or public wildcard-DNS substitute is authorized. Sources: [DNS pricing](https://cloud.google.com/dns/pricing), [certificate pricing](https://cloud.google.com/certificate-manager/pricing).

## Completed planning cost model

USD, checked November 28, 2026; 730 hours/month. This replaces the earlier incomplete $31.58 combined illustration. These are workload estimates and conservative allowances, **not a measured bill, binding regional quote or hard cloud cap**. Shared free usage, discounts and Spot savings are not deducted (the one certificate has a full-price reserve). No domain/license purchase or new GitHub seats are included or authorized. Reuse existing organization capabilities; if they cannot support private worker/group protection, bring that demonstrated subscription delta back before purchasing.

### Quantities and recurring amounts

| Item and explicit workload assumption | DEV/month | TEST/month |
| --- | ---: | ---: |
| Cloud Run: 50 DEV aggregate billed hours at 1 vCPU/0.5 GiB; 20 integrated TEST hours at 1 vCPU/1 GiB; 100k requests each | $4.59 | $1.95 |
| Worker VM: 20 DEV / 10 TEST instance-hours at conservative **on-demand** $0.13402284/hour; deployed shape remains Spot | $2.68 | $1.34 |
| 40 GiB balanced boot disk, same 20/10 hours at $0.000136986/GiB-hour | $0.11 | $0.05 |
| One NAT IPv4 reserved for all 730 hours, $0.005/hour | $3.65 | $3.65 |
| NAT: 20/10 assigned VM-hours × $0.0014 plus 5 GiB processed each × $0.045 | $0.25 | $0.24 |
| E2_MEDIUM Cloud Build: 150 DEV / 100 TEST build-minutes × $0.003 | $0.45 | $0.30 |
| Additional registry: 10 GiB per environment × $0.10/GiB-month | $1.00 | $1.00 |
| GCS: 10 GiB retained each (includes noncurrent/soft-deleted artifacts, build source and TEST private state/history); conservative $0.023/GiB-month, 20k Class A + 100k Class B operations | $0.37 | $0.37 |
| Firestore: 1 GiB including indexes, 1m billed reads, 200k writes, 100k deletes each; TEST adds 1 GiB PITR | $0.64 | $0.79 |
| Secret Manager: 10 DEV / 8 TEST active versions × $0.06 plus 10k accesses × $0.03/10k | $0.63 | $0.51 |
| Application/build logging: 2 GiB each × $0.50, before free allowance | $1.00 | $1.00 |
| Internet: 10 DEV / 5 TEST GiB to North America × $0.12, plus $0.10 inter-region allowance each | $1.30 | $0.70 |
| Private GitHub-hosted orchestration: 300 DEV / 120 TEST rounded Linux minutes × $0.006 | $1.80 | $0.72 |
| Private Actions artifacts: 2 GiB-month each × $0.25 | $0.50 | $0.50 |
| Proposed global TEST HTTPS edge: 730 × $0.025 + 20 total processed GiB × $0.008 | $0 | $18.41 |
| TEST child DNS zone + 100k regular queries | $0 | $0.24 |
| TEST certificate reserve | $0 | $0.20 |
| **Existing static nonproduction allocation**, including TEST and temporary DEV previews | $0 | **$15.00** |
| **Estimated total** (sum before rounding individual lines) | **$18.97** | **$46.97** |
| Proposed ceiling | **$40.00** | **$60.00** |
| **Remaining reserve within ceiling** | **$21.03** | **$13.03** |

New integrated TEST is approximately **$31.97/month incremental**; adding the explicit $15 static allocation gives $46.97. Persistent DEV is approximately $18.97 incremental. Combined incremental estimate is **$50.94/month**, plus the pre-existing static charge allocation. Combined infrastructure planning ceiling is $100/month; finite AI envelopes add up to $35 for the initial approved periods, not a new $35 recurring monthly commitment. Initial infrastructure plus AI ceilings total $135; neither transfers unused DEV money to TEST nor renews AI.

The $15 static figure is a planning allocation from the existing normal-activity envelope, **not observed spend or the old budget alert treated as a cap**. Replace it with billing-account readback/current-month forecast before apply; every $1 of excess reduces TEST's $13.03 reserve by $1. The reserve covers setup/rebuild variance, modest regional rate differences, vended network/monitoring charges and applicable tax/fees. If the full forecast including those charges cannot fit the ceiling, stop and return the specific delta. Do not install a larger footprint or silently consume production funds.

The workload quantities are monitoring assumptions, not yet enforced cumulative infrastructure limits. All four services at max one instance can still exceed the budget if busy continuously. Disk or image retention also outlives a failed job: a 40-GiB orphan disk for a month is about $4; each extra NAT IP-month is $3.65. Automatic NAT allocation may use a different address count, so verify allocation rather than assuming exactly one. Cloud billing alerts are delayed and do not hard-stop usage. Proposed alerts at 50/80/100% of each ceiling and forecast-to-month-end review should stop approval of new discretionary builds/paid work before an overrun; investigate through GitHub. Do not disable project billing, delete retained work or alter production as a budget response. Preserve existing controller cleanup/TTL and required recovery artifacts. No new monitoring platform, backup service or budget controller is introduced.

No separate charge is modeled for ordinary basic IAP, IAM/WIF, service-account/API creation or standard public-repository Actions. Self-hosted worker execution is counted in VM/disk/network, **not again as hosted Linux compute**; the private Actions row is for orchestration/stage jobs actually on GitHub hosts. Cache remains inside the existing included quota; a paid cache expansion is excluded. Avoid duplicate transfer charges: the bandwidth row counts each internet transfer once while NAT and LB processing remain separate billable dimensions.

### Rate evidence and exact-plan reconciliation

- [Cloud Run](https://cloud.google.com/run/pricing), [region tier](https://docs.cloud.google.com/run/docs/locations): request billing $0.000024/vCPU-second + $0.0000025/GiB-second + $0.40/million requests; yields $0.0909/DEV hour and $0.0954/TEST hour. `us-east5` is Tier 1.
- [Compute Engine](https://cloud.google.com/products/compute/pricing/general-purpose), [Spot](https://cloud.google.com/spot-vms/pricing), [disk](https://cloud.google.com/compute/disks-image-pricing): use on-demand reference above as a conservative VM reserve, not a promised Spot price; no on-demand fallback is enabled. Spot price/availability must be rechecked for the exact zone before approval.
- [NAT](https://cloud.google.com/nat/pricing), [network/LB](https://cloud.google.com/vpc/network-pricing): include NAT IP, assigned VM-hours, processing and internet egress. Global forwarding rule pricing is per project/tier group; no reuse of production LB billing is assumed. The in-use forwarding-rule IP is not charged again as a NAT/VM address.
- [Registry](https://cloud.google.com/artifact-registry/pricing), [GCS](https://cloud.google.com/storage/pricing): GCS reference standard rate shown is about $0.020/GiB-month; this worksheet deliberately reserves $0.023 rather than claiming the web page's default regional selector proves a bound account SKU. Class A $0.005/1k; Class B $0.0004/1k. Count retained versions and soft deletion.
- [Firestore](https://cloud.google.com/firestore/pricing): regional reference reads/writes/deletes $0.03/$0.09/$0.01 per 100k; data and PITR each about $0.15/GiB-month. Named TEST databases have no free quota; DEV free quota is not deducted. No paid scheduled backup/restore is added; emergency restore cost requires its actual scoped recovery decision.
- [Cloud Build](https://cloud.google.com/build/pricing), [secrets](https://cloud.google.com/secret-manager/pricing), [observability](https://cloud.google.com/products/observability/pricing), [IAP](https://cloud.google.com/iap/pricing), [GitHub runner rates](https://docs.github.com/en/billing/reference/actions-runner-pricing), [GitHub storage](https://docs.github.com/en/billing/concepts/product-billing/github-actions) supply the remaining rates and included-service rules. Disabled retained secret versions also count as active for billing.

The complete priced **scenario** is ready for review. The executable approval must still attach actual account/currency, selected-region/SKU reconciliation, existing usage forecast, resource/action delta and source/config/state/plan digests. A public pricing page or source-only Terraform test cannot supply live IAM/resource state. Missing live evidence does not become an unbounded authorization.

### AI pricing and admission

Existing premium source selects `gpt-6.2-sol` for planning/review ($2 input/$10 output per million tokens) and `gpt-6.2-astra` for construction/repair ($8/$40). Official [Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol) and [Astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra) prices match the source's standard short-context uncached catalog on this review. Do not use priority/fast/ultrafast, extended cache or long-context pricing under those rates. Token ceilings, reasoning output, review and repair reservations remain part of the exact policy. Cost is `input_tokens × input_USD_per_million + output_tokens × output_USD_per_million` in micro-USD; use each stage's maximum before admission and verified usage at settlement. A $5 lineage ceiling is not a $5-per-retry allowance or proof of successful generation.

Reuse the already reviewed coach model if current entitlement/configuration evidence exists; otherwise propose Sol at the verified rates, with the existing maximum $0.10/turn contract, for explicit configuration review. No model credential was read. Do not assume a ChatGPT subscription funds API calls or proves account entitlement. The exact isolated keys, allowed models and privacy/retention gates must be verified privately before paid activation. Hosted image/speech/narration capabilities need their existing independent approval and rate bindings; their flags remain off when those inputs are absent. Any later approved surface consumes the **same** $25 DEV cumulative allowance, not an extra allowance. TEST's current narrow trial excludes hosted audio/narration and generated images; deterministic/local content remains retained. No new feature removal is proposed.

## One coordinated administrator package

The package has one finite administrator setup batch and existing subsequent exact-plan/AI/production gates. **It is a proposal, not an authorization receipt.** Approval must identify the phase; an approval of this budget outline alone is not an approval of a later unknown Terraform plan.

| Administrator-only batch | Concrete action and receipt | When allowed |
| --- | --- | --- |
| A. Targets, billing and DNS | Confirm authority/availability for proposed DEV ID and actual project number after any approved creation; bind existing billing privately; verify TEST number/ownership and actual static/all-other-project cost forecast. Select one already-owned parent domain, child zone and the three labels above. Record enabled worker zone, adult subjects and OAuth/client redirect. No credentials or billing IDs in public PRs/chat | Read-only verification now; creation/billing/DNS mutation only after explicit setup approval |
| B. Isolated trust and keys | Verify/create exact private DEV and TEST repositories/IDs, protected mains/tags, restricted runner groups, repository-only dispatch and runner-registration Apps. Install separate provider credentials and attest supported models/privacy/retention. Retain production identity pins. Supply private numeric secret versions and signed policy/allowance bindings, not key material in workflow inputs | After scoped identity/credential setup approval; paid admission stays disabled |
| C. GitHub/cloud bootstrap | Approve additive bootstrap IAM, two project-scoped budgets, DNS zone/delegation, and TEST private versioned state bucket. Bind separate TEST planner/executor and DEV bootstrap/build/release identities to protected exact workflows/repository IDs/environments. Verify required reviewers, no self-approval/bypass, no static-deployer privilege expansion. Planner observes resources and handles private state only; executor permissions match the reviewed delta. Record positive/negative effective-permission checks | After reviewed bootstrap resource/IAM delta approval, via administrator console or approved bootstrap automation; no routine Cloud Shell |
| D. Receipt handoff | Record all resource IDs, state ownership, WIF conditions, private configuration selectors, account regional prices/billing baseline and effective protections. Grant only required read-only worker/release evidence access. Store private receipts in the approved private location; publish only safe status/digests | Before first saved plan, build or activation |

**Engineering prerequisites stay with the release operator, not the administrator:** install the reviewed operations-only workflow/helper source through protected integration without merging the held application; finish and qualify the DEV GitHub wrapper around existing helpers (durable operation receipts, private configuration, exact-source build/deploy/recovery), bind the isolated TEST worker export and exact-source TEST image-build provenance, and qualify initial DEV device/adult enrollment plus underlying family-ledger admission across a month boundary without refilling the cumulative DEV counter. The reused DEV config helper emits the legacy generator fields; validate the final current premium/adult configuration separately before claiming the full paid experience. These lanes are prepared, not installed by this planning update. Do not substitute owner-run helper CLIs. Finish this operational source before asking the administrator to bind its exact workflow trust. No application feature or hosting redesign is required by this package.

### Concrete approval records

1. **Bootstrap/setup record:** approved projects/region/zone/domain, finite listed resource/IAM creations, private repository/App/group and workflow identities, retained state ownership, cost model and the $40/$60 infrastructure ceilings. No AI or production authority. The first additive setup is conditional on the private actual inventory; any conflict or extra resource returns for review rather than adoption.
2. **Infrastructure apply record:** exact protected operations SHA, immutable Terraform/provider inputs, stage, configuration/secret-version digest, current state lineage, complete private plan and safe resource/action summary, current pricing/usage forecast, attempt ID, approval digest and expiry. Use GitHub `observe → plan → approved apply` and existing one-hour/fresh-plan/uncertainty guards. Foundation → services → edge → separately verified worker trust remains fixed. Bootstrap approval cannot replace this exact-plan approval.
3. **Paid activation records:** DEV $25/30 days/one paid operation; TEST outer $10/seven days with initial at-most-$5/24-hour existing-contract session; $5 lineage cap. Bind distinct source/worker/image/config/model/price/entitlement evidence and exact start/end timestamps. Never reuse/reset ledgers. Each environment starts only at its actual acceptance phase.
4. **Production record:** separate exact tested manifest approval after DEV acceptance, protected application integration and integrated TEST acceptance. No production spending change or family invitations is bundled here.

The remaining material unknowns are administrator-confirmed DEV availability/project identity, owned domain/delegation, effective private trust/entitlements, actual existing billing usage and exact saved cloud plans. They cannot be resolved by asserting the proposed identifiers exist. This package prices all proposed resource classes and gives their owners, inputs and stop conditions; it does not mislabel those unknowns as completed infrastructure.

## Execution order and stop conditions

1. Complete the current-source persistent DEV port and protected operational GitHub setup after its applicable approval. Preserve static previews. Deploy the exact candidate to persistent DEV with isolated approved allowances. Observe real adult IAP login, denied unauthorized/cross-environment access, live coach/build/test/review/play/edit/Keep/reload, original-art and save/recovery journeys, no sandbox egress and verified worker cleanup. Obtain actual owner/device acceptance; fixture tests are insufficient.
2. Only after actual DEV acceptance, integrate the consolidated application through protected main with all required current-source checks. Do not bypass review or write release intent during merge. Repeat evidence when the accepted source/configuration changes.
3. Provision/advance TEST through approved foundation → services → edge → isolated worker trust. Use `jems-environments.yml` protected `prepare-uat`, `qualify-fixture`, `uat` and separately funded `live-uat`. Preserve ledgers during synthetic reset, verify recovery, bind exact images/frontend/runtime/configuration and record owner/device acceptance independently.
4. Seal the exact tested manifest, verify production compatibility and retained recovery artifacts, then request the separate exact-manifest production approval. Promote through the existing ordered controller and verify actual serving identity and bounded household journeys. Keep external invitations disabled until separately approved.

Any denied prerequisite, uncertain paid or infrastructure result, stale plan, changed source/configuration, failed UAT or missing owner acceptance stops the next stage. Preserve pending jobs, reservations, state history and user work; diagnose through GitHub instead of substituting owner-run terminal operations.
