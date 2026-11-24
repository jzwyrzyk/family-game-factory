# Jems DEV → TEST → PROD

**Authority:** the owner's November 23, 2026 (America/New_York) assignment, “Jems — Automated DEV / TEST / PROD Architecture,” authorizes assessment and implementation through reviewed PRs. [The decision](../decisions/2026-11-23-dev-test-prod.md) records the method and supersession. This is the authoritative development and release contract; its requirements are not a claim of completed deployment.

**Implementation baseline:** main `28fe3311036f8ef9f3bfc623c522432499c08113`. The new environment tools are a disabled source foundation pending reviewed setup and deployed acceptance. [Delivery state](../../DELIVERY-STATE.md) records actual observations. [Setup](SETUP.md) identifies the additional authority required; [costs](COSTS.md) distinguishes estimates from spending approval.

[Local evidence and screenshots](evidence/README.md) validate the current narrow preview/browser foundation and preserve its incomplete acceptance scope.

## Operating method

ChatGPT supports product strategy, requirements, research and design. Codex implements, tests and integrates on isolated branches. GitHub Actions and narrowly scoped GCP identities operate infrastructure. The owner reviews interactive experiences and approves exact releases.

Use `main` as the integration baseline. Do not introduce permanent development or staging branches. Applicable application PRs receive independent private DEV URLs after eligible checks. New eligible commits update the same PR's URL. After approved integration and successful CI, the permanent TEST URL receives an eligible integrated candidate. Owner acceptance and complete TEST evidence precede an explicit production approval for that exact candidate. The existing production controller performs the compatibility-ordered transition and records deployment evidence.

Documentation-only changes do not need a preview or visual acceptance. A code change that affects appearance, interaction, games, navigation, voice or user workflows requires owner visual/interactive acceptance. Tests establish their measured behavior; they do not establish visual quality, enjoyment or learning efficacy.

Routine preview creation, updating, cleanup, deployment, verification, diagnostics and compatible rollback must run through GitHub Actions or existing authenticated integrations. **Routine Cloud Shell use is prohibited.** Investigate with available tools before asking the owner to perform an operation. Escalate only a material architectural decision, new spending, additional privileged access, changed security boundary or a genuine unresolved blocker. One-time Console/GitHub setup does not authorize a persistent administrative identity.

## Environment boundaries

| Environment | Website and purpose | Data, identity and inference |
| --- | --- | --- |
| DEV | One private Cloud Run origin per applicable PR; stable for that PR, visibly identified by PR and source | Separate nonproduction project; synthetic local profiles; ordinary preview build has disconnected remote AI. Deterministic provider fixtures and any live-provider lane must be explicitly identified. No production data, tokens or deployment role |
| TEST | One permanent, private, bookmarkable integration website | Isolated gateway, generated-game preview, private coach, Firestore, artifacts, worker identities and provider allowances; repeatable synthetic profiles. A static frontend alone does not satisfy TEST |
| PROD | Existing stable family application | Existing identities, family data, budgets, private worker and sandbox boundaries; only exact approved, verified releases |

Choose a separate nonproduction GCP project. Current server Firestore permissions operate at the project/default-database boundary; a collection prefix cannot establish production IAM isolation. A separate project makes the production prohibition enforceable without redesigning that storage contract.

Cloud Run's direct Identity-Aware Proxy (IAP) protects the `run.app` site without a load balancer. A separate origin for each PR also isolates localStorage, IndexedDB, service workers and the existing browser writer lock. A `/pr/123` path on the production origin is not an acceptable substitute. Test actual desktop, phone and tablet authentication; mobile viewport screenshots alone do not establish real-device access.

The application DEV website and the existing generated-game **preview** service have different purposes. The latter remains a distinct untrusted execution origin, behind its existing capability, sandbox and credential boundaries. Cloud Run candidate revisions, tags and canary traffic are release mechanisms, not the permanent TEST environment.

## Capability assessment and consolidation

