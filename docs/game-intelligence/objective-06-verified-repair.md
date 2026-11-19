# Objective 6 — Evidence-driven repair and recovery

Status: research draft in PR #43. This reuses the existing bounded Actions coordinator and local JobService; it adds **no second repair engine or unapproved model call**.

## The requirement

A game that fails a tested child requirement must not become playable/ready merely because code compiled. A test must identify the missing action, visible effect, or payoff. Jems may attempt at most **two repairs** after the original generation (existing limit), using the original request and last failed candidate. The SAME independent test and ALL sandbox safety, pause/replay, learning and resource gates must pass before the revision is ready. Kept versions stay unchanged unless the child explicitly chooses Keep.

## Implementation

- server/quality/repair-diagnostics.ts converts raw untrusted sandbox/test text into bounded, safe repair descriptions. For an intent failure, a probe ID and checkpoint must match the vetted O3/O5 contract. It describes the expected visible outcome and identifiers but does not echo arbitrary compiler text, injected instructions, secrets, private child content or source code.
- server/actions/coordinator.ts retains the last failing candidate and the vetted source-bound gameplay contract on the SAME bounded Actions repair route. It stores a safe diagnostic category and feedback. Successful tests still must satisfy the existing compiled source attestation and O5 intent attestation; exhausted failures return a stable REPAIR_EXHAUSTED_INTENT error code with no ready revision.
- server/pipeline/service.ts applies the same safe diagnostic and terminal behavior to the existing local reference pipeline.
- No worker identity, gVisor image, model credentials, owner allowance, parent session or trusted runtime archive changes. No production activation.

## Evidence and scenarios

The mandatory unit tests in tests/intent-repair.test.ts cover source-free bounded feedback, malicious/raw text rejection, known versus forged probe IDs, input/runtime/replay/compile categories, previous candidate preservation, same original child prompt, attempt accounting and final source attestation.

A simulated Actions sequence must run: failed intent browser report → repair attempt 1 receives the correct checkpoint → corrected authored candidate → independent test attestation → ready revision that is NOT automatically kept. A second scenario runs three failed generations/tests (one initial and two repairs), then fails with zero new revisions and leaves an unrelated kept game untouched. Unit-only attestation is explicitly synthetic.

The full browser scenario in tests/intent-repair-browser.ts uses the EXISTING sandbox worker CLI on reviewed authored source. It starts with a rocket whose launch is broken. The independent actual-input browser test rejects it. The existing JobService then invokes its bounded repair hook (an authored fixture, not a paid model). The same sandbox worker must pass the corrected game on desktop and mobile before Ready is assigned. Prior Keep remains; new Keep must be explicit. Tests also check source/plan unchanged, allowance accounting and no child prompts in audit.

CI runs this browser integration as a separate mandatory Arcade Journeys step, in addition to O5 checks, unit contracts, learning, creativity, worker security and visual regression. Local CI fixture execution does NOT substitute for a separately reviewed pinned production gVisor image.

## Failure and ambiguity policy

- Measurable gameplay failure: repair against the same independently established requirement; re-test it.
- Unknown test error: generic safe diagnostic. Never forward raw sandbox text as instructions to the model.
- Exhausted two repairs: fail cleanly; no false ready/Keep or previous-version loss.
- No trusted intent contract: the game remains NOT TESTED for intent fidelity even when generic safety/playability passes. Do not invent a contract just to obtain a high score.
- Real model repair success, costs, median latency and false-positive rate remain to be measured on unseen examples (O8). The current fixtures prove the *mechanism*, not universal generated-game quality.

## Scope and completion

O6 is complete only if strict build, entire unit suite, actual browser failure→repair→retest integration, independent O5 checks, baseline Arcade/creative/learning and security regression checks pass on the exact reviewed source. PR #43's code has been reconciled against the merged #36/#42 main tree, subject to exact-head full CI review. No deployment, paid provider call or production worker pin is authorized by the documentation or code reconciliation.

O7 now contains fixture-backed cross-vertical browser journeys. Real device/voice, parent-approved model traffic, unknown games and production rollout remain unverified. Next: O8 reliability/holdout benchmarking and O9 security-reviewed deployment. Reliability precedes first-shot visual delight.
