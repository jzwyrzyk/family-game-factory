# Jems development environments and release path

**Status:** implementation plan. The owner accepted the lightweight DEV direction and asked to start laying it out on November 20, 2026, America/New_York. The hosting, resource and workflow details below are proposed implementation choices. This document does not establish a deployed DEV environment.

**Inspected application baseline:** `aeb3fdb953fd5812e9fec0b4b5f6b1288c45666c`. Use [delivery state](../../DELIVERY-STATE.md) and fresh observations for operational status. The ongoing production rollout is a separate workstream; this plan adds no prerequisite to completing that authorized rollout.

## 1. Outcome and working model

Give each feature a link that can be reviewed before merge, give integrated AI changes a safe place to run, and promote an identified, tested release without making the owner relay routine commands through Cloud Shell.

| Place or activity | Purpose | Source and data | Initial remote AI policy |
| --- | --- | --- | --- |
| Local development | Fast coding and debugging | Feature checkout; synthetic fixtures | Unavailable or explicitly mocked |
| PR application preview | Review layout, games, navigation, art and local persistence before merging | Exact PR head; distinct browser origin; disposable synthetic work | Disconnected; no production or shared DEV backend |
| Shared integration DEV | Test combined features and the actual connected journey | Exact manifest from merged main by default; reviewed feature candidates allowed through the trusted controller; separate DEV state | Authenticated adult test scope, DEV credentials and bounded allowance |
| Release acceptance | Reserve shared DEV at one immutable candidate and run smoke plus applicable regression checks | Frozen component manifest and configuration | Explicit bounded tests within the DEV allowance |
| Production | Serve the accepted experience | Promoted compatible artifacts; existing production accounts and data | Preserve the existing approved production capability state |

Smoke is a kind of test. It does not name another permanently running website. Initially, shared DEV also hosts the release candidate while reserved; other feature work continues in independent PR previews. Queue shared-DEV deployments during that reservation. Revisit an additional acceptance environment only when observed contention justifies it.

The existing **Adult (development)** profile remains an authenticated product capability on its existing site. A separate infrastructure DEV does not remove that profile, relocate existing adult work, or change the accepted [one-site adult experience](../decisions/0005-temporary-adult-profile.md).

Also distinguish **PR application preview** from **generated-game preview**: the latter is the existing untrusted-game hosting boundary and must remain separate from the application and gateway origins.

## 2. Verified starting point and reuse

| Observed source | Consequence for this plan |
| --- | --- |
| [Default public configuration](../../public/factory-config.json) is `mode: unavailable`; [site-config.ts](../../scripts/deployment/site-config.ts) writes public URLs after build | Most visual/local previews can run without provisioning an AI stack. Separate immutable application bytes from the small environment configuration. |
| [Pages workflow](../../.github/workflows/pages.yml) requires main, an exact merged source and the two known production origins | Add a preview publisher; retain the production destination checks. |
| [Gateway](../../server/gateway.ts), [sessions](../../server/sessions.ts) and [trusted devices](../../server/trusted-devices.ts) use one exact app origin | PR hosts must not be added to production CORS. Use one stable shared-DEV origin for authenticated integration. |
| [Dispatcher](../../server/actions/dispatcher.ts) requires the private worker's main and immutable execution tag to match its approved SHA | Independent DEV worker development needs a separate control plane; merely adding a DEV workflow to production main can invalidate production dispatch. |
| [Gateway policy](../../server/gateway.ts) and [OIDC verification](../../server/actions/identity.ts) bind the existing worker repository and stages | Explicit environment-specific identity support is a prerequisite to connected DEV. |
| [Image builder](../../scripts/deployment/build.py), [coach builder](../../scripts/deployment/build_coach.py) and [continuity audit](../../scripts/deployment/continuity.py) provide useful verified-source mechanisms but have production-specific targets | Reuse the mechanisms behind a validated environment manifest; do not substitute arbitrary project strings. |
| [deploy.py](../../scripts/deployment/deploy.py) is an inactive bootstrap with existing-service guards | Create a separate provisioning plan and in-place DEV updater; do not use bootstrap as a routine updater. |
| [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45) remains an open draft, with merge conflicts at the inspected head `f9062d4ed116b2d7516da4dddd4e9232584284f0`; [issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46) owns the full release follow-up | Reconcile that work with current main instead of introducing a competing production controller. |