| Existing work | Reuse and disposition |
| --- | --- |
| [PR106](https://github.com/jzwyrzyk/family-game-factory/pull/106), source `8734e9b2bd19756f2801365619376c2ce5697d9d` | Reuse disconnected packaging, separate-project/IAP analysis, signed identity and synthetic-grant concepts, bounded paid admission and private-worker separation. Its standalone shared-DEV architecture and manual setup method are superseded by this contract. Do not replay its old-base backend changes over current source |
| [PR101](https://github.com/jzwyrzyk/family-game-factory/pull/101) | Historical design already incorporated into PR106; retain its rationale and history |
| [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) | Reuse exact published-source and bounded browser-verification concepts. Its competing release-controller proposal is superseded; use the merged controller |
| `scripts/deployment/regressions.py` | Keep all existing regression coverage and its eight independent shards. At the assessed baseline it checks 40 commands across 26 suites; CI fixture success remains distinct from deployed UAT |
| `jems-service-images.yml`, `scripts/deployment/build.py` | Reuse immutable images, committed-source archives, separated build/publication credentials and signed provenance |
| `jems-cloud-run-release.yml`, `scripts/ops/release.py` | Reuse exact source/image/configuration/baseline validation, compatibility evidence, etag guards, stage → canary → promotion, retained revisions and traffic-only rollback |
| PR109/110/113/116 and PR143 | Preserve historical repair and cutover receipts. Former Cloud Shell transport is not the routine environment operating method |
| [PR152](https://github.com/jzwyrzyk/family-game-factory/pull/152) | Active Gateway cutover work at assessment time, separate from this implementation. Its acceptance hold remains effective |

This supersession is a design and implementation direction. It does not close PRs, merge their code or prove that their proposed infrastructure exists.

## PR preview trust model

A PR build executes untrusted application code on an isolated GitHub-hosted job with read-only repository access and no cloud identity or deployment secrets. The output is a bounded data archive. A trusted controller from protected `main` independently validates the originating repository, workflow, run, PR state, current PR head, successful required checks, artifact identity and contents before publication.

The privileged publisher must never execute a PR's scripts, Dockerfile, downloaded binary or package lifecycle hooks. A trusted static-server image consumes only validated frontend files. Archive traversal, links, duplicate names, unsupported file types and excessive file/total sizes fail closed. The deployer accepts immutable image identities and a separate nonproduction runtime account with no project roles. Production project IDs, service identities and origins are rejected. Ordinary PR workflows cannot exchange their own OIDC token for deployment credentials.

The build records exact source and frontend content identity, replaces browser configuration with a disconnected nonproduction configuration, and displays environment/PR/source. An identity marker is evidence about the served bundle, not independent build provenance. The trusted controller must bind it to the verified source/run/artifact envelope.

Use zero minimum instances, a bounded maximum per service, an approved maximum number of active previews and a default 72-hour retention window. Refresh expiry only for an eligible new deployment. Scheduled reconciliation checks closed PRs and expiry twice an hour (GitHub scheduling may be delayed); a manual cleanup dispatch is also available. Cleanup requires exact project, managed labels and PR/service identity, and cannot select TEST or production. Deletion does not erase files already cached by a tester's browser.

Evaluate preview applicability against the complete PR diff, and TEST against its last successful owned deployment. A documentation commit arriving during an application build must not cancel that build and strand the application change without a current eligible bundle. Documentation-only PRs skip packaging; documentation-only main advances skip it only when the prior deployed TEST application already covers the unchanged inputs. Missing deployment evidence fails safely toward producing a bundle, never toward assuming the application shipped.

## Permanent TEST and complete experience

TEST must ultimately support Home/navigation, Ready to Play, My Creations, coaching, generation/modification, artwork, coding, Math/Language, parent/profile controls, rewards/progression, the adult workspace and safe saving/recovery. The initial static packaging and browser smoke cover only a subset and must retain that limitation in status.

Reconcile PR106's separate backend and worker work with current main before activation. Preserve device enrollment, adult permits/tab proof, family/profile boundaries, model-keyless gateway, private coach credentials, generated-code sandboxing and authorization rechecks. Do not enable child processing by fabricating consent records for synthetic tests. Use authorized adult operators and explicitly synthetic profiles.

The TEST gateway currently needs one exact application origin; arbitrary PR origins must not share it by bypassing that check. Frontend-only PRs do not need independent backends. A future authorized full-stack PR lane must provide actual tenant/session isolation or its own reviewed backend scope before connecting live services.

Nonproduction data resets must target a dedicated synthetic namespace through an authenticated, audited operation. Fresh isolated browser contexts can reset local test data; they cannot substitute for a safe server-side reset. Never copy production family data, grants, signing keys, provider credentials or backups into TEST. Resetting fixtures must not refill the AI spending ledger or replay uncertain paid requests.

Real-provider acceptance requires a separate, explicit request/token/cost allowance, concurrency limit, expiration and server-enforced admission. Billing alerts alone are not hard spending limits. Ordinary deterministic tests cost no inference money. A skipped provider journey leaves live acceptance incomplete.

## Acceptance and release identity

| Lane | Required evidence | Limits |
| --- | --- | --- |
| DEV | Relevant source checks, targeted dependency tests, served identity, interactive preview, screenshots and affected-journey manual steps | Owner review is required for visible/interactive changes; no claim of full-stack acceptance from disconnected preview |
| TEST | Complete existing regressions, actual deployed browser journeys, configuration/artifact checks, recovery/profile isolation, authorized real-provider acceptance and owner evaluation | Record fixture versus real service execution, browser versus physical device, and measured coverage; missing journeys block readiness |
| PROD | Existing provenance/compatibility checks, staged/canary transition evidence, bounded actual-site smoke, health/error verification and recovery result | A deployment receipt or HTTP health response does not prove successful generation or saved-game recovery |

The new deployed browser runner reads the actual served environment identity before and after interaction and uses fresh synthetic browser contexts at desktop, tablet and phone dimensions. Its initial navigation/game smoke is deliberately incomplete for comprehensive TEST. It does not intercept requests to manufacture provider success. Preserve screenshots and per-journey evidence bound to source and manifest; exclude credentials, private prompts and family data.

Seal an immutable release manifest recording exact source, frontend archive/content digest, gateway/preview/coach image digests, worker/sandbox/trusted-runtime identities, applicable TEST and production configuration digests, successful CI and deployed UAT evidence. Present the included changes alongside that sealed identity in the owner directory and release review. Required fixture, live-provider and manual-acceptance scopes remain distinct. An approval binds the complete manifest digest and independently authenticated allowed owner identity. A PR label, merge, typed username or arbitrary success JSON does not establish approval.

Any relevant source, artifact, worker/runtime or configuration change invalidates approval. Reuse the tested frontend archive and immutable backend images wherever technically appropriate; separately bind environment-specific configuration. Do not rebuild an untracked production bundle and call it the tested artifact. A manifest validator is a gate primitive, not a deployed production integration or a substitute for fetching trusted GitHub approval/evidence records.

After the active cutover, connect this prerequisite to the existing release-intent workflow. Keep the existing backend dependency sequence, canary, provenance, compatibility and data safeguards. Application merges must never write production release intent as a side effect. During this foundation work, `ops/release.json`, `ops/compatibility.json`, `ops/publish-images.txt` and production deployment workflows remain unchanged.

## Recovery and status

The owner can bookmark [the environment directory](https://github.com/jzwyrzyk/family-game-factory/issues/156). Its current entries correctly show nonproduction setup pending; automation begins only after activation.

A failed verification stops further promotion. Traffic rollback may use an already retained, verified compatible baseline through the existing controller. A previous frontend may not understand newer saved data; automatic recovery must check reader/schema/runtime compatibility, in-flight jobs and artifact retention. If compatibility is unknown, halt for the documented recovery decision or roll forward; never restore bytes blindly or delete user work. The current source foundation does not yet automate the complete functional-verification/recovery sequence.

The owner directory provides one bookmarked location containing active DEV links, TEST and PROD, human-readable included/pending developments, review actions and deployment receipts. The initial controller maintains sanitized GitHub issue/PR metadata from deployment evidence. This repository is public: the directory itself is not an authenticated site, while its DEV/TEST destinations require IAP. Do not publish secrets, family data, signed access URLs or restricted operational evidence there. If the inventory itself needs to be private, serve the same small directory behind TEST IAP instead of adding an administration platform. A generated directory is useful only once its links, statuses and destination authentication are observed working.

Every applicable PR should report its preview URL/status/source, implemented changes, affected journeys, test results, relevant before/after images, manual steps, known limitations and integration readiness. Automation should distinguish: under development → preview available → awaiting owner review → approved for integration → merged → deployed to TEST → automated UAT passed → awaiting production approval → deployment in progress → deployed and verified; failed/rolled-back states carry the failed receipt. Merged is never synonymous with live. A state advances only on evidence for the relevant exact identity.

## Completion evidence

The assignment remains incomplete until all rows below have actual linked evidence. Source tests, provisioning and merge receipts cannot substitute.

| Requirement | Evidence to record |
| --- | --- |
| Concurrent DEV | Two independent applicable PR URLs, authenticated access on desktop/phone/tablet, source identity and automatic eligible update on each |
| Lifecycle | PR close and retention expiry remove only the intended resources; missed-event reconciliation and artifact cleanup observed |
| Integrated TEST | Permanent URL, complete isolated stack, repeatable synthetic scenarios and safe reset; all listed product journeys observed |
| Automated acceptance | Comprehensive browser UAT against deployed TEST plus distinct authorized real-provider receipts and owner review |
| Exact promotion | Tested manifest and authenticated approval, unchanged artifacts/configuration binding, production controller evidence and bounded verified behavior |
| Recovery | Failed-verification stop and compatible automated recovery drill preserving stored user work |
| Security and owner experience | Denied production access from DEV/TEST identities, denied untrusted PR credential exchange, working IAP, directory and truthful statuses |
| Operations and doctrine | Every routine operation demonstrated without Cloud Shell; current source, setup, costs, workflow and documentation references agree |

Outstanding setup and full-stack integration must remain visible in the directory/PR. Do not clear a failed requirement by narrowing its label.
