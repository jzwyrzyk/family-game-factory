# Persistent private DEV

The November 28 release instruction retains static PR previews and adds the existing isolated DEV runtime to the consolidated #226 application. This supersedes the activation instructions of public #106. Private worker #16 remains the clean DEV export preparation. Neither source preparation nor fixture success establishes a deployed or authorized paid service.

## Isolation and ordinary development

A stable `jems-dev-app` serves the current application behind native Cloud Run IAP. Every request requires a verified, explicitly listed adult Google identity. Its same-origin proxy preserves trusted-device sessions and forwards the signed IAP assertion to the independent DEV gateway. It strips unrelated credentials and cannot proxy worker callbacks. Gateway and preview verify their exact service origins and project metadata before opening DEV storage. There is no offline cache of the authenticated shell and no child-data or production-data import.

The synthetic workspace supports adult-operated child-style UI testing without inventing guardian consent. Its device-bound grant expires after at most one hour and is checked again before dispatch and at completion. Actual Adult workspace operation retains the existing separately recorded adult permit and tab proof. Neither authorization substitutes for the other. Existing family beta, household, TEST, premium, retry and receipt-recovery behavior remains authoritative outside explicit DEV configuration.

The DEV project, artifact bucket, workspace, secrets, runtime accounts, provider credentials, worker repository and spending records are separate from TEST and production. Worker dispatch binds a private `-dev` repository, exact owner/repository IDs, protected main, the reviewed full SHA, `jems-dev-execution-<SHA>`, `factory-private-dev.yml` and three distinct DEV stage identities. Production worker main and release controls do not become DEV controls. The current operational static project `jems-jzw-nonprod` cannot be selected as this live DEV project.

## Spending authority

`devAccess.maxTotalMicroUsd` and `allowanceExpiresAt` are explicit approved configuration. The deployment manifest expresses the same values as `budget.totalMicroUsd` and `budget.expiresAt` (UTC Unix milliseconds). The example is deliberately incomplete and grants no allowance. Existing per-request, family and premium lineage ceilings continue to apply.

One durable `devSpend.admittedMicroUsd` counter reserves maximum cost for generation, coach, dictation, hosted narration and additional premium repair holds. Only one paid operation is admitted at a time. Errors, cancellation, uncertain results, month rollover, a new IAP grant, allowance UI changes or synthetic fixture cleanup cannot refill it. Expiry or exhaustion denies new paid work; existing local editing and saved work remain available. Renewal requires an explicit reviewed increase/expiry update against the retained counter, never erasure or recreation of that counter. The private coach remains model-keyed; app, gateway and preview remain model-keyless.

The lifetime admission counter is an application control, not a cap on Cloud Run, worker, registry, storage or network charges. Infrastructure and model/provider entitlement decisions are separate. Default provider and narration flags remain off; enable only the individually approved capabilities with current prices, isolated credentials and verified project bindings.

## Reused preparation and qualification

- `scripts/deployment/dev_contract.py`, `dev_config.py`, `dev_bootstrap.py`, `dev_images.py`, `dev_secrets.py` and `dev_release.py` preserve the existing finite DEV resource/configuration/image/release contracts. Config updates retain signing keys and data. Uncertain publication is observed by its existing operation identity rather than replayed.
- `scripts/development/package-site.ts` and the DEV Dockerfiles package a clean exact source without destination or credentials. The authenticated runtime supplies environment configuration. Existing offline application build defaults remain unchanged.
- `Jems environment contracts` exercises DEV authorization/spending/proxy tests, deployment fixtures, exact committed-source packaging, Docker build and a non-root offline runtime import. It has no deployment identity or provider secrets.
- Actual acceptance must observe adult IAP login and denials, trusted device and Adult workspace authorization, the real isolated worker and provider, coach/build/repair/play/edit/Keep/reload, original-art retention, saved-work recovery, exhaustion/expiry, no sandbox egress and worker cleanup. Record exact frontend/backend/worker/configuration identities and actual owner/device observations separately from CI.

Routine setup, publication and release must run through protected GitHub automation after the applicable infrastructure approval. The low-level helper CLIs are reusable implementation, not an instruction for the owner to run Cloud Shell. The [coordinated release package](../operations/RELEASE-EXECUTION-2026-11-28.md) tracks the GitHub transport, private setup bindings, costs, approvals and remaining live evidence. No live DEV availability is claimed until those operations and acceptance actually succeed.
