# Backend documentation

Start with [Current architecture](../ARCHITECTURE-CURRENT.md), [Delivery state](../DELIVERY-STATE.md), and the executable [gateway](gateway.ts)/[HTTP handlers](pipeline/http.ts). The backend now includes the job pipeline, trusted devices, private coach/speech, deployment tooling and generated-game isolation. A source checkout alone does not establish current live deployment or activation.

The original contract snapshot below is retained as historical rationale. Its statements about an unimplemented backend, missing deployment scripts and proposed endpoints describe that early assignment; **they are not current status or a complete API specification**. The implemented generation API is `/v1/jobs`, not the proposed `/v1/generations`. [openapi.json](openapi.json) covers jobs/revisions/worker operations but still needs reconciliation with newer coach/speech/device routes.

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
