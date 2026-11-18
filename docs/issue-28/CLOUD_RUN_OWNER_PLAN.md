# jems Issue #28 — approved dedicated Cloud Run inference architecture

**Decision:** the owner approved a *separate, tightly secured private inference service* instead of reusing the GitHub Actions `factory-generation` secret boundary. The existing factory-generation workflow, its secrets, WIF pins, private runner and GCP identities must remain untouched. This approval is for architecture and code preparation; it **does not establish API ZDR/parental consent, authorize moving a key, or turn on paid model use**.

**Implementation status:** in draft PR #36. Inactive runtime image, immutable-image build path, identity-checked Cloud Run deployment planner and synthetic tests are implemented. No Google Cloud resource has been created or modified from this ChatGPT session.

## Service map

```
Browser (no key, no audio upload, child-owned text)
  -> existing public factory-gateway (existing session + ledger + CSRF)
       -- Google ID token from metadata (exact audience) -->
     factory-coach-private (NEW Cloud Run service; ingress internal + IAM)
       dedicated runtime identity: factory-coach@family-game-factory-jzw.iam.gserviceaccount.com
       authorized caller ONLY: factory-gateway@family-game-factory-jzw.iam.gserviceaccount.com
       scoped OpenAI API project key: NEW Secret Manager secret, only after ZDR approval
       input/output moderation + bounded structured response
  <- model reply only, never game-executable code
```

The dedicated service's image contains only bundled private coach modules. It cannot access the existing GitHub App PEM, Firestore family database, preview bucket, game executor, WIF credentials or the existing generation-worker key. The gateway does not receive model credentials.

## Already implemented on PR #36

- `server/Dockerfile.coach` — dedicated non-root Node 22 container, single bundled private executor, no general gateway, preview, game sandbox or node_modules in the runtime image.
- `server/coach/private-executor.ts` — requires Cloud Run's exact `K_SERVICE=factory-coach-private` and `FACTORY_COACH_EXECUTION_ENV=dedicated-cloud-run`. An inactive release starts with **no model secret** and refuses every inference request. An attempted half-approved deployment fails closed. Binds `0.0.0.0:$PORT` as Cloud Run requires.
- `server/coach/private-bridge.ts` — only accepts the canonical `factory-coach-private-*.run.app` HTTPS hostname family, obtains a signed Google ID token for that exact audience, and sends bounded structured context. External unrelated destinations, redirects, URLs with credentials/paths and unapproved hosts are rejected.
- `scripts/deployment/build_coach.py` — offline review plan by default; existing approved Cloud Build identity, existing same-region Artifact Registry, exact reviewed source SHA, immutable verified output digest. **No deployment**.
- `scripts/deployment/coach_private.py` — offline plan / read-only verification / explicitly authorized *inactive-only* first creation. Never changes gateway networking, Secrets, API keys, billing settings or paid model flags. Will not overwrite an existing service.
- `scripts/deployment/test_coach_private.py`, `tests/issue-28-private-coach.test.ts` and GitHub Actions dedicated image smoke — no paid inference.

## Owner execution sequence: separate, reviewable gates

### A. Before any infrastructure mutation

1. Verify the existing project `family-game-factory-jzw`, region, deployed gateway identity, group/IAM organization policy, Cloud Run and Artifact Registry metadata **read only**. Do not recreate existing infrastructure.
2. Confirm the exact intended region with the existing gateway and with the operator. Do not guess a region from the project ID.
3. Review the current repo's exact SHA and CI; work only from a merged/reviewed immutable commit. Do not deploy a draft PR branch or a mutable image tag.
4. Confirm there is no existing `factory-coach-private` service, identity or scoped model secret that would conflict with the plan.

### B. Prepare and inspect an inactive service (no OpenAI key)

The following commands are **examples to execute only on a trusted owner machine after explicit approval of the image and GCP billing implications**. This chat did not execute them.

```sh
REGION="YOUR_REVIEWED_REGION"
SHA="EXACT_REVIEWED_40_CHAR_COMMIT_SHA"
python3 scripts/deployment/build_coach.py --region "$REGION" --reviewed-source-sha "$SHA"
python3 scripts/deployment/build_coach.py --region "$REGION" --reviewed-source-sha "$SHA" --preflight
# Owner separately authorizes a Cloud Build:
python3 scripts/deployment/build_coach.py --region "$REGION" --reviewed-source-sha "$SHA" --execute
# Record the returned, independently verified .../factory-services/coach@sha256:... reference as IMAGE.
IMAGE="EXACT_REVIEWED_IMMUTABLE_COACH_IMAGE"
python3 scripts/deployment/coach_private.py plan --region "$REGION" --image "$IMAGE"
```

The plan prints the exact inactive service-account creation, Cloud Run deployment and narrowly scoped invoker grant. If the new service account does not already exist, create the specifically named **factory-coach** identity only after reviewing that plan and its inherited IAM policy. The deployment tool intentionally does not create accounts automatically.

