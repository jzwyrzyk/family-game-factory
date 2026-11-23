# Conversation-led creation and an explicit Build handoff

**Status:** Owner direction clarified; corrected candidate source implements this decision. Candidate verification, production delivery and observed child use remain separate evidence.
**Recorded:** November 20, 2026; clarified November 21, 2026 (America/New_York).

## Decision source and correction

The owner's initial request was a fully minimalist creation experience: chat and buttons, important questions such as how the game should feel inside the conversation, additional tools expandable, an obvious excited Build handoff inviting play while waiting, and no large build-text dump in the child's chat.

A provisional working implementation interpreted “buttons” as suggested creative answers and added **You choose** / **Choose the rest**. The owner explicitly rejected that interpretation on November 21:

> “They should be GUIDED to their own answers per the entire principles of our game. no choose the rest. no game creation until you have enough of what you need from the kid to actually make a reasonable game.”

Suggested-answer chips and delegation were implementation assumptions, not accepted user requirements. This record discards them. Buttons in the corrected experience support actions; the conversation coach helps the child develop their own design.

## Context

The creation workspace had accumulated an illustrated introduction, conversation, several status lines, help modes, suggestions, plan fields, experiment options and optional guidance. Build could open an eight-field plan outside the conversation. The compiled plan then passed through the same path as a child's typed message, making the transcript display implementation instructions. The existing background banner preserved build state but did not clearly acknowledge an explicit Build action.

The [coaching standard](../design-coach/GOLD_STANDARD.md) already calls for conversation first, contextual open questions, useful help when the child is stuck, truthful evidence and preservation of creative ownership. The corrected experience must express those principles directly. A smaller questionnaire would not satisfy this decision.

## Decision

1. Make the ordinary new-game workspace the conversation coach, one input and useful action buttons. Keep additional tools and longer details behind a clearly named disclosure. Necessary errors, unsaved work and recovery remain visible.
2. Let the coach respond naturally to what the child actually says. Ask at most one useful open question about a material uncertainty, grounded in the child's particular idea and earlier answers. Do not impose a fixed question order, require every planning field, or turn jokes and exploratory conversation into an interview.
3. The child supplies the creative answers. Remove suggested-answer chips, menus of supplied feelings or styles, **You choose**, and **Choose the rest**. Requested explanations or inspiration can help the child think; they do not become the child's choices or a direct route to first creation.
4. Do not create a new game until there is enough coherent child-provided detail to make a reasonable game. The coach must understand the intended action, its visible consequence or purpose, the desired experience and the world or theme, then resolve any additional material gaps or contradictions. Readiness is contextual; it is not a word count, a number of turns, eight nonempty fields, a helper proposal or an old approval/delegation flag.
5. Ground first-creation readiness in the current child's stated intent. The host validates the coach's evidence and current context before enabling submission. Missing, stale or unsupported readiness remains in conversation. Editing material intent invalidates an earlier review. A limited local fallback identifies itself honestly and cannot pretend that a connected coach has established completeness.
6. Keep **Send** and **Build** distinct. Typed or dictated text remains editable until sent. Conversation and readiness never auto-submit a generation job. A sufficiently understood idea still requires the child's explicit Build; hidden plan actions, model proposals and saved legacy flags cannot bypass that gate. Existing acknowledged jobs and saved games retain their recovery and play paths.
7. Build uses the original idea, current child decisions and later authored game statements to prepare an internal request. Newer corrections take priority without losing other preferences. Do not echo the compiled request into the visible conversation or replace an unrelated unfinished draft with it. Preserve provenance and recoverable request/version data.
8. When an authorized Build actually submits, bring a focused handoff into view immediately. Its initial state acknowledges sending without claiming that a job was accepted. After durable acknowledgement, offer short cheerful progress and **Play while I wait** or **Stay here**. The child chooses the next activity.
9. Keep progress truthful. Closing the handoff does not cancel a job; polling cannot reopen it or seize focus. Unknown outcomes do not authorize automatic replay of a paid request. Background readiness exposes an explicit action and cannot replace a game, choose Keep or bypass required learning. Build lifecycle information stays outside the child's conversational exchange.

