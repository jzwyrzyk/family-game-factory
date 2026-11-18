# Jems Game Intelligence — Functional-First Objective Roadmap

**Decision review:** November 18, 2026. **Status:** O0–O2 engineering foundations completed; O3 is next. All changes remain in [draft PR #43](https://github.com/jzwyrzyk/family-game-factory/pull/43), tracked by [Issue #44](https://github.com/jzwyrzyk/family-game-factory/issues/44). No automatic merge, public activation or worker trust change.

## Mission and priority order

Jems must reliably convert the child's idea into a **working, faithful, playable, editable game**. The first goal is NOT that a game be dazzling or highly optimized on its first generation. The priority order is:

1. **Correct function:** requested action actually works; clear input/state/output; essentials and requested payoff happen; no freezes or false win.
2. **Robustness and safety:** mobile/touch/keyboard, pause/replay, sandbox, privacy, cost limits, math/English host integration and existing versions behave properly.
3. **Evidence-driven repair:** detect objective defects and correct them within the child's original requirements; re-run independent tests; preserve prior versions and honest failure messages.
4. **Enjoyment and polish:** playful art, expressive animation and observed delight are worthwhile only after a reliable experience exists.

**Do not introduce a second generation pipeline or a second repair engine.** Reuse the existing authenticated private generator, worker, sandbox/preview, durable revisions, model budgets and bounded repair coordinator. New game-intelligence code must either plug into these or remain explicitly research-only.

## Definition of a WORKING game

A game is functionally acceptable only when the child can perform the requested primary action using the real intended controls; that action produces a visible, rule-consistent effect; the requested objective or free-play behavior works; the explicit payoff occurs; losing/retry/replay and interruption work; Keep/Undo/history do not lose the game; required learning checkpoints still work; and preview execution stays isolated and within limits. An objective cannot be accepted by source compilation, a mock-only success label or an LLM's self-evaluation. Where an arbitrary game cannot be objectively tested, record **not tested**, not passed.

## Sequential objectives

| ID | Objective | Deliverable in scope | Minimum acceptance gate | State |
| --- | --- | --- | --- | --- |
| O0 | Baseline and safety boundary | Pinned code, CI, working-game and production ownership inventory | Exact-head baseline suite and no unauthorized activation | **Complete** |
| O1 | Source-grounded child intent | Exact original text, verifiable intended actions/constraints/payoff/revision provenance | Negative, ambiguity, Unicode, tampering, revision tests and full source CI | **Engineering complete**; semantic accuracy unproven |
| O2 | Minimum sufficient game form | Independent 2D / true 3D, scripted / physics, input style decision with evidence, uncertainty and old-version protections | Sticker vs grid vs real suspension vs unsupported 3D and saved-game contrasts; full source CI | **Engineering complete**; not integrated |
| O3 | **Executable working-game contract** | Convert O1 requirements + O2 form into testable player inputs, state transitions, visible effects, win/free play, retry and replay criteria; establish three small *authored* reference games | Demonstrate a complete sticker-assemble → Launch case end-to-end in a safe local fixture; additionally cover robot-grid and physical-car cases; broken outcome/controls fail | **Next** |
| O4 | **Connect to existing generation and preview** | Route the validated design contract through existing private agent and authenticated generation/preview contracts, beginning with a fixture-backed vertical slice | A child idea reaches a playable test, a later edit changes actual gameplay, and the prior version remains intact; no false ready, no paid/security bypass | Not started |
| O5 | **Independent functional gameplay checks** | Test the rendered sandbox game with real input and objective traces; detect unresponsive controls, missing required effect, unreachable goal, broken pause/replay | Red/green tests on deliberately broken games, not just authored valid ones; no generated self-certification or invented fun score | Not started |
| O6 | **Proven repair and recovery** | Extend existing bounded generation→test→repair coordinator with intent-specific diagnostics; protect prior version | Broken example fails, repair reruns all safety/learning tests, fixed behavior is observed or fail-closed; max retries/budgets preserved, no automatic Keep | Not started |
| O7 | **Cross-vertical production journey** | Verified child Create → Play → Modify → Test → Compare → Keep → Return across Studio, learning, coach/voice, drawings when enabled, saved versions | Real browser/device and host-contract integration, failure/refresh/reconnect and math/English interruption tests; no silent regression | Not started |
| O8 | **Reliability benchmarking and product acceptance** | Compare current vs improved generation for essential mechanics functioning, false success, repairs, input failures, latency/cost and accessibility; run observed child feedback separately | Repeatable baseline and genuinely unseen challenge ideas, report failures and uncertainty; child fun/learning claims require human observation | Not started |
| O9 | **Final security/integration/release** | Rebase with concurrent fixes, review exact head, update private worker code pin through existing trust process, deploy and verify rollback | All mandatory CI and security gates green, actual owner-approved private worker and application smoke, explicit owner authorization | Not started |

## Important change to our working method

**One objective at a time**, but **integration/regression checks at every objective**, not only O7. Each objective may be broken into narrowly scoped commits: (a) code, (b) adversarial fixture, (c) integration check, (d) review. Do not call a stage complete on unit tests alone if its claim concerns real game behavior. No extra child conversation steps merely to satisfy our internal classification.

Use **one early vertical slice** to challenge the pipeline: **bubble-gum/sticker assembly, attach pieces, press Launch, animation actually executes, change and replay without losing work.** This is an engineering fixture, not an unreviewed change to the curated Bubble Gum game tracked separately in PR #40. Then confirm **Robot Route Lab** uses grid logic and **Junkyard Rally** retains genuine suspension/physics. These cover simple direct manipulation, deterministic rules and physics without prematurely generalizing to every genre.

## Existing components we must integrate, not rebuild

- The private Responses agent currently uses the original O0 game-form advice and does NOT yet consume O2's validated decision. O4 must reconcile this divergence; O2 passing tests alone changes no private worker behavior.
- Existing Actions coordination already permits up to two bounded repair attempts on failed test reports. O6 should add **intent-specific evidence and verify repaired gameplay**, not create another repair orchestrator.
- The trusted 2D generated runtime, sandbox execution, required learning host, private preview, revision history, budget gates and immutable worker SHA restrictions are existing non-negotiable infrastructure.
- Independent generated-code smoke tests exist but do not demonstrate arbitrary child-specific intent fidelity or actual enjoyment. O5 extends their test scope with evidence.
- Other open UX, coach, safety and bubble-gum PRs may conflict; O7/O9 must reconcile their actual merged/remaining code rather than overwrite them.

## Risks and claims

- O1 and O2 are conservative, largely lexical proposals. Passing authored contrast tests does NOT establish robust interpretation across children's arbitrary speech. Ambiguous essential requirements cannot be silently replaced by an easy game.
- The 24 sample ideas in the publicly visible research document are **reference examples**. Because the named H01–H08 cases are disclosed, do NOT claim them as a genuinely sealed, unseen holdout. The final evaluation must use additional independent withheld examples if a true holdout is required; do not expose private child prompts in public code or logs.
- Avoid a composite fake 'fun score'. Before functionality is established, compare **working requirement coverage, broken control/outcome incidence, successful verified repair, regression rate, cost and latency**.
- Private generation is pinned to an approved public source SHA. Merging this draft or deploying static Pages does NOT automatically update the private worker; do not bypass its pin/WIF/runner security restrictions.
- No public crowdsourced game library, sharing or messaging; child data collection or paid model activation remains separately gated.

## Completed-gate evidence and present status

**O0:** baseline application head `e4f5e20e5825972f8fc469dd86e57ba6a9e49d11`, [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44320155111) and [full visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44320154925) passed.
**O1:** contract and tests on `bdf0125deb7d1d2ded9dc57ca07217fc52d2c202`, [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44331115328) passed after isolated mobile learning rerun; this is a technical gate, not universal intent understanding.
**O2:** on `4bd68e2a770cca3c33ca8bf8324b36bb117eb48e`, both [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44338478637) (browser/learning/creative) and [full visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44338478832) passed. It remains an offline advisory, not activated in the private generator.

**Immediate next objective: O3**, a tiny but executable **functional acceptance contract with test fixtures**, not a large prompt engineer or visual redesign. Its concrete acceptance is that a safe local game reacts to inputs and produces the promised sequence with working reset/replay. Once this is objectively verified, O4 wires it through the real existing generator.

## Supporting documents

- [Original design standard](README.md)
- [O1 intent contract](objective-01-child-intent.md)
- [O2 form contract](objective-02-game-form.md)
- [Cross-vertical test reference](cross-vertical-standard.md)
- [Research examples and protocol](research-protocol.md)
