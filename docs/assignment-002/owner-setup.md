# Account-owner setup checklist — required before real operation

**No item below has been executed for the owner. Do not activate paid work just to make a demo look live.** The static website and all existing games/data remain usable while the builder is unavailable.

## 1. Review/approve code and costs

- [ ] Review this PR, [audit](audit.md), [cost estimate](cost-estimate.md), [agent research](agent-research.md) and [evidence](evidence.md). Merge only after owner review; this task does not merge.
- [ ] Choose/verify an accessible model in the owner's OpenAI API project, its structured-output support and current rates. The example is GPT-5.4 mini, not a subscription entitlement.
- [ ] Approve maximum per-job model cost, monthly allowance, two repair attempts, provider data policy/retention, child-data consent, region, deletion/retention and infrastructure ceiling.
- [ ] Verify unattended Codex account entitlement independently if desired. Without it, use the implemented metered Responses adapter in Actions. Do not use the ChatGPT connector, personal browser session or a personal GitHub PAT as a website coding API.

## 2. GitHub trust and runner

- [ ] Install a **server-owned GitHub App** on only `jzwyrzyk/family-game-factory` with Actions **write**, Contents **read**, Metadata read. Record numeric App ID, installation ID and repository ID (`1458033181`). Keep its private key in the gateway's private Secret Manager configuration, never in the website.
- [ ] After review/merge, record the exact approved main commit SHA. Create a lightweight tag `factory-worker-<that SHA>` at the reviewed commit. Protect tag creation, updates and deletion so only the owner can authorize one; the GitHub App cannot write tags. Gateway dispatch uses this immutable tag and verifies its target, avoiding the mutable-main check/dispatch race. Future worker updates require a new reviewed SHA/tag and explicit configuration update.
- [ ] Create environments `factory-generation` and `factory-sandbox`, restricted to the **exact approved worker tag**, not a wildcard or arbitrary branch. Do not configure required manual approval on every run, since children must not need an adult per change. Initial setup remains owner-controlled.
- [ ] Put `FACTORY_OPENAI_API_KEY` only in the **factory-generation environment** secret. It is passed only to the non-executing generation step. Do not put it in repository-wide environments, Vite variables, npm config, generated files, test steps or the sandbox runner.
- [ ] Configure a dedicated **ephemeral** Linux runner labeled `factory-isolated`, with Docker, gVisor registered as `runsc`, at least 20 GiB available disk, and an overlay-capable storage driver. Restrict it to trusted reviewed-tag workflow dispatches, not untrusted PRs/forks. Give it no family sessions, GitHub App key, model key, cloud service account/metadata access or mounted host credentials. Workflow OIDC is limited to the reviewed repository/workflow/SHA/environment and claimed job.
- [ ] Build `server/sandbox/Dockerfile` from the reviewed commit. Do not inject credentials into the image. If a development proxy CA is needed, use a build secret; never disable TLS checks or bake the CA/secret into layers.

```sh
# On the approved runner, not this task's small VFS environment:
docker build -f server/sandbox/Dockerfile -t factory-sandbox:reviewed .
docker image inspect factory-sandbox:reviewed --format '{{.Id}}'
# Set FACTORY_TEST_SANDBOX_IMAGE to that immutable sha256 ID, or an approved repo@sha256 digest.
npm run test:sandbox
```

- [ ] Require both fixture games, hostile source rejection and the complete browser-container smoke to pass on that runner **before** activation. Review image contents/SBOM; set repository variable `FACTORY_SANDBOX_IMAGE` to its immutable digest and preload it (`--pull=never` is enforced). No runc or host fallback is permitted.
- [ ] Set repository variable `FACTORY_WORKER_SHA` to the approved commit and `FACTORY_GATEWAY_URL` (HTTPS origin only) and, only after all gates pass, `FACTORY_ACTIONS_APPROVED=true`. Do not dispatch a worker with prompts, source, credentials or preview URLs in inputs; the workflow accepts only opaque `job_id` and attempt.

## 3. Authorize GCP resources (billable; owner action)

- [ ] Explicitly authorize billing and create/select a GCP project/region. Enable only required APIs: Cloud Run, Firestore, Secret Manager, Cloud Scheduler, and an image registry if images are hosted there. No resources are created by this PR.
- [ ] Create a private Firestore database/workspace. Browser/Firebase rules must deny all direct draft reads/writes; server identities use IAM. Gateway gets only needed database read/write. Preview gets read-only access. Do not grant the runner database access; it uses job-scoped gateway callbacks.
- [ ] Build/deploy two separate services from `server/Dockerfile.gateway` and `server/Dockerfile.preview`, with different HTTPS hostnames. Generated code is never served from the app/API origin. Preview has no GitHub App key, family-session signing key or model credential—only read-only persistence and its preview verification secret.
- [ ] Store private configuration as Secret Manager files and mount the path in `FACTORY_PRIVATE_CONFIG`. Do not copy them into images or GitHub. Set `PORT` only as required by Cloud Run. Use workload identity/ADC for the gateway/preview database permissions; never download service-account keys to the frontend.
- [ ] Configure request-billed Cloud Run, low maximum instance counts, explicit memory/timeouts, quotas/abuse protection and billing alerts. Public HTTPS transport is needed for browser and signed-capability requests; application routes still authenticate every family/worker action. Add edge rate limiting to the invitation endpoint before public use.
- [ ] Configure a one-minute Cloud Scheduler **POST** to `<gateway>/v1/internal/dispatch` using its own service-account OIDC token, with audience exactly `<gateway origin>`. Put that account email in `schedulerEmail`. This supplies durable retry/expiry without an always-on billing loop. Workers are otherwise dispatched directly on enqueue/repair callbacks.
- [ ] Configure log retention/scrubbing: no prompts, source, tokens, signing keys, cookies or capability URLs in access logs/CI logs. Preview capability query strings require particular care in proxy/load-balancer logs. Do not upload source/compiled artifacts to public Actions artifacts; private Firestore stores this bounded POC's artifacts.