## Consequences and limits

### November 21 recovery and readiness refinement

The owner subsequently reported that the coach was poor at recognizing a ready idea, a failed build's retry led to a blocking connection dialog, and chat appeared offline and unnatural despite the adult banner reporting ready. These are defects in the intended conversation and recovery path, not a request to remove child authorship or build safeguards.

Assess a playable first version using the original idea and subsequent authored decisions. The chosen action, stakes or free-play purpose may express the desired experience; a separate feeling word, art style, exact controls, score and numerical tuning are optional unless essential to that particular idea. A valid ready verdict ends follow-up questioning. Preserve bounded original and recent child wording instead of allowing separate helper messages to displace the premise after a few exchanges.

Keep **Build my game** visible and disabled with one short reason when the idea needs attention. **Check my idea**, or **Reconnect chat** after a technical failure, explicitly reassesses saved words through the existing coach. It adds no fake child statement and starts no game. A missing required readiness verdict is a failed check. A technical outage must not start a fixed local questionnaire; show that the idea is saved and offer recovery. Health means available, a validated model reply means connected, and a failed reply remains visible across healthy rechecks. Actual safety refusals remain distinct from technical failures.

For a saved failed job, recover authoritative state by its durable ID and explicitly retry the exact accepted request. A failed job has one authorized retry successor; a lost retry acknowledgement, reload or concurrent click must reuse that successor rather than reserve another build. Expose read-only status recovery in the uncertain handoff and a working retry action for known failure. A new submission with no acknowledged job ID still has no lookup mechanism in this change: do not treat an older job as evidence of its outcome or automatically replay its paid request. This bounded repair adds no pending-request storage migration or general request-ID lookup endpoint.

This clarification supersedes the provisional chip/delegation design and the older first-creation assumption that “you decide” may complete missing design decisions. It also replaces a mandatory plan-card review and the passive-banner-only Build handoff. The full plan may remain an optional inspection surface, but it is not an independent readiness authority.

The coach can provide more concrete support when the child is stuck without supplying a menu to tap through. A desire to stop ends optional coaching, and existing games remain available to play. Stopping the conversation does not authorize a new game from insufficient child input. No-loss, no-score and open-ended games remain valid; the coach resolves what matters to that design instead of demanding every conventional rule.

The contextual review uses the existing conversation service and explicitly quoted child evidence. Host validation and explicit Build retain execution authority. The **gateway request/reply validator, private coach and web app** require coordinated rollout. Verify compatible backend revisions before the new web app: an old gateway or private executor rejects the new creation context, and an old response without readiness cannot silently approve creation. Shared validation dependencies must be present in the actual gateway publication archive and both service images, not only the development checkout. This decision adds no new provider or automatic inference call, paid activation, public sharing, learning score or reward policy.

The updated reader accepts old notebooks; the reverse is not guaranteed. In particular, a pre-change browser rejects the new saved readiness field. Retain a compatible reader or a separately tested no-loss migration in any frontend rollback after these records exist. Service rollback must preserve current configuration, identity, budget and traffic safeguards while accounting for the new protocol. Keep the accepted generation worker and sandbox image pins when their executable inputs and live identities are unchanged; this conversation refinement does not itself require a worker rotation or a repeat isolated sandbox smoke. Exact-source service packaging, authenticated protocol checks, the complete web release regressions and a bounded authorized creation journey remain necessary release evidence.

Preserve the [character-first entrance](2026-11-20-character-first-navigation.md), saved drawings, original games, owner boundaries, voice consent, existing generation policy and learning guards. Source changes, fixture checks, publication, live-provider operation and observed child use are separate evidence. Reconsider coaching copy and optional tool grouping when observed use shows that children lose their place, cannot express an idea or receive repetitive questions.

## Acceptance and references

Check genuine multi-turn conversation: an incomplete idea receives a relevant open follow-up; the child's own answer changes the coach's understanding; an answered question is not repeated; a coherent clear idea does not face an arbitrary interview. Verify that requested help scaffolds the child's own reasoning, with no supplied-answer menu or delegation escape.

