# Design-coach-first studio: implementation and evidence

## Current DEV integration — source addition, November 20, 2026 (America/New_York)

The [isolated DEV workbench](../development/DEV-WORKBENCH.md) can exercise the same conversation and dictation product paths using an operator-confirmed adult's synthetic content. Its app/gateway validate Google's signed IAP assertion against the exact app-service audience and adult subject/email allowlist. A separate DEV project, private coach service and exact gateway service-account caller/audience preserve the keyless browser/gateway boundary. Production defaults remain unchanged; the historical implementation record below is not a claim about current deployment.

Actual Adult-profile requests retain their operator permit, passphrase-backed session, cookie and tab proof. Synthetic child-style requests require a server-only test grant bound to the current DEV policy, synthetic family, trusted device and hashed adult identity for at most one hour. The gateway checks that original grant before admitting and after completing coach/speech work, and partitions receipts/cache by the grant ID. A renewed grant cannot recover a previously authorized reply or transcript after expiry/revocation. No guardian consent, child coach consent or provider ZDR approval is manufactured for this route. It validates adult-operated product behavior, not real-child processing or child-policy acceptance.

Generation, model coaching and speech share a durable maximum-cost admission counter (the manifest example is **$5 total**) in addition to existing family/per-call limits, with only one paid operation active at once. Failed, canceled or uncertain work does not refund the admitted maximum, and monthly rollover does not reset it. Unresolved running reservations require explicit reconciliation; no automatic replay of uncertain paid POSTs is added. This bound excludes infrastructure billing and does not replace provider/privacy/safeguarding approvals or reviewed prices.

The focused DEV suites use signed identity and provider fixtures. Live IAP/routing, provider billing, ordinary adult enrollment/unlock and actual-browser microphone/preview acceptance remain outstanding. Coaching quality, authorship, explicit Send/Build/Keep, and the [gold-standard product requirements](GOLD_STANDARD.md) are unchanged. No educational or child-playtest outcome follows from these fixtures.

## Historical scope — original PR18 studio

This extends PR #18's review-only `?studio=1` studio. No merge, Pages deployment, account changes, new secrets, funded API invocation or worker-security modification is authorized by this implementation. Existing games and math algorithms are unchanged.

The governing product specification is `GOLD_STANDARD.md`. Its accepted conversation principles are requirements, not a claim of validated educational efficacy.

## Implemented
- Play-first native games; progressive design controls; no duplicate visible game cards merely for playing a starter.
- Persistent design intention, stated friction, child/helper attribution, optional predictions, grounded observations and notes.
- Typed discussion, inspiration, explanation, reflection and explicit-build paths. Known local commands create previews; unknown messages can be discussed without a build. The child can choose Try, ask for ideas, or skip.
- Independent A/B/C tests, explicit continuation, conflict-checked combination of local tests from a common baseline, earlier-test preservation, deliberate main-version promotion and independent save-as-new.
- Construction snapshots retained through previews and forks. Action games currently stop when design tools open and restart the round on resume; do not advertise universal mid-frame resumability.
- Game plan for fun/action/goal/recovery/scoring/style/progression/special rules, with explicit none/delegation. Live model may organize exact child quotes; inferred or invented preferences cannot be recorded as child-authored facts. The first build requires a chosen plan.
- Real provider-independent server coach contract and metered OpenAI Responses transport, strict schema, plain-text rendering, input/output moderation, factual evidence references, refusal/failure recovery, timeout, authentication/Origin/CSRF and shared family-ledger reservation/settlement.
- Existing AI build path remains separate. Coach outputs cannot execute code, change settings, publish, pick the winning version or promote a test.
- The offline helper is explicitly labeled a limited local reflection aid, NOT an LLM or the gold-standard coaching experience.