## 4. Private configuration and authentication

Start with `active:false`. Use a private JSON file (outside the repository) with these fields; all placeholder values must be replaced deliberately:

```json
{
  "active": false,
  "appOrigin": "https://jzwyrzyk.github.io",
  "gatewayOrigin": "https://YOUR-PRIVATE-GATEWAY",
  "previewOrigin": "https://YOUR-SEPARATE-PREVIEW-HOST",
  "sessionKey": "GENERATE-A-STRONG-PRIVATE-SIGNING-KEY",
  "previewKey": "GENERATE-A-DIFFERENT-PRIVATE-SIGNING-KEY",
  "familyId": "family-001",
  "repository": "jzwyrzyk/family-game-factory",
  "repositoryId": "1458033181",
  "workflow": "factory-agent.yml",
  "approvedSha": "REVIEWED-MERGED-MAIN-COMMIT-40-HEX-CHARACTERS",
  "githubAppId": "NUMERIC-APP-ID",
  "githubInstallationId": "NUMERIC-INSTALLATION-ID",
  "githubPrivateKey": "PRIVATE-PEM-FROM-SECRET-MANAGER",
  "approval": {
    "enabled": false,
    "approvalId": "OWNER-REVIEW-REFERENCE",
    "model": "gpt-5.4-mini",
    "inputUsdPerMillion": 0.75,
    "outputUsdPerMillion": 4.5,
    "maxInputTokens": 24000,
    "maxOutputTokens": 4000,
    "reasoningEffort": "low",
    "priceReviewedOn": "YYYY-MM-DD"
  },
  "maxJobMicroUsd": 120000,
  "workspace": "family-001",
  "projectId": "YOUR-GCP-PROJECT",
  "schedulerEmail": "YOUR-SCHEDULER-SERVICE-ACCOUNT"
}
```

`appOrigin` is an origin, not a URL path. The Pages app stays at `/family-game-factory/`. Do not change that origin or clear site data: original progress remains in the existing browser key.

The preview service receives a **different**, smaller private file containing only `previewOrigin`, `previewKey`, `workspace`, `projectId`. Its identity cannot read the gateway secret. Never include `localFile` for Cloud Run: ephemeral storage is rejected; Firestore is required.

- [ ] On a trusted owner machine with authorized ADC, run `FACTORY_PRIVATE_CONFIG=/private/path/config.json npm run setup:owner -- 5000000` for the reviewed $5 allowance. This command is forbidden in GitHub Actions and prints a single-use 10-minute invitation to that private terminal. Do not paste it into ChatGPT, issues, logs or commits.
- [ ] After completing all gates, set both `active:true` and `approval.enabled:true`, with a fresh price review. Re-run the owner allowance setup intentionally to enable paid admission. Rates older than 31 days stop calls until reviewed.
- [ ] Set public **nonsecret** `factory-config.json` to `{ "version":1, "mode":"remote", "apiBaseUrl":"<gateway origin>", "previewOrigin":"<preview origin>" }` through an owner-reviewed source change. No credentials belong in that file.
- [ ] In the website's Grown-ups page, enter the one-time invitation into Connect workshop. It establishes a scoped HttpOnly/Secure/SameSite=None/**Partitioned** session. This permits Chrome cross-site Pages→gateway use without exposing the cookie to JavaScript. Verify CHIPS support in target browsers; other browsers may need a reviewed same-site custom-domain arrangement. No per-change parent approval is required after this setup. Cookie expiry requires reconnection, not lost game data.

## 5. Controlled real-agent smoke and acceptance

- [ ] Authorize the exact provider project/model, HTTPS gateway/preview destinations and a small live smoke budget. No arbitrary cookie-egress test is included. Authenticate using the real website/session; do not export personal cookies or keys to an unverified script.
- [ ] Create one new idea in the original website. Confirm a real opaque acknowledged job, Actions run, private generation, gVisor build/test and ready artifact. Test keyboard/touch play, win/loss/replay, five revisions, auto repair, failed-build preservation, compare/undo/fork and reload.
- [ ] Confirm no prompt/source/key in workflow inputs, logs, outputs or public artifacts. Verify wrong repository/tag/SHA/environment, foreign family and replayed callbacks are rejected. Verify the model key is absent in the test job/container and preview service.
- [ ] Confirm actual provider usage/billing, Firestore/storage growth, worker wall-time and maximum instance/runner behavior. Export/back up existing progress and review retention before inviting children.
- [ ] Only then publish the reviewed static config/build. No merge or deployment is performed automatically by this assignment.

Emergency stop: set `active:false`, set `FACTORY_ACTIONS_APPROVED=false`, disable scheduler/new dispatch, cancel active runs, revoke the environment API key/App installation credential if needed and stop the isolated runner. This stops new work; reconcile already incurred charges and in-flight jobs.