The parallel direct-access work prepares Cloud Run metadata diagnostics and a reusable assistant connection. At inspection it is separate, uncommitted work, and does not provide workflow dispatch, log access, promotion or rollback. Integrate its eventual reviewed result; do not describe a working DEV site or a diagnostic connection as completion of the no-shuttle goal.

## 3. First deliverable: PR application previews

### Hosting recommendation and visibility

Use **Firebase Hosting preview channels** in a dedicated nonproduction project for the first static preview slice. The app is already a Vite static build; production remains on GitHub Pages. Use a channel per PR head, for example `pr-123-abcdef123456`, with the complete SHA in its manifest. Each head gets a distinct origin, and the PR's deployment/check link identifies the currently reviewed head.

Firebase documents that preview links are **public**, even though their suffix is difficult to guess. This recommendation therefore applies only to publicly shareable application code and synthetic test work. It does not authorize publishing private artifacts, recordings, account data or production backups. The application must show a short preview/disposable-work label and the build identity. A `noindex` header helps discovery hygiene but provides no access control. See [Firebase preview behavior](https://firebase.google.com/docs/hosting/test-preview-deploy).

If the static shell itself needs authenticated access, use an authenticated host such as [Cloud Run with IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run) and verify the actual user/OAuth setup. That is a different hosting implementation, not a claim that Firebase links are private.

### Build and publish contract

1. Build each eligible PR head with a read-only repository token, no cloud/model credentials, no production access and no privileged runner. Run type/build checks and the relevant local/browser checks. Existing required merge and release checks remain required.
2. Produce a bounded static artifact with exact repository, PR, full source SHA, workflow/run identity and content digest. Treat the artifact and all PR-controlled strings as untrusted input.
3. A separate publisher runs reviewed code from a protected ref. It verifies the source workflow, repository, PR/head relationship, successful checks, artifact identity, archive paths/types/size, and that the PR is still eligible. An older run cannot replace the latest preview link after a newer head arrives.
4. The privileged job publishes data only. It must not install PR dependencies, run artifact scripts/hooks, load artifact-provided publishing code, reuse untrusted build caches or accept arbitrary project/site/configuration inputs. Use trusted hosting configuration and safe archive extraction. GitHub documents the risks of privileged triggers consuming untrusted code and artifacts in its [secure workflow guidance](https://docs.github.com/en/actions/reference/security/secure-use).
5. Use the disconnected public configuration. The publisher checks or writes it using trusted code and rejects runtime endpoint overrides, backend rewrites and unsafe hosting configuration. A preview response policy should block production/API/provider destinations where compatible; the production server's authentication and origin/CSRF rules remain the authority.
6. Verify the served manifest and a clean-browser journey: character selection, one native game, relevant art/navigation and save/reload. Assert zero production API, model, remote coach/speech and analytics requests. Record fixture versus real-service evidence accurately.

Initially publish only same-repository PRs from authorized contributors. Fork PRs get unprivileged build evidence; a reviewed promotion into the eligible preview path is required before publication. Workflow/publisher changes need review independently of the application they publish. Use a GitHub deployment/check result for the preview link; automatic discussion comments are unnecessary.

### Lifecycle and credentials

Proposed defaults: seven-day expiry, one current preview per open PR, at most one retained previous head for comparison, and explicit close/merge cleanup. A scheduled reconciler handles missed cleanup, using a recorded project/site/channel inventory rather than broad name matching. Firebase supports preview expiry and release retention; expired resources are scheduled for deletion rather than guaranteeing instantaneous erasure. See [channel lifecycle](https://firebase.google.com/docs/hosting/manage-hosting-resources).

Use short-lived WIF credentials for a dedicated publisher service account and [Application Default Credentials](https://firebase.google.com/docs/cli#cli-ci-systems). Bind publisher trust to numeric repository/owner identities, the exact reviewed publishing workflow and protected ref, and its expected event/environment. PR build workflows must be unable to exchange their own OIDC tokens for publisher credentials; a repository-wide trust condition is insufficient. Do not install a long-lived service-account key through convenience scaffolding. Firebase currently requires predefined Hosting roles rather than custom Hosting roles; its documented CLI permission set includes Hosting Admin and API Keys Viewer. Hosting Admin can change/delete Hosting resources across the granted project. The project boundary and trusted publisher constrain exposure; do not claim IAM restricts it to one PR channel. If shared DEV later uses Hosting in the same project, explicitly account for that publisher's reach. References: [Hosting permissions](https://firebase.google.com/docs/projects/iam/permissions), [predefined roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product).

Separate hosts are essential: a `/dev` or `/pr/123` path on the production host does not isolate localStorage, IndexedDB or the existing origin-wide writer lock. Keep the real offline behavior available for testing. Channel deletion does not erase browser data, and a service worker may still serve a cached old build; verify the displayed identity, test upgrades and use disposable browser profiles. Do not promise that expiry deletes saved local work.

## 4. Shared DEV: resource and identity boundaries

Provision one separate nonproduction Google Cloud project for integration, with an explicit project ID **and numeric project number** in a reviewed target manifest. Exact resource names, domain choices and identities are outputs of the setup plan; none is provisioned or reserved by this document.

| Boundary | Required DEV separation |
| --- | --- |
| Application | Stable DEV origin; visible DEV/build indicator; authenticated adult test operations |
| Services | DEV gateway, generated-game preview and private coach; generated code remains on a distinct untrusted host |
| State | DEV Firestore database, private artifact bucket and fixtures; no production family/learning records or backups |
| Sessions | New DEV signing keys, test-device enrollment, invitations and adult permits; no copied production cookies or grants |
| Provider access | DEV generation/review credential and separately scoped coach credential; same keyless gateway/browser/preview rules |
| Worker | Independently versioned private DEV worker repository, ephemeral runner group/pool, callback audience, WIF and private configuration |
| Operations | Separate preview publisher, DEV deployer, diagnostics and production release roles; no DEV identity inherits production write or secret access |
| Observations | Environment-labelled sanitized logs/receipts; test analytics disabled or routed to an explicitly separate test destination |

The current Firestore adapter uses a workspace document path and the artifact adapter prefixes bucket objects. Those names organize data; they do not make an independent IAM boundary. Server Firestore clients use IAM and bypass client Security Rules. Inspect inherited and resource-level grants as well as explicit project bindings. See [Firestore authorization](https://firebase.google.com/docs/firestore/security/rules-conditions) and [Google resource hierarchy](https://docs.cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy).

The static DEV shell must contain no private backend data or credentials; backend requests still require DEV authorization. A publicly served shell is not an authenticated website. Before connected DEV launch, choose and verify the shell's access policy and browser-compatible app/API routing. The current [trusted-device contract](../auth/TRUSTED_FAMILY_DEVICES.md) does not establish Safari acceptance for cross-site Pages/run.app cookies. Test actual iOS/Android sessions; investigate a same-site arrangement or reviewed proxy if required. Do not migrate production domains or weaken cookie/CSRF controls as a side effect. A new origin does not inherit existing saved browser work.

## 5. Independent AI worker releases

**Preferred initial design:** a separate private DEV worker repository using the same reviewed generation, isolated test and quality-review architecture. Keep the application source repository shared. Keep production's current worker repository/pin independent while the DEV policy capability is implemented and tested.

The DEV repository has its own protected main and immutable execution tags. Its model environments, runner group, cloud identity and callback destination belong only to DEV. Its GitHub App credential/installation scope must not be able to dispatch production; requesting a narrower token from a production-capable App private key is not sufficient isolation.

Replace the single hardcoded target only through an explicit reviewed worker-policy contract. Bind environment, numeric repository/owner identities, exact workflow/ref/SHA, immutable tag, stage, event, attempt and callback audience. Preserve all existing checks, including main/tag equality within each target, and reject mixed DEV/PROD tuples. Stage names can remain the same inside separate repositories; names alone confer no trust. [Google WIF guidance](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) recommends immutable numeric identity claims rather than reusable names alone.

The second worker repository is a deployment target, not a permanent fork of the product. Reuse versioned orchestration/scripts where practical, record exact workflow implementation and source digests, and compare DEV-tested changes during production promotion. Never make production follow a mutable DEV branch.

Acceptance must show that advancing DEV worker main and deploying a DEV gateway leaves the production worker main/tag, authorized SHA, WIF policy and service configuration unchanged. Test rejection of DEV identities at production policy boundaries offline and through nonmutating permission checks where possible. Never probe isolation by deleting or changing production resources.

## 6. Release identity, promotion and recovery

Treat a release as a compatible component set. This is a proposed manifest contract, not an implemented command or schema:

| Manifest part | Required identity |
| --- | --- |
| Application | Full source SHA, built asset digest, artifact/run ID |
| Public configuration | Environment, exact app/gateway/generated-preview origins, public config digest |
| Backend | Gateway/generated-preview/coach image digests, service revisions and sanitized configuration versions |
| Worker | Numeric repository identity, workflow commit/ref/tag, exact generator source pin, sandbox image digest |
| Runtime | Trusted runtime version and hash; relevant API/asset contracts |
| State and policy | Data-schema compatibility, capability/budget policy versions, fixture set, environment resource identity |
| Evidence and recovery | Checks against this set, reservation owner/run, prior compatible immutable artifacts/revisions and rollback limits |

Build application assets and backend images once, verify their hashes/digests and promote those bytes. Public environment URLs/configuration legitimately differ and receive their own identities; do not call two differently configured directories byte-identical. The DEV and production worker repository identities also differ, so verify reviewed orchestration/source equivalence and each environment's identity binding rather than copying the DEV trust policy into production. Configuration/identity changes need target-environment verification.

For release acceptance, reserve shared DEV with a controller lock and candidate manifest. Run the relevant regression/security/compatibility suites, production-equivalent sandbox smoke and the bounded adult **Build → isolated Test → Review → Play → Keep → Reload** journey. Failed or stale evidence cannot be attached to a changed candidate. Use unprivileged isolated runners for independent tests; serialize suites only where they compete for a concrete resource. A quick preview check never replaces the full release gate.

Extend [PR45](https://github.com/jzwyrzyk/family-game-factory/pull/45)/[issue46](https://github.com/jzwyrzyk/family-game-factory/issues/46) for promotion: verify the target manifest and current state, stage necessary backend revisions without general traffic, test safe compatibility, promote the required backend components, publish the retained frontend artifact with reviewed production configuration, then verify the actual served build and authorized journeys. Pure frontend changes can retain compatible backend digests. Do not rebuild everything for every cosmetic change.

A production revision with no traffic is not a separate DEV environment: it can still share production data, identities and services. Restrict its checks accordingly. Reuse Cloud Run's [staged rollout and rollback mechanisms](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration), with exact production consent/spending scope preserved.

Keep the previous frontend artifact and compatible backend/worker configuration references. Rollback restores that recorded set; rerunning a workflow against current main is not rollback. State migrations and saved-game/runtime compatibility need separate analysis because restoring a binary does not reverse a data migration. Never automatically restore old approval/config snapshots over a newer revocation, security policy or budget change. Handle data/security-incompatible incidents through an explicit recovery plan.

## 7. Operating model and cost controls

Within an authorized task, the assistant should diagnose, prepare permitted fixes, run checks, publish eligible previews and complete permitted releases through the controlled interface. Larger in-scope fixes get a brief explanation and continued work. Initial connection setup, a new trust/permission boundary, a spending increase, destructive production-data work or a strategic product decision belongs with the owner. Carry forward existing authorization rather than repeatedly requesting it.

Expose a bounded interface for plan, stage, verify, promote, status, preview cleanup and compatible rollback. Accept a registered environment and exact manifest/run ID, not arbitrary shell commands or destinations. Record an operation ID before mutation; after a timeout inspect that operation instead of blindly repeating a deploy or paid request. Keep diagnostics and deployment identities separate. A callable trigger and verified live permissions are acceptance requirements, not something this document or the existing GitHub connector can be assumed to provide.

Cost defaults are a small number of retained static previews, bounded build concurrency, request-based DEV services with minimum instances zero where appropriate, and ephemeral isolated workers with verified cleanup. Start real DEV generation with one admitted job at a time and an explicitly configured allowance covering planning, art if enabled, generation, repairs, review, coach and speech as applicable. The server's transactional admission and conservative settlement remain necessary. No dollar amount or increased allowance is authorized here.

Meter hosting/storage/transfer, build minutes, image storage, service/network usage and provider usage separately. Static hosting and scale-to-zero do not mean zero total cost. Alerts-only cloud budgets are notifications; supported spend-cap products have service/enforcement limits and do not replace the application ledger or control every external provider. See [Google billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets). Measure actual preview package size and retention cost before choosing quotas.

## 8. Implementation slices and completion criteria

| Slice | Concrete scope | Complete when |
| --- | --- | --- |
| D0 — Design and source mapping | This plan, decision record, canonical links and documentation routing | Reviewed source constraints and implementation choices are recorded without deployment claims |
| D1 — Local preview contract | Reusable artifact/manifest validation, disconnected config, build label, safe hosting config, lifecycle plan and offline negative tests | A built preview proves local usability, exact identity and zero production calls; invalid/mixed artifacts fail |
| D2 — Hosted PR previews | Trusted publisher/build separation, one-time nonprod Hosting/WIF setup, eligible-PR automation, expiry and cleanup | Two different PR heads can be reviewed independently; stale/fork/malformed artifacts and wrong targets are rejected; cleanup affects only registered previews |
| D3 — Shared DEV foundation | Validated target manifest, separate project/state/services/identities, provisioning and in-place updater, browser routing | DEV source/config changes cannot select production destinations; authenticated DEV sessions work; negative permissions and data isolation are verified |
| D4 — DEV AI independence | Environment-specific worker policy, private DEV worker target/runner, scoped provider access, allowance and real acceptance | DEV worker can advance without changing production; bounded Build/Test/Review/Play/Keep/Reload and failure/cancellation/revocation paths pass |
| D5 — Controlled release and direct operations | Reconcile PR45/issue46 and access work; candidate reservation, artifact promotion, evidence, retained rollback | One permitted change reaches DEV and, when requested, production without owner-relayed terminal output; source/digest/config evidence and continuity are verified |

D1 can proceed while the current production rollout finishes. D2's setup must enumerate actual resources and permissions before activation. D3 and D4 require coordinated public application and private-worker work. Direct diagnostic access and the controller can progress in parallel; a connection failure must identify the missing capability rather than ask for an unrelated broad credential.

The following negative cases belong in the relevant implementation slice, not in a separate generic test expansion: mismatched environment/project number; wrong artifact/head or stale check; unsafe archive/config; accidental production URL; cookie or data crossover; wrong worker identity/stage/attempt; insufficient/replayed paid admission; stale candidate reservation; missing cleanup; incompatible prior data; and production approval loss after an ordinary frontend release.

## 9. Deliberate limits and reconsideration

Do not start with a full backend for every PR, three permanent stacks, a new application fork, a long-lived develop branch, wildcard production origins, shared DEV/production secrets or a replacement for the existing release effort. Real AI feature candidates require a trusted reviewed route into shared DEV; arbitrary PR code does not gain provider access because a preview passed.

Reconsider the design when shared DEV reservations repeatedly block work, authenticated static-preview access becomes necessary, preview transfer/storage is excessive, worker orchestration diverges, or additional teams need different isolation. Record the observed problem and update the [decision record](../decisions/2026-11-20-development-environments.md) before expanding infrastructure.
