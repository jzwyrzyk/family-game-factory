# Issue #28 — real conversational AI: architecture and release gate

> **Status reconciliation:** [PR36](https://github.com/jzwyrzyk/family-game-factory/pull/36) is merged. Draft/inactive-branch wording below describes the original review stage, not an inventory of current live services. The dedicated private-coach architecture remains the contract; [delivery state](../../DELIVERY-STATE.md) owns current audience, release scope and observed operational evidence.

**Status: implementation in draft PR #36; NO paid/live activation.**
PR #35 has already been merged. The child-facing conversation composer, voice input,
design history, one-question game plan, play/build separation and local edits are in main.

## Non-negotiable original design intent

Remove implementation friction without removing the child's creative decisions.
A child can brainstorm, joke, ask for an explanation, receive suggestions, skip
questions, speak, build only by explicit choice, and return to their playable game.
The coach cannot change a main edition, bypass Math or English learning, invent
play evidence or infer the child's intelligence/emotional state.

Reference: `docs/design-coach/GOLD_STANDARD.md` and Issue #28.

## What this code actually implements

```
Child (text or on-device speech)
  -> HTTPS Studio UI + local, per-player conversation notebook
  -> authenticated family session, Origin/CSRF controls (gateway)
  -> bounded CoachService context + exact child-quote provenance
  -> family-ledger budget reservation and idempotency
  -> keyless PrivateCoachBridge obtains Google-signed ID token from metadata
  -> exact operator-reviewed HTTPS audience
  -> dedicated private Cloud Run coach verifies service-account identity AGAIN
  -> strict context/PII limits + rate/concurrency + independent safety checks
  -> private OpenAI Responses + input/output moderation (ONLY if separately approved)
  -> schema-validated reply + verified metered usage
  -> gateway settles ledger; Studio renders the reply (never an executable game)
```

No user message, preview artifact, session token, provider credential, child name
or transcript is sent to a public GitHub issue/PR/workflow or exposed in URL paths.
The gateway's `FACTORY_COACH_API_KEY` / `FACTORY_OPENAI_API_KEY` environment
variables now cause startup failure. The gateway image excludes the private
provider and private executor modules.

## Creation reply format and host validation

The model's readiness decision and the host's evidence validation have distinct jobs. The model judges whether the child's idea describes a coherent playable first version. The host verifies exact source wording and the current saved context before Build can be enabled; selecting four evidence fields never replaces that semantic judgment or the child's explicit Build action.

The [private creation wire adapter](../../server/coach/private-creation-wire.ts) preserves the existing public `CoachContext` and `CoachReply`. Only the provider-facing representation changes when `context.creation.version` is 1:

- Exact eligible message text and accepted child-origin, nondelegated plan values become a bounded source catalog. Repeated fragments share an ID; context positions retain ordered references. Helper, reflection and unaccepted/delegated plan text remains visible as context but is ineligible for readiness evidence.
- Fragments preserve every original character, including whitespace and Unicode surrogate pairs, and fit the existing 700-UTF-16-unit evidence limit. Child wording is in the request input, not copied into JSON Schema enums. The bounded schema contains only compact source IDs.
- The schema separates positive and negative verdicts. Positive verdicts require four nonempty eligible IDs and an empty unresolved array. Negative verdicts carry empty evidence and at most eight nonblank unresolved items; general conversation may have no unresolved items. Each item is capped at 175 Unicode codepoints so it fits the host's 350-UTF-16-unit bound even when it contains astral characters.
- Only readiness evidence uses IDs. `childDecisions` retains short, literal child quotations under its existing validator. A quote for one plan field must not expand to a multi-aspect paragraph and change later correction/compilation behavior.
- The adapter rejects malformed metadata, unsupported references and contradictory positive verdicts. It restores exact evidence quotes, then the ordinary response validator runs. Unknown root keys remain visible to that validator. Missing readiness remains a failed check; there is no invented negative verdict, silent positive-to-negative downgrade or automatic inference retry.

The budget check includes the actual projected provider input and dynamic schema, along with policy, output allowance and the existing envelope reserve, before moderation or inference begins. Input privacy/moderation still receives the original validated context. Output moderation still checks the returned model text before decoding; restored evidence is drawn only from the already checked input. The current model, token ceilings, per-turn ceiling, authorization and public error responses are unchanged.

Older contexts without the creation capability keep their original provider input and public reply contract. This correction requires a private-coach image update; it does not require a new gateway/browser protocol or a notebook migration. Existing service identity, configuration, numeric secret pins and rollback safeguards remain release requirements. Fixture verification and schema constraints do not establish live conversational quality: an authenticated Adult conversation and coherent ready/not-ready behavior remain acceptance evidence.

## Private conversation diagnostics

An HTTP 503 from the private coach previously hid several distinct failures.
The private executor now emits one structured `jems_private_coach_failure`
record when an exact `POST /v1/private-coach/complete` fails. The fixed version-1
record contains only:

| Field | Meaning and boundary |
| --- | --- |
| `stage` | A fixed category for caller verification, configuration/readiness, input validation, budget, input moderation, inference, output moderation, usage or reply validation; unknown failures remain unknown. |
| `reason` | An allowlisted category, including an HTTP rejection, transport failure, output limit, invalid reply or missing creation-readiness verdict. Original exception messages are never copied. |
| `elapsedMs` | Nonnegative integer duration, bounded to one hour. |
| `providerHttpStatus` | Optional integer HTTP status from the failed provider call. Provider error bodies are not read for diagnostics. |
| `incompleteReason` | Optional `max_output_tokens`, `content_filter` or `other`; arbitrary provider text cannot enter this field. |

The record also has the fixed event name and `version:1`. No prompt, response
text, headers, URLs, child/profile/family identifier, request ID, model key,
exception object, stack or cause is logged. Errors are tagged in private process
memory; the metadata is not added to gateway/browser responses or saved
conversation receipts. Logging failures cannot change the original request
result. Successful turns, health/status probes and speech calls do not produce
this event. Existing auth, consent, deadlines, call order, spending admission,
conservative settlement, refusal behavior and explicit retry remain unchanged.

This identifies a failing step without claiming more than the evidence. For
example, an inference `http_error` with status 400 establishes a rejected API
request but does not by itself identify the invalid parameter. A private-service
503 can also result from a thrown caller-verification error before inference.
HTTP status 200 on a readiness request does not reveal the returned `available`
value and never proves a successful model reply.

Readiness failures now have separate fixed categories: `readiness_missing`,
`readiness_shape_invalid`, `readiness_evidence_invalid`,
`readiness_inconsistent`, `readiness_context_invalid` and
`readiness_reference_invalid`. The earlier diagnostic runtime grouped invalid
shape, unsupported literal evidence and inconsistent positive verdicts under
`readiness_invalid`; an old event with that reason cannot identify its subtype.
The additional categories expose no source IDs, quotes or response content.

The standalone [read-only inspector](../../scripts/deployment/inspect_coach_runtime.py)
uses the operator's existing `gcloud` identity, fixed project
`family-game-factory-jzw` and region `us-east5`. It reads only gateway/private-coach
service descriptions, their positive-traffic revision descriptions, and bounded
request-log metadata. It reports allowlisted flags/model/limits, key-reference
presence/pinning booleans, network configuration categories and recent chat/status
request results. It does not read secret contents or the mounted private JSON
configuration, call a model, mint an identity, change configuration or deploy.
Missing explicit environment values are unknown/default, not inferred false.
Run `python3 scripts/deployment/inspect_coach_runtime.py` from the reviewed source;
retain the exact source identity with the returned private operational receipt.

After the diagnostic runtime is deployed through the existing reviewed
private-coach image procedure, inspect one explicitly requested conversation.
Read `jsonPayload.event="jems_private_coach_failure"` in that service's logs and
project only the fields above. An absent event on older code is not a healthy-chat
signal. A provider/configuration correction and a successful authenticated
conversation remain separate acceptance; this diagnostic change activates
neither child AI nor another provider.

The gateway contains no provider API key. The `coachPrivateOrigin` property in
the existing privately mounted gateway configuration is **only an exact
HTTPS endpoint selector**; adding an origin alone does not enable the coach.
The client / public `factory-config.json` continues to contain only the
existing gateway and preview URL selectors.

## Approval switches (default OFF)

The gateway and private executor both require:
- `FACTORY_COACH_APPROVED=true`
- `FACTORY_COACH_PRIVACY_APPROVED=true`
- `FACTORY_COACH_SAFEGUARDS_APPROVED=true`
- `FACTORY_COACH_ZDR_VERIFIED=true`
- `FACTORY_COACH_PRIVATE_EXECUTION_APPROVED=true`
- Current, positive and bounded `FACTORY_COACH_MODEL`, `FACTORY_COACH_MAX_MICRO_USD`,
  `FACTORY_COACH_INPUT_PRICE`, `FACTORY_COACH_OUTPUT_PRICE`,
  `FACTORY_COACH_PRICES_REVIEWED`, and max-input/output limits
- A family-authorized session and sufficient already-funded family ledger
- An explicitly reviewed `coachPrivateOrigin`, **not** the OpenAI API host

The dedicated runtime additionally requires:
- `K_SERVICE=factory-coach-private` and `FACTORY_COACH_EXECUTION_ENV=dedicated-cloud-run`.
  The **inactive** container starts without any model secret and refuses paid requests.
- Exact `FACTORY_COACH_PRIVATE_AUDIENCE` and
  `FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT` for independently validated Google OIDC.
- A **new, coach-only, least-privilege OpenAI project key**, mounted from a
  pinned Secret Manager version **only after verified ZDR and pilot consent**.
  Do not move the GitHub `factory-generation` key.
- Cloud Run `internal` ingress, mandatory IAM invocation from the existing
  gateway service account and a reviewed VPC routing path. The container binds
  to `0.0.0.0:$PORT` for Cloud Run.

An environment flag is NOT proof that COPPA, ZDR, IAM or a safe network ingress
has actually been reviewed. These require independent evidence.

## Owner-approved architecture and remaining operational gates

The owner approved a **dedicated, tightly restricted private Cloud Run inference service**
with a newly scoped project key, replacing the earlier generation-environment-only
rule for **conversational inference only**. The existing worker's key, WIF/IAM pins,
service identities and image restrictions remain unchanged. This approval
is **not** evidence that OpenAI API ZDR, parental consent, a model key or
a private network route exists.

The Cloud Run service is named `factory-coach-private`; the container and offline
build/owner deployment scripts are now part of PR #36. The service is designed to
start inactive with no model secret, zero minimum instances, restricted IAM and
internal-only ingress. The existing gateway's networking must be read-only
inspected and, if necessary, separately reviewed for VPC connectivity before
we could claim real service-to-service availability.

**No GCP resource or API key has been created, moved, deployed or activated
in this code session.** CI tests the code and a local inactive container;
it is not a production paid-model acceptance.

Full new architecture, exact owner commands and rollback gates:
`docs/issue-28/CLOUD_RUN_OWNER_PLAN.md`.

## Under-13 and child-safety gates

The OpenAI Under-18 API guidance says that organizations must implement
**Zero Data Retention before processing personal data for children under 13
or the relevant digital-consent age**. A `store:false` parameter does not
establish that the organization has an applicable ZDR agreement.

Complete and record:
1. Applicable approved organization/project ZDR status and endpoint features,
   including moderation and any retention exceptions.
2. Parent notice/consent where applicable, retention/deletion procedures,
   child-access controls and privacy policy aligned with COPPA.
3. Input/output moderation, age-appropriate redirection, no persistent
   public chat/community, safe escalation for threatening/disclosing content,
   no misleading human-friend framing.
4. Data flow diagram, access logs without raw utterances, admin deletion
   capability and incident response, including restored backups.
5. A recorded model snapshot, entitlement, reviewed pricing and a maximum
   allowance. **The existing ledger is not an absolute total cloud cost cap.**

Important current distinction:
- Studio chat, draft and design records are locally stored per player on a
  device. The new **Clear chat on this device** action clears the active
  session's messages and design notes, **not** saved game versions or backups.
  A completed build/experiment may still contain child-authored text.
- The gateway caches completed response receipts for **at most 15 minutes
  after each new turn prunes completed entries**; this is opportunistic cleanup,
  not a scheduled deletion SLA, since no background worker is installed.
  A family `parent`-role session can explicitly POST the CSRF-protected
  `/v1/coach/erase` endpoint. Erasure refuses when an inference is running.
  Usage totals and non-content audit metadata remain for billing/security.
- No claim of cross-device transcript erasure is supported yet. A production
  retention/deletion plan must cover all server backups, artifacts, logs
  and restored-device copies before child-data processing is approved.

## Technical acceptance evidence required

The private handler's provider concurrency is shared by text and audio, with four slots per process by default. It may reject a request immediately when full, then independently rechecks and increments the count synchronously after the bounded body and context/audio validation, immediately before provider work. There is no queued retry. Bodies still being read, malformed input and disconnected clients do not consume a provider slot. A response disconnect is checked before admission and aborts an admitted provider's signal; the slot remains counted until that provider promise settles and the `finally` block releases it. This process-local bound supplements Cloud Run admission and the gateway's atomic spending reservation; it is not a global spending or concurrency limit across instances.

Both private JSON envelopes use the shared bounded UTF-8 reader (40,000 bytes for text and 440,000 for audio). Authenticated caller verification, schema/PII checks, provider approvals, usage validation and existing public error codes still apply. The dedicated image explicitly copies the shared reader before bundling. [HTTP transport tests](../../tests/http-json.test.ts) and [private concurrency tests](../../tests/private-coach-concurrency.test.ts) are registered in the unit suite and use synthetic streams/providers, including delayed-body races, text/audio contention, byte limits and malformed/aborted/failing-request recovery. These tests make no paid request and do not establish container, IAM, network or live-provider acceptance.

- Security unit/HTTP tests of fake/expired identity, wrong audience,
  browser Origin, CSRF, oversized/malformed input, PII, schema spoofing,
  unsafe responses, over-budget usage and no generated code or job dispatch.
- Model-backed multi-turn benchmark: "dragon sneezes spaghetti" ->
  "only if I jump" -> "actually never mind"; no build at any point.
- All 20 scenarios in `docs/design-coach/evaluation-cases.json` judged by
  a human on child ownership, relevance, help, honesty, brevity, preservation
  of alternatives, and next action. Refusals/injections and unsafe claims
  are blocking regardless of aggregate score.
- End-to-end typed and spoken conversation on actual Safari/iPadOS and
  Android Chrome tablets. Test microphone denied/pack missing/offline mode,
  interruption/stop, cross-profile switch, background build, active Math/English
  checkpoint, text and spoken reply sync, and child simply choosing to play.
- Measure median/p95 complete-turn latency, timeouts, fallback frequency,
  actual model spending and memory retention. Never claim natural latency
  from mocked provider tests.
- Private source SHA, identity, HTTPS audience, exact runtime image, secrets
  scope, rollback controls and authorized production smoke all independently
  inspected. Real build/coach verification must be separate from CI fixtures.

## Deployment order (after explicit approvals)

1. Finalize runtime threat model and credential scope. Read existing GCP,
   GitHub Actions environment, WIF and worker metadata *before* changing them.
2. Verify ZDR, child safeguards, current pricing and dedicated family allowance.
3. Build the dedicated, immutable coach image; owner-review and deploy the
   **inactive**, identity-verified `factory-coach-private` Cloud Run service.
   It must have internal ingress, no public invokers, no model key and no paid
   inference. Verify the gateway's reviewed VPC route separately.
4. Only after a verified private route, update the keyless gateway's private
   `coachPrivateOrigin` configuration, retaining existing sessions, artifacts
   and generation-worker pins. Leave all activation flags disabled.
5. Review rollback, red-team and tablet acceptance. Separately authorize
   the paid model and per-family opt-in; enable flags in a controlled pilot.
6. Run a real multi-turn, fully authorized smoke and compare the 20-case rubric.
   Revert to limited/local chat on any critical failure; do not suppress errors.
7. Only then consider production activation. The static site itself may
   be updated independently without conveying permission for paid requests.

## Authoritative references

- OpenAI Under-18 API guidance:
  https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- OpenAI API data controls and ZDR limitations:
  https://developers.openai.com/api/docs/guides/your-data
- Google Cloud Run service-to-service OIDC:
  https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- FTC COPPA Rule amendments (2025):
  https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy
- `docs/design-coach/VOICE_CONVERSATION.md`
- `docs/assignment-005/OWNER-PILOT.md`


**Credential namespace:** only `FACTORY_COACH_PRIVATE_OPENAI_API_KEY` is accepted in the newly approved dedicated coach container, from a new restricted Secret Manager version. The previous GitHub generation key named `FACTORY_OPENAI_API_KEY` must not be copied or mounted; the executor fails closed if it sees that legacy key. An inactive coach has neither key.