## Runtime boundaries still open
- No live inference or real-family session evaluation was run in this update. Fixture tests prove transport/state behavior, not pedagogical conversation quality.
- Model-backed interaction is disabled unless all owner approval flags, current prices, approved model, secure API key, existing family session and funded allowance are configured. No configuration or credentials have been supplied here.
- Under-13 data use requires operational review of OpenAI's current under-18 guidance, including applicable ZDR requirements, plus child-safe policies, disclosure and safety escalation. `store:false` and a checkbox are NOT proof of ZDR. Never activate just because unit tests pass.
- Cross-device studio conversations, full remote version DAG comparison/redo, arbitrary remote experiment merging, voice/drawing input to the coach and general action-game mid-round snapshots are not completed by this patch.
- Parent data deletion/retention is an operational gate. Private coach idempotency receipts have a finite cap; no silent pruning. Failed or indeterminate provider calls settle conservatively. A terminated process can leave a reservation requiring administrator reconciliation. These controls are not an absolute provider/cloud spending cap.
- Local profiles are convenience scoping, not a secure parental login on a shared browser. Do not put transcripts or real child observations into the public repo or Actions artifacts.

## Commands and evidence distinctions
`npm test` includes the original regressions, studio tests, and new `test:coach` suite.

- `tests/design-coach-unit.ts`: storage/provenance/plan/experiment invariants, bounded fallback, model contract, moderation, quotas, idempotency and refusal fixtures.
- `tests/design-coach-http.ts`: authenticated HTTP boundary, Origin/CSRF, private response headers, limits and no build-side effects.
- `tests/design-coach-browser.cjs`: production-dist desktop/mobile journeys, independent experiments, combination, explicit promotion, state/notes reload, profile separation, optional coaching and offline honesty.
- Production browser tests normally use an actual HTTP-served Vite build. In a review environment with blocked browser networking, explicit `COACH_INLINE_REVIEW=1 CI='' CHROMIUM_PATH=/usr/bin/chromium` injects only the trusted compiled app and memory-storage fixtures into a page. This is local UI evidence, NOT origin/security/service-worker/persistent-browser or live-model evidence. CI must use the default HTTP path; it never enables this fallback automatically.

## Conversational quality evaluation (mandatory before live release)
Use only synthetic or properly consented/minimized data. Evaluate the scenarios in `evaluation-cases.json` with an approved model and privacy-safe test environment. Review both the full transcript and the resulting game experiment. A single exact expected phrase is not an acceptable rubric.

For each scenario score 0/1/2 on: child ownership, game-design relevance, appropriate level of help, evidence honesty, brevity/interruptions, preservation of alternatives, and useful next action. Any unsafe disclosure, invented gameplay evidence, silent build/promotion, forced questionnaire, diagnosis/trait label, or ignored skip is a blocking failure regardless of score.

A benchmark aiming interaction passes when the coach helps the child examine the control demand and own a chosen alternative. It does not pass merely because the model says “shield.” Never tune the evaluation to force a predetermined answer.

After synthetic review, short voluntary child play sessions should examine whether the child can express intention, adapt or invent an idea, observe outcomes and choose a version. Do not optimize for time-on-site, questionnaire completion, dependency on the helper or number of paid calls. Do not claim a critical-thinking curriculum is validated from passing these tests.

## Activation inputs (not configured by this PR)
`FACTORY_COACH_APPROVED`, `FACTORY_COACH_PRIVACY_APPROVED`, `FACTORY_COACH_SAFEGUARDS_APPROVED`, `FACTORY_COACH_MODEL`, `FACTORY_COACH_API_KEY`, `FACTORY_COACH_INPUT_CHARS`, `FACTORY_COACH_OUTPUT_TOKENS`, `FACTORY_COACH_MAX_MICRO_USD`, `FACTORY_COACH_INPUT_PRICE`, `FACTORY_COACH_OUTPUT_PRICE`, `FACTORY_COACH_PRICES_REVIEWED`.

Prices are integer micro-USD per million tokens and must have been owner-reviewed within 31 days. The coach API key belongs in a private server secret, never `VITE_*` or static JSON. The existing family ledger must authorize paid use; coach and builder share its usage accounting. Endpoint: authenticated `POST /v1/coach`, read-only availability `GET /v1/coach/status`. Source code is implemented; none of these endpoints are claimed deployed.

## Sources for implementation safeguards
- OpenAI under-18 guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- Data controls: https://developers.openai.com/api/docs/guides/your-data
- Responses structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Approval of the project's educational direction comes from the owner conversation, not the API documentation.
