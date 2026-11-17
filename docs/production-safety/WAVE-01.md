# Wave 01: child-safe production policy foundation (S00 + S01)

**Status:** Implementation for review, not production approval. Source pin = this PR head. No cloud deployment, billable provider call, parent consent, legal approval, or changed production policy is represented as completed.

## Child-product nonregression contract

- Keep curated games, offline/local play, original assets, child revisions, physics, math, Language Arts, drawings, and the trusted learning host working as they did before this change.
- Do not gate gameplay frames, math questions, or local experiment edits on a remote policy read.
- Never treat an error in consent, safety, identity, moderation, provider or policy as a child's incorrect learning answer.
- Do not alter parental grade/subject choices or automatically promote a game version.
- Under a cloud pause, leave the last working local game available. Online new builds and server previews may be unavailable. The child should see a short, neutral message rather than a fake build or an unsafe fallback.
- Never enable user-to-user communication, public publishing, crowdsourced favorites, behavioral ads or child checkout. These have no release-capable flag in policy v1.

## What Wave 01 actually implements

1. **Strict safety-policy v1 schema** in `server/policy/contract.ts`: exact capability keys; unknown fields fail; version/scope/epoch/time validation; automatic expiry within 30 days of the written policy; no client-supplied enablement. Only `cloud_generation` and `private_preview` can be turned on with an explicitly approved owner-pilot policy. The other eight are hard-locked false in v1. `emergencyStop` overrides all active flags.
2. **Server-only decision maker** in `server/policy/guard.ts`: each sensitive request reads the authoritative policy without an optimistic cache. Missing, unreadable, expired or corrupt documents deny. The accepted policy epoch is returned to associate newly queued jobs with a specific authorization era.
3. **Shared managed-service source**: both gateway and preview service read `factorySafetyPolicies/{workspace}` through the Firestore server SDK. Do not grant access to this collection through browser Firestore rules. The current FileRepository/local test path receives a deny-only reader from the production gateway.
4. **Request enforcement**: cloud submissions, retries and base registration require `cloud_generation`; private revisions/listing, preview URLs, keep/undo/fork require `private_preview`; session redemption requires cloud generation; cloud coach is hard-disabled in this policy version. Job status and authenticated cancellation remain available so stopping work does not trap a child.
5. **Asynchronous enforcement**: the private Action coordinator rechecks policy before dispatch, worker claim and report. It fails queued/in-flight jobs on stop or epoch mismatch; old callbacks cannot generate a new accepted revision. Policy failure returns an opaque code without echoing any child prompt.
6. **Operator-only stop**: `npm run safety:stop -- --project=PROJECT --workspace=WORKSPACE --reason=INCIDENT_CODE` is a dry run. An explicitly authorized operator adds `--execute` to atomically write a deny-all policy and increment the epoch. There is intentionally no corresponding resume command. A stop does not require publishing new source.
7. **Negative unit/API tests** test strict schema, locked features, failed reads, job epoch invalidation, preview request denial, and stop-only CLI validation. No provider key or real child's data is used.

### Capability register

| Capability | v1 mode | Child/product consequence |
| --- | --- | --- |
| Local curated/offline play | Local, independent of cloud | Remains playable during outage |
| Local math/Language Arts and native game host | Local, independent of cloud | Never interrupted by policy fetch |
| `cloud_generation` | Owner-pilot policy + existing paid approval | Gated new build, base registration, retry, worker |
| `private_preview` | Owner-pilot policy | Gated private revision reads, Keep and preview |
| `cloud_coach` | Hard denied | Existing local design coach continues; remote model stays off |
| `remote_vision` | Hard denied | Local drawing decomposition continues |
| `new_family_enrollment` | Hard denied | Only existing owner invitation path remains, gated |
| `public_sharing` | Hard denied | No public galleries or publication |
| `messaging` | Hard denied | No child-to-child chat |
| `crowdsourced_favorites` | Hard denied | Six developer-curated games are allowed |
| `behavioral_ads` | Hard denied | No targeting of children |
| `child_checkout` | Hard denied | No purchases inside child experience |

### Data/processor map (current system, NOT a privacy approval)

| Location/process | Potential child data | Existing boundary | Remaining P0 dependency |
| --- | --- | --- | --- |
| Browser profiles, math history, notebook | Nicknames, approximate age/grade, attempts, ideas | Local storage and per-profile UI | Parent identity, local-device safeguards, rights and retention |
| Browser drawing library | Images and processed parts | IndexedDB, local-only current drawing path | Remote-vision prohibition; later consent and image safety |
| Gateway Jobs/Revisions | Child-written prompt, private game content, usage | Family-scoped server session and API | Real multi-family authorization, data lifecycle, minimization |
| Firestore / optional Cloud Storage | Jobs, revisions, audit, artifacts | IAM-only owner-pilot workspace | S02/S03 isolation; S04 retention/deletion |
| GitHub Actions private worker | Build input and generated source | Reviewed signed workflow, restricted credential stages | Provider ZDR, release chain, content safety, privacy log proof |
| Cloud AI Responses adapter | Prompt/game source when activated | Separate secret stage, `store:false` | S05 provider ZDR and contractual verification; S06 moderation |
| Preview Cloud Run origin | Private saved game title/runtime | Separate origin/CSP/signed URL | S07 remove capability from URL queries; revocation/egress audit |
| Operations/build artifacts | Synthetic tests and possibly runtime metadata | Private runner controls | S04/S09 audit retention and no child data in logs |

**Important:** A `store:false` model request is not proof of Zero Data Retention. No new cloud child-data processing is authorized by this PR.