Check long conversations retaining their premise, a short playable idea with no separate feeling/art-style answer, no extra question after ready, explicit reassessment without transcript pollution, genuine provider failure versus refusal, and healthy status followed by a failed actual reply. Fixture responses establish host behavior; a real successful conversation and natural readiness judgment still need live acceptance.

Check that absent, stale, contradictory or unsupported readiness cannot submit a new game through the public Build button, optional plan controls, model proposals or older saved flags. Verify exact child evidence, corrections, separate unfinished drafts, owner changes and reload recovery. Inspect the visible chat and actual build request so minimal presentation does not lose authored intent.

Once readiness and explicit Build are satisfied, check sending → acknowledged build → optional play → explicit ready-result action. Include rejection, unknown connection outcomes, dismissal before completion, failed saves, active learning, keyboard focus, reduced motion and narrow screens. Earlier chip/delegation captures and tests are evidence only for the rejected provisional implementation.

- [Child interface contract](../brand/CHILD_INTERFACE.md)
- [First-creation contract](../child-journey/FIRST-CREATION.md)
- [Coaching standard](../design-coach/GOLD_STANDARD.md)
- [Explicit voice and Build](0003-explicit-voice-and-build.md)
- [Architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery state](../../DELIVERY-STATE.md)

## November 22, 2026 owner revision: creative fidelity before Build

The owner tested the actual coach policy in an independent conversation. A fox that dodges leaves and loses if hit was prematurely declared ready. The earlier minimalist readiness rule favored a merely playable first version without understanding the child's desired win/purpose, look, or emotional tone.

For **new creation sessions**, version-2 readiness now requires grounded child-authored evidence for the existing action, consequence, experience and world dimensions **plus goal/free-play purpose, visual style and mood**. Ask about viewpoint and movement when the distinction materially changes the first version; special moments and celebrations are optional. One child statement can satisfy multiple dimensions; there is no fixed number/order of turns. Children who are stuck get context-specific imagination strategies (a moment, favorite thing, or ordinary object made extraordinary), not repetitive questioning or a choice-menu shortcut.

A static two-sentence "Hey, I'm jems!" introduction appears before the child's first message. It is UI copy, not synthetic child evidence, a paid model turn or consent to Build. The child remains the author, and the existing explicit Build/Keep, privacy, learning, safety, spent-budget, and production rollout gates remain authoritative. Previously saved version-1 conversations retain their review contract until a deliberate migration, rather than being silently upgraded to an invented v2 creative record.

The seven-key coach response and validation protocol require coordinated gateway, private-coach and web-client deployment. Legacy v1 remains separately valid for its existing clients, and Build never uses a v1 verdict for a new v2 session. Do not activate or deploy this source merely because unit tests pass.

## November 23 refinement to child-led discovery

The owner requested v2.1 on [draft PR #135](https://github.com/jzwyrzyk/family-game-factory/pull/135) after a fox conversation supplied jump and duck before the child had invented a move. Start with one open question grounded in what the child has already said. Vary the support when they get stuck. A request for examples can lead directly to attributed possibilities. Preserve earlier answers, ask only about material gaps, and use everyday language for viewpoint, movement and appearance. The v2 welcome, seven evidence dimensions and explicit Build action still apply.

Use the existing plan and idea records for attribution. A current child decision quotes their own words. An adoption also identifies the specific earlier helper phrase in the same plan field. The host binds each chosen phrase to the selecting turn in the notebook and checks the earlier helper message before compiling it. This supports an adaptation such as choosing the second look and adding silver lines. The original example is never eligible as a child's evidence quote. A generic yes, a legacy accepted flag or a delegated field cannot establish the selection. A later independent replacement becomes the current choice.

The alternative of treating every option mentioned in chat as buildable would erase authorship. A new response or notebook schema would add rollout costs. Field-matched suggestions and child quotes use the current v2 shape. A v2 reader can reopen the notebook. Reviews involving a selection have a different fingerprint. A rollback must retain the selection-aware compiler to continue builds using those choices faithfully. Older bundles can omit helper-origin fields after reassessment. Existing accepted jobs retain their recorded requests. Revisit the approach if observed model conversations lose the link between a paraphrased choice and the earlier offer.
