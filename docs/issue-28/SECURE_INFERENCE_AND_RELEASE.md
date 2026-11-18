# Issue #28 — real conversational AI: architecture and release gate

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
  -> private generation executor verifies service-account identity AGAIN
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

The private runtime additionally requires:
- `FACTORY_COACH_EXECUTION_ENV=factory-generation`
- No Cloud Run `K_SERVICE` environment (fail closed)
- Exact `FACTORY_COACH_PRIVATE_AUDIENCE` and
  `FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT` for verified Google OIDC
- `FACTORY_OPENAI_API_KEY` **only from the owner-approved generation environment**
- A private ingress architecture with TLS and a firewall / authorization policy.
  The executable binds to loopback only; an authorized reverse proxy or private
  service is required. Merely running the script is not production hosting.

An environment flag is NOT proof that COPPA, ZDR, IAM or a safe network ingress
has actually been reviewed. These require independent evidence.

## Architectural blocker to close before activation

The existing production pilot intentionally keeps the API key in the
GitHub `factory-generation` environment; Cloud Run gateway/preview and
sandbox/test runners must remain keyless. A workflow-dispatched GitHub job
for *every* conversation turn is too slow and unpredictable for the intended
back-and-forth experience. Conversely, placing the key in a new Cloud Run service
would violate the currently accepted boundary.

**No suitable always-available, low-latency, credential-authorized private
inference host is demonstrated in the current connected repositories.**
PR #36 provides a private boundary and authenticator but does not provision
or choose that host. The owner/security review must explicitly authorize a
runtime/credential delivery design (for example a strictly isolated
factory-generation inference worker with temporary secrets in memory,
non-public ingress and reliable teardown). Do not create a new project, move
the existing key or broaden WIF/IAM permissions without that review.
Any hosting proposal needs actual p50/p95 tablet turn latency, startup cost,
operating cost and reliability evidence.

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
3. Deploy **inactive** identity-verified private executor behind non-public
   HTTPS; demonstrate that the gateway can obtain an audience-bound token
   and no browser can reach the backend.
4. Deploy keyless gateway with `coachPrivateOrigin`, retaining all existing
   credentials, sessions, artifacts and generation worker pins. Leave all
   `FACTORY_COACH_*_APPROVED` flags disabled.
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