### Route boundary inventory

| Boundary | Policy enforcement in production gateway |
| --- | --- |
| `POST /v1/sessions` | Owner-pilot cloud-generation gate, then existing invitation checks |
| `POST /v1/revisions`, `POST /v1/jobs` | Cloud-generation gate before JSON request body |
| `POST /v1/jobs/{id}/retry` | Cloud-generation gate and current epoch for new job |
| `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/cancel` | Existing session/family checks; status and cancellation survive stop |
| `GET /v1/revisions/{id}`, `GET /v1/creations` | Private-preview gate |
| `GET /v1/revisions/{id}/preview` | Private-preview gate before minting capability |
| `POST /v1/revisions/{id}/keep|undo|fork` | Private-preview gate before persistence |
| `GET /preview/{id}` on separate host | Private-preview gate before artifact lookup and rendering |
| `/v1/worker/jobs/{id}/claim|report` | Cloud-generation policy + epoch validation in coordinator |
| `/v1/internal/dispatch` | Existing scheduler OIDC and coordinator policy check |
| `/v1/coach` | Model coach hard-denied by policy v1; local coach unaffected |
| `/health` | Existing liveness/readiness; never a substitute for policy authorization |

There are existing direct service/HTTP test harnesses which construct handlers without a policy for historical synthetic tests; these are not runtime entry points. The shipped `createGateway` and preview `main` install the authoritative reader. S11 must independently verify there is no alternate deployed entry point.

## P0 incident priorities / failure behavior

- **P0 privacy exposure or family-crossing access**: stop affected cloud operations, revoke sessions/capabilities under S02–S04 (pending), preserve restricted non-content evidence, follow applicable incident escalation.
- **P0 untrusted code breakout / network access**: stop generation and preview, terminate worker pipeline, investigate immutable image and isolation under S07.
- **P0 sexual exploitation or grooming content, public stranger communication, unauthorized child payments**: hard-lock these capabilities now; S06 and later legal incident workflows are necessary for content itself.
- **P0 inability to honor deletion or consent revocation**: public registration remains prohibited until S02–S04 are complete.
- **P1 wrong instructional mastery, inaccessible/overwhelming content, lost versions**: preserve old version and accurate learning state; education/child-device validation is separate from safety policy.

Never log raw child text, screenshots, credentials, preview capability URLs or provider payloads to ordinary incident tickets or public GitHub artifacts.

## Operator stop procedure

1. Confirm the exact GCP project and workspace from current approved private configuration. Use the ordinary authenticated operator account with explicit Firestore write rights; do not grant broad IAM to the public app or runner.
2. Execute the dry run first, supplying only a non-sensitive uppercase reason code. It performs no cloud write.
3. If an emergency stop is authorized, execute the same command with `--execute`. Confirm it exits successfully; a failure does **not** mean the service stopped.
4. Verify from an authorized test identity that new cloud jobs return `SAFETY_POLICY_BLOCKED`, private previews are inaccessible and a queued worker cannot report ready. Confirm the static/local arcade remains playable.
5. Track emergency action and incident handling in an access-restricted operator record. This tool only stores the deny-all policy document; S09 will add formal audit/incident workflows.
6. Re-enablement requires separately reviewed policy update and all prerequisite legal/security/provider approvals. **Do not manually flip flags to make a demo work.**

Emergency policy stored at `factorySafetyPolicies/{workspace}` has `version=1, scope='owner_pilot', epoch, updatedAt, expiresAt, emergencyStop, capabilities` with every capability boolean present. Public registration cannot be enabled through this schema. All values are server-owned; no client endpoint writes the policy.

## Important limitations and next-wave blockers

- **No parental consent or verification is implemented here.** The existing invitation session is not COPPA consent.
- **No real multi-family isolation**: existing root workspace and family-bound checks are owner-pilot-only. S02/S03 must replace/strengthen this before admitting unrelated families.
- **No data removal/retention guarantee**: S04 must implement revocation, resource tombstones, deletion, backup rules and delayed callback tests.
- **No provider ZDR or child-content approval**: S05/S06 remain launch blockers. A policy flag by itself is never sufficient to activate child AI processing.
- **Current signed preview URLs contain capabilities in query parameters**: S07 must harden this and prove logs cannot leak access.
- **Race boundary**: independent Firestore policy reads and workspace writes cannot be one serializable authorization transaction in this owner-pilot design. Epoch checks prevent late job completion after an observed stop, and preview/access checks deny during a stop; S03/S04 must introduce transactional revocation/tombstones across tenant-scoped records. Do not claim mathematically instantaneous global cancellation from this wave alone.
- **Operator duty**: an emergency stop requires a successful Firestore write and healthy policy-reader connectivity; while Firestore fails reads, protected actions fail closed. Existing already-running external provider calls might consume previously approved credits, so S08/S09 must add operational provider/worker cancellation.
- **No on-call, monitoring, independent penetration test, actual-child playtest, security certification or legal release signoff is claimed here.**

## Merge/activation discipline

Review in a **draft PR** on its own safety branch. Require clean typecheck, unit tests, all browser/learning/creative regressions, source review, and explicit operator stop test in staging before production activation. Merging does not activate paid AI or change Cloud Run configuration. Do not dispatch a live paid model, publish Pages, change secrets/IAM or modify existing release tags as part of this PR.

Next packages: S02 adult identity/verified consent; S03 tenant repository; S04 deletion; S05 verified provider processing; S06 child-content safety; S07 hardened preview; S08 abuse and budgets; S09 incident operations; S10 parent-facing notice; S11 real production release acceptance.
