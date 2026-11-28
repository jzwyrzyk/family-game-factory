# Backend documentation

Start with [Current architecture](../ARCHITECTURE-CURRENT.md), [Delivery state](../DELIVERY-STATE.md), and the executable [gateway](gateway.ts)/[HTTP handlers](pipeline/http.ts). The backend now includes the job pipeline, trusted devices, private coach/speech, deployment tooling and generated-game isolation. A source checkout alone does not establish current live deployment or activation.

The original contract snapshot below is retained as historical rationale. Its statements about an unimplemented backend, missing deployment scripts and proposed endpoints describe that early assignment; **they are not current status or a complete API specification**. The implemented generation API is `/v1/jobs`, not the proposed `/v1/generations`. [openapi.json](openapi.json) covers jobs/revisions/worker operations but still needs reconciliation with newer coach/speech/device routes.

## Current JSON transport

[http-json.ts](http-json.ts) counts raw request bytes and decodes once after the bounded body is complete, preserving multi-byte UTF-8 characters split across chunks. It performs JSON parsing; each route still owns authentication, schema validation and its existing public error response. It does not trust `Content-Length` to enforce the limit. The gateway audio upload remains a separate bounded binary reader.

| JSON route family | Maximum body bytes | Empty body |
| --- | ---: | --- |
| Pipeline jobs/revisions | 12,000 | Parsed as `{}`, then route validation |
| Coach conversation | 50,000 | Invalid JSON |
| Coach receipt erasure | 1,024 | Invalid request |
| Trusted-device/session/parent/adult operations | 2,048 | Parsed as `{}`, then route validation |
| Legacy invitation session | 1,000 | Invalid invitation |
| Authenticated worker claim/report/status | 10,485,760 | Parsed as `{}`, then route validation |
| Private coach text / audio envelope | 40,000 / 440,000 | Invalid request |

The legacy invitation reader now measures its 1,000 limit in bytes instead of JavaScript characters; valid invitation values are still ASCII. Raw JSON padding contributes to every limit. [Transport tests](../tests/http-json.test.ts) cover UTF-8 splits, inclusive limits, malformed/empty input and authentication before body consumption. [Private admission tests](../tests/private-coach-concurrency.test.ts) cover shared text/audio slots and delayed or disconnected clients. Source implementation and local fixtures are separate from service deployment and live acceptance.

## Current source: initial build request recovery

`GET /v1/job-requests/:clientRequestId?payloadHash=...` recovers an initial request whose identity the browser saved before `POST /v1/jobs`. [JobService.lookupSubmission](pipeline/service.ts) checks the existing family/adult audience, session and applicable trusted-device authority, then verifies the stored payload hash. It returns `{job: <authorized job view>}` or `{job: null}` without admission, dispatch, allowance reservation or provider calls. Duplicate matches, retry identities and mismatched hashes fail closed.