```sh
# Only once the owner has inspected the plan, the dedicated service account,
# the reviewed image and any costs:
python3 scripts/deployment/coach_private.py deploy-inactive \
  --region "$REGION" --image "$IMAGE" --owner-authorized-inactive
# Read-only verification at any point:
python3 scripts/deployment/coach_private.py verify --region "$REGION" --image "$IMAGE"
```

An inactive service has: min instances 0, max instances 1, max concurrency 4, timeout 45s, strict `internal` ingress, `--no-allow-unauthenticated`, exact gateway `roles/run.invoker`, and **no secret mount or API key**. It is **not** yet ready for chat just because the Cloud Run revision is Ready.

### C. Check the internal network route BEFORE connecting the gateway

Google Cloud says Cloud Run traffic destined for another Cloud Run service with `internal` ingress must be routed **through a VPC** to qualify as internal. Simply having both services in the same project or granting IAM invoker is not enough.

Review the existing `factory-gateway` networking configuration. An approved route may require Direct VPC egress or an existing VPC connector and, depending on routing, Private Google Access / Private Service Connect or an internal load balancer. This may add costs and affects the existing gateway. **No script in PR #36 changes existing gateway networking or firewall policy.** Do not switch `coachPrivateOrigin` on until an authenticated synthetic request succeeds from the existing gateway identity.

GCP reference: https://docs.cloud.google.com/run/docs/securing/private-networking

### D. ZDR, child privacy, and a dedicated key (still BLOCKED until verified)

- In the OpenAI API organization/project, verify **Zero Data Retention is approved and applied for the exact API use/model** before processing personal data from children under 13. A `store:false` request flag alone is not an approved ZDR arrangement. Confirm any applicable endpoint feature or moderation retention exceptions and age-related safety requirements.
- Confirm COPPA-appropriate parent disclosures, consent where applicable, data access/deletion, response safeguards, no public community or child-to-child messaging, and incident handling.
- Only after these approvals, create a **new narrowly scoped OpenAI API project key** for the coach pilot and a **new** Secret Manager secret (suggested name `factory-coach-openai-key`). Do not move or reuse the key in GitHub `factory-generation`.
- Grant `roles/secretmanager.secretAccessor` **only** to `factory-coach@family-game-factory-jzw.iam.gserviceaccount.com` on that specific secret, not project-wide. The existing gateway, preview, generation worker and CI should not be granted access.
- Pin an explicit, reviewed secret version to the private coach service only; do not use a mutable `latest` alias. Never include a secret value in CLI flags, project files, GitHub Actions variables, screenshots or chat.
- Select the exact model with current price review, per-turn limit, family allowance and cloud service cost ceiling. The initial proposed *model* allowance is $5; Cloud Run, Cloud Build, logging and network charges are **separate**. No idle-cost-free claim is made.

### E. Only after the real-data gates pass

1. Review service identity/audience, internal route, runtime configuration, per-family session and spending cutoff. Keep the private service inactive when first connecting the gateway.
2. Run a synthetic identity-authenticated handshake, including wrong audience, missing caller role, browser-origin access, refusal, over-budget and no-raw-audio tests.
3. Explicitly authorize a narrow paid **synthetic** model smoke, then all 20 design-coach scenarios scored by a human and a multi-turn latency test. Inspect actual model response behavior and allowed retention.
4. Run a private family text-only pilot with required Math/English checks; separately validate on-device speech on real iOS/Android browsers. Do not silently switch to remote microphone service.
5. Deploy/enable by owner approval only; record the exact source SHA, immutable image, Cloud Run revision, secret version and rollback path. Rollback: disable coach flags, remove `coachPrivateOrigin` from the privately mounted gateway config, restore prior service revision, revoke the coach invoker grant and disable the specific new secret version if necessary.

## Current stop/go state

| Gate | Status |
| --- | --- |
| Design and code for private inference | Implemented, draft PR #36 |
| Dedicated inactive image build CI | Automated on PR; check latest CI |
| Offline owner deployment plan | Implemented; no deployment performed |
| Actual GCP service account, service, ingress or network route | **Not inspected or provisioned here** |
| API ZDR and child-data safeguards | **Owner/operator evidence required** |
| Dedicated coach API project key/Secret Manager version | **Not created or mounted** |
| Funded live model request and 20-case human evaluation | **Not run** |
| iOS/Android reliable child voice | **Not yet validated** |

Existing game generation infrastructure, saved games and current Pages site stay untouched.

## Sources

- Google Cloud Run service-to-service OIDC: https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- Google Cloud Run internal network rules: https://docs.cloud.google.com/run/docs/securing/private-networking
- Google Cloud Run secret mounting and IAM: https://docs.cloud.google.com/run/docs/configuring/services/secrets
- OpenAI under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- OpenAI data controls: https://developers.openai.com/api/docs/guides/your-data
- Existing `docs/assignment-005/OWNER-PILOT.md` and `docs/design-coach/GOLD_STANDARD.md`
