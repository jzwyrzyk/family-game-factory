# Autonomous operational investigation

The `github_operations.py --run-id` path now retrieves and verifies the exact
workflow/repository/main source/attempt/scope, artifact SHA256 and bounded single-file
report before invoking this classifier. Dispatch is fixed to the existing diagnostic
workflow and protected main; it never retries uncertain submissions. The live GitHub
metadata observation in run 45764873156 succeeded, but PR153 request evidence and
recent 401 attribution remain unqualified. See [executable setup](PERMANENT_CLOUD_SETUP.md).


Use the existing Actions workflows, sanitized PR153 request evidence, immutable
release/deployment receipts and exact-source test artifacts. Routine investigation
and source fixes are authorized; release, privilege expansion, funded requests and
recurring execution retain their specific approval gates. Setup prerequisites and
current blockers are in [the consolidated plan](PERMANENT_CLOUD_SETUP.md).

## Investigation loop

1. State a bounded question: service/revision, settled UTC interval <=1 hour, observed
   status/route and report provenance. Retrieve the latest **executed** diagnostic
   run and inspect newer failures/skips separately. Verify run, attempt, source,
   artifact SHA-256, sole regular `report.json` member and strict existing schema.
   A stale run, expired artifact or inaccessible source is an evidence gap.
2. Run `python3 scripts/ops/triage_request_evidence.py /private/path/report.json`.
   It revalidates closed fields, rows and counts; groups by actual revision/route/
   method/status; distinguishes authentication, authorization, preflight and server
   errors; and never equates HTTP completion with user-visible acceptance. It makes
   no network request, changes no authentication and cannot initiate a rollback.
   Incomplete observed rows are lower bounds; empty incomplete results prove no zero.
3. Join the request's **actual revision** to the sanitized metadata observer and
   deployment receipt. Record revision -> immutable image -> exact application/source
   tree -> workflow/build/rollback receipt. A latest-ready revision need not have
   served the request. A revision's 20-character suffix is not an application commit.
   Trace-level joins require separately reviewed sanitized correlation support;
   matching times alone establish temporal association.
4. Compare the serving source to its predecessor using the relevant paths. Reproduce
   in an isolated checkout with synthetic sessions, storage and provider fixtures.
   Distinguish missing browser credentials, forbidden profile state, application
   exceptions, provider availability and infrastructure/authentication failures.
   Preserve uncertain paid request IDs and receipts; never replay a paid POST.
5. Develop the smallest defect fix and a causal regression test. Use the existing
   `test:ops`, auth/security, storage, environment or release suite appropriate to the
   path. A passing fixture is not production/device acceptance. Keep changes isolated
   from the learning, creative and CI integration candidates and frozen release pins.
6. Publish a reviewable PR with source, evidence, limits and updated delivery state.
   After authorized integration, use existing DEV/TEST and release controllers with
   their exact-artifact acceptance gates. Record live verification separately.

This loop is ready as source/runbook, but unattended production investigation is
not accepted end to end. The owner reports separate-task SDK identity/metadata and
finite permission checks succeeded under alias `GCP`; this task still lacks its
attachment and the GitHub broker evidence remains unavailable. The
current connector can retrieve Actions evidence; workflow dispatch/settings require
a suitably authorized existing client or the manual Actions page. Do not add a broad
personal token merely to bypass that capability gap.

## Recent Gateway 401 investigation

Observed evidence supplied by the owner: repeated Gateway HTTP 401 and OPTIONS 204;
no matching historical canary or recent 5xx returned by the bounded owner queries.
The exact recent routes, intervals, serving revision, reason codes and authenticated
session state are not available here. Those results cannot establish the cause of
401s or prove universal absence of 5xx.

At frozen source `bc602f1ede502f398308ad56f973c4bf7997ff08`:

| Candidate cause | Implemented behavior and safe discriminator |
| --- | --- |
| Expected unauthenticated session | `server/pipeline/auth.ts` and `server/trusted-devices.ts` reject absent/invalid session credentials. Coach handler maps `UNAUTHENTICATED` to 401. Check the sanitized route and a synthetic signed-out journey. |
| Expiry or revocation | `verifyBrowserSession` verifies expiry and live device state. Trusted device renewal can deny missing, mismatched, expired or revoked credentials. Reproduce expiry/renewal with synthetic timestamps; inspect renewal outcome without exposing cookies. |
| Enrollment or parent access | Invalid invitation/parent access maps to 403 in the trusted-device handler. A not-yet-enrolled browser can later produce 401 on a protected status route. Distinguish the actual route and existing fixed error code. |
| Profile/guardian state | Coach maps adult/learner/settings/parent-guidance/guardian-consent denials to 403. These checks do not explain a known 401 by themselves; stale base sessions can fail earlier. |
| Browser configuration | Household cookies use Secure/HttpOnly/SameSite=None/Partitioned; first-party beta adapts the names/path/SameSite. Missing credential transport, cookie scope or renewal may produce 401. Wrong Origin maps to FORBIDDEN/403 on these handlers. Check presence/booleans, not cookie/token values, in synthetic Chromium/WebKit journeys. |
| Application or upstream defect | Coach has its own error mapping, and upstream authentication can also fail. Attribute serving source, safe reason and path before concluding. Do not turn every denial into a crash or suppress a genuine regression. |
| OPTIONS 204 | The permitted handler returns 204 before session validation. It verifies preflight handling, not the subsequent authenticated POST. |

These are **source-backed hypotheses**, not a live root-cause diagnosis. The deployed
image must be mapped to its exact source before treating current-main behavior as
production behavior. No authentication behavior was changed by this work. Focused
Node 22 tests for trusted devices, session client, adult profile authentication and
private Coach passed **29/29** using synthetic fixtures.

## Successful Coach evidence and limits

Owner-supplied production observations received November 26:

- Gateway Coach POST: HTTP 200 at **2026-11-24T14:47:26.454968Z**.
- Private Coach POST `/v1/private-coach/complete`: HTTP 200 at
  **2026-11-24T14:47:26.650244Z**, revision
  `factory-coach-private-r-890188092e3f4396dab0`.

These temporally correlated observations establish successful post-deployment HTTP
handling across both services. The exact Gateway serving revision, trace-level
correlation and actual user-visible response acceptance remain unverified. No paid
request was replayed and no rollback is indicated or initiated on this evidence.

## Evidence extensions and privacy

| Signal | Available boundary and next scoped improvement |
| --- | --- |
| Operational error codes | Existing fixed HTTP `errorCode` values are useful in private synthetic browser diagnostics. PR153 platform-request reports intentionally contain no body/reason/trace field. A future enum-only operational event needs review of each field and a separate narrow source; do not loosen its view to application payloads. |
| Cloud Build | Existing publication receipts and build status bind source/build/image. Current Codex role cannot inspect arbitrary build logs. Use existing operator/Actions summaries; propose build-metadata-only access if a proven diagnostic gap requires it. Raw build output may contain credentials or arbitrary source text. |
| Worker failure | Use private worker run/job/attempt, immutable workflow/source pin, sandbox identity and sanitized terminal codes. Public request evidence cannot determine a worker exception. Keep private workflow logs and provider details private; uncertain paid completion needs receipt reconciliation, never blind rerun. |
| Deployment failure | Existing `observe` mode reads three-service traffic/revision/lifecycle metadata. Compare expected image, source and reconciliation states. Ready or successful CI does not prove product acceptance. No new release controller or automatic rollback is introduced. |
| Browser failure | Local synthetic Chromium/WebKit console/network checks can capture fixed categories, status, canonical route and browser version. Do not upload real-family HARs, screenshots, storage, URLs, headers or transcripts to public artifacts. Real-device evidence stays separate. |
| PostHog | Connected project 753635 is named “Default project”; metadata reports `completed_snippet_onboarding:false` and `ingested_event:false`. Its Jems identity is not established. PR83 is open/unmerged and describes an opt-in aggregate usage pilot with no browser SDK, autocapture or session replay. No live Jems error ingestion is verified. The installed PostHog triage skill supports aggregate error issue investigation, but do not enable collection, fetch private event examples/replays or add generic automatic exception capture under this task. |

Only enum codes, canonical routes, service/revision/image/source identities, UTC
bounds, HTTP status and reviewed aggregate counts belong in public evidence.
Prompts, tokens, headers, secret values, family/profile/device identifiers, arbitrary
URLs, exception messages and raw request payloads stay out. Add no diagnostic event
that changes consent, privacy, spending or application authentication implicitly.