`job:null` remains uncertain because the original POST may still commit later. The browser preserves the record and offers read-only checks without replaying the POST. Failed acknowledgement or Ready-candidate writes also remain recoverable. The [canonical architecture contract](../ARCHITECTURE-CURRENT.md#conversation-led-creation-readiness-and-build-handoff) defines the exact identity, profile/API binding, notebook compatibility and remaining limits; [openapi.json](openapi.json) defines the route shape.

Deploy and verify the gateway contract before its web client. The gateway Docker context and exact-source archive include the pure `src/builder/submission.ts` dependency. The private generation worker and source pin are unchanged. Local regressions and packaging checks are source evidence, not a deployment or live-generation receipt.

## Isolated DEV runtime — reconciled source, November 28, 2026 (America/New_York)

The [DEV workbench runbook](../docs/development/DEV-WORKBENCH.md) configures one nonproduction stack for approved adults testing both the Adult workspace and synthetic child-style product paths. This implementation is opt-in through `FACTORY_ENVIRONMENT=development` plus complete `devAccess`; absent that configuration, production authorization and release defaults are unchanged. No live deployment or provider acceptance is established here.

| Boundary | Implemented behavior |
| --- | --- |
| Project and state | [dev-access.ts](dev-access.ts) requires a separate DEV project ID/number, exact synthetic family/workspace, own artifact bucket and finite service origins. Cloud Run checks actual project metadata before accessing Firestore/GCS. Production identifiers and incomplete/mixed configuration fail closed. |
| Browser entry | [dev-site.ts](dev-site.ts) is a keyless static host and same-origin `/v1` proxy. It and [gateway.ts](gateway.ts) independently verify the signed IAP JWT: issuer `https://cloud.google.com/iap`, ES256 Google keys, exact `/projects/PROJECT_NUMBER/locations/REGION/services/jems-dev-app` audience, bounded validity and exact operator-confirmed adult subject/email allowlist. It does not trust arbitrary identity headers or proxy browser requests into worker/internal routes. |
| Synthetic test authority | [dev-test-policy.ts](dev-test-policy.ts) creates server-only, device/family/policy/hashed-adult-bound grants lasting at most one hour. Original authorization is rechecked during asynchronous work and completion. Actual Adult-profile work still needs its normal permit, passphrase session, cookie and tab proof. No guardian or ZDR evidence is created. |
| Paid admission | A durable `devSpend.admittedMicroUsd` counter admits each request's maximum cost across generation, model coach, dictation, narration and additional premium repair holds. An explicit total and expiry are mandatory; the example authorizes nothing; existing family/per-request limits also apply. Only one paid operation may run at once. Failures, cancellation and monthly rollover do not refill the counter. Infrastructure costs remain separate. |
| Private worker | Exact independent private DEV repository/owner IDs, full approved SHA, immutable `jems-dev-execution-<SHA>` tag, `factory-private-dev.yml` and the `jems-dev-generation`, `jems-dev-sandbox`, `jems-dev-quality` stage identities. The validated DEV policy selects that tag namespace; a matching production tag cannot substitute. Worker callbacks use exact GitHub OIDC to the direct gateway, independently of browser IAP. Production worker main, workflow and pins are not used as DEV release controls. |
| Private coach | [private-bridge.ts](coach/private-bridge.ts) and [private-executor.ts](coach/private-executor.ts) bind the separate DEV project, canonical coach audience and `jems-dev-gateway@DEV_PROJECT.iam.gserviceaccount.com`. Coach credentials remain solely in that private executor; the site/gateway/preview remain model-keyless. |
| Generated preview | [preview-server.ts](preview-server.ts) requires the exact `/projects/PROJECT_NUMBER/locations/REGION/services/jems-dev-preview` IAP audience and existing signed artifact ticket/audience checks. Separate origin, generated-code CSP and sandbox behavior remain. Native-origin iframe/IAP behavior still needs verification in the actual adult testing browser. |

Focused tests in `tests/dev-identity.test.ts`, `tests/dev-ai-policy.test.ts`, `tests/dev-gateway.test.ts`, `tests/dev-preview.test.ts` and `tests/dev-site.test.ts` use explicit identity/provider/storage fixtures. They are not cloud IAM, paid-provider, child-policy or physical-device acceptance. Never copy production family data, secrets, approval records or worker trust to satisfy DEV setup. Restore/release procedures and remaining activation evidence belong in the runbook.

## Historical snapshot — managed backend contracts

`contracts/api.ts` defines versioned Cloud Run boundary types, tenant authorization and parent release gates, strict generation input validation, job transitions, private Firestore/Cloud Storage ports, atomic budget reservations, isolated-worker and server-only AI provider interfaces. The unconfigured adapter fails explicitly. These files are not imported by the browser and contain no cloud credentials, SDK initialization or mock generation success.

No production endpoint is deployed. The newer Issue #4 reference HTTP/job pipeline is implemented in `pipeline/`; its canonical API is documented in `openapi.json`. The older `/v1/generations` contract types below remain proposed, not separate active endpoints. See [pipeline scope](../docs/agent-pipeline.md). No billable resource, account, bucket, database, queue, secret or build worker is created. Implementing the cloud service is a later phase. Type checks and contract tests are useful foundation checks; they do not prove cloud security or a production isolation boundary.

## Required service behavior before enabling clients

- `POST /v1/sessions`: verified family identity (issuer/audience/expiry), CSRF protection where cookies are used, secure HttpOnly SameSite cookies. Client JSON cannot select membership. Public users can read only explicitly approved static releases.
- Every request is version 1, has a bounded body, denies unknown fields, checks resource ownership using verified session scope, and returns opaque not-found/forbidden responses without private metadata. Do not accept family or storage paths from generated code.
- `POST /v1/interpret`: deterministic validation first, generation-needed explicitly returned for unsupported mechanics. Provider output is untrusted and must pass the same manifest validator or isolated build.
- `POST /v1/revisions`, `GET /v1/revisions/{id}`, `POST /v1/revisions/{id}/fork`: immutable private revisions with parent references, family-scoped idempotency and atomic transactions. Fork does not publish. Only scoped server-issued short-lived preview URLs; private artifacts cannot be read anonymously.
- `POST /v1/generations`, `GET /v1/generations/{id}`, `POST /v1/generations/{id}/cancel`: asynchronous queue, family rate limits, atomic cost reservations, bounded retries, idempotency, cancellation and budget kill-switch. Deny when limits cannot be read/reserved. Billing alerts alone are not spending caps.
- `POST /v1/coach`: use the authorized play event and revision, exclude identities/math history from provider prompts, one optional reflection at a time, skip supported.
- `POST /v1/revisions/{id}/publish`: parent role, explicit approval, immutable content hash, artifact validation, successful browser/regression tests; publish approved static package only. Rollback selects a previous tested release. No automatic deployment is implemented here.
- Firestore rules: deny public reads/writes for draft data; family membership required. Cloud Storage: private buckets, no public ACLs. Cloud Run service identity has least privilege; provider credentials stay in Secret Manager; the worker identity cannot read family sessions or secrets.
- Untrusted generation goes to a separately isolated worker with no cloud metadata endpoint, app credentials, arbitrary network, or access to the deployment pipeline. Enforce CPU, memory, runtime, output size, MIME/path/symlink and artifact-hash validation. Preview uses a separate untrusted origin and sandboxed iframe without `allow-same-origin`, strict `default-src 'none'` CSP and narrow typed message channels. No generated JS is executed by this implementation. Prompts are plain bounded strings, never shell or code.
- Keep original child drawings private and immutable. Cutout/rigging requires explicit permission; transformations retain provenance. Do not send names, photos or learning records to public GitHub or telemetry. Define retention/deletion and consent before connecting production providers.

Production identity/cloud integration, live provider calls, cloud IAM/rules tests, abuse tests and real generated-module sandbox/publish/rollback tests remain blocked until the owner provisions the backend. There is intentionally no “deploy” script.
