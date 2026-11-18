# jems creation, live coaching and build truth — release gate

## Scope of PR #35

This patch implements an imagination-first creation workspace, a message/voice composer with its send action attached, a separate high-contrast **Build my game** choice, responsive layouts, narrower default tool exposure, visible acknowledged build states, read-only builder readiness, contextual limited local coaching, and optional A/B/C comparisons. It retains all existing version, math/language, learning, draft, voice privacy, and safety gates.

This patch **does not** turn on paid AI, change private worker trust, publish a site, or prove live generation. It deliberately does not bypass provider/data/privacy authorizations.

## Root causes verified in source

1. `studioTalk` uses the coach. It is not a build command. The coach's model endpoint requires a private family session and a separately approved configuration. On failure it fell back to a fixed local response with no actionable connection disclosure.
2. `studioSend` is an explicit try/build path. A new game's plan must be confirmed first. The previous UI displayed adjacent competing actions without their differences being clear.
3. Static `factory-config.json` can advertise a gateway URL despite service/ledger/worker unreadiness. Previously the Studio header only inspected URL configuration. `GET /v1/builder/status` now checks session-bound readiness; neither status endpoint creates a job.
4. `#studioMessages`, `#studioPrompt`, coaching controls and the full plan were in separate fixed or very long areas. The new CSS lets the conversation own the new-idea workspace; the advanced plan opens on explicit request.
5. The existing experiment shelf kept tests, but did not present a simple A/B/C view. Comparison now displays only saved facts and user notes, never scores/ratings inferred without play evidence.
6. Legacy builder UI also implied it was connected before any job acknowledgement. It now makes fewer connection claims and no longer presents Retry when a request never reached the server.

## Required production sequence (separately authorized)

1. Keep PR draft until CI, keyboard/mobile review, and the safety/learning regression matrix pass. Do not merge or deploy automatically.
2. Deploy the reviewed gateway with `GET /v1/builder/status` ahead of the public site, preserving all existing configuration, sessions, worker pins, service identities, budgets and stored child work. Test that expired/foreign sessions do not see private availability; check CORS and no-store behavior. The UI treats a missing endpoint as **unverified**, not failure.
3. Review existing approved private-worker execution and its trust pins. Verify actual queue acceptance, status polling and artifact preview using the authorized owner workflow. No worker/provider secrets belong in public assets or browser instrumentation.
4. The live model-backed coach is **still an independent security and product gate**. Its release documents explicitly call out under-13 privacy approvals, current model entitlement/prices, family sessions/allowances and the provider execution boundary. Do not copy a generation-worker key into the gateway to make chat work. Review the private invocation design and safeguards before any live activation.
5. Publish the public site via the deliberately manual Pages workflow with the existing canonical gateway and preview HTTPS origins; an empty URL input intentionally yields unavailable mode. Confirm static `factory-config.json` has **only public origin selectors**. The frontend can use fallback coaching while the live coach is disabled but must say so.
6. Validate each service state with real evidence: coach response vs limited fallback; model refusal; unauthenticated session; over-budget; disabled worker; accepted job ID; queued, building, repairing, testing, ready, failed and cancelled; partial connection loss and resume; preview handshake and child-controlled Keep.
7. Run desktop, narrow desktop, mobile, touch, keyboard, screen reader status announcements and reduced-motion review. Verify big CTA contrast and that no element blocks the composer.

## Child-journey acceptance

- A child starts with a blank idea: **type or tap-to-speak**, then Send next to the box; no template selection required.
- A sent idea appears in history, jems asks a useful short question. Even without an approved AI model, the limited mode asks something meaningful and identifies itself as limited.
- Chat never causes `/v1/jobs` or claims building. A build cannot start until the child explicitly chooses Build and the plan is confirmed.
- In a supported existing game, quick changes stay fast/local. Generative mechanics go through a real authorized build job rather than a fake local success.
- If the backend cannot accept a build, the child sees a specific reason if safely available and the idea survives. Never erase a later draft when an older result returns.
- When the build is accepted, show queued/building/testing/ready from durable API updates. Do not show percentage progress, completed game, or earned celebration before the real verified artifact exists.
- Advanced plan/questions/help are optional and contextual; the full plan opens only when requested or when a build requires missing choices.
- Only when a child explicitly chooses to compare multiple alternatives does A/B/C comparison appear. Recorded observations and notes are distinguished from guesses; no automatic favorite or overwrite.
- Math and English learning, pace, original games, experiments, version history, saving and undo continue to work.

## Open operational gaps

- A green CI check means the code/bundled/browser fixtures passed, **not** that an approved live conversational provider, remote worker, spend allowance, or actual production preview has been exercised.
- Production live chat is a separate integration/release step because existing owner documentation deliberately disabled gateway-side model invocation. This PR cannot safely declare it enabled.
- Across-device recovery, full remote DAG experiment merge, and controlled deterministic DOE metrics remain out of scope; tests must not claim them.
