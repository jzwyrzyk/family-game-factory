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

This clarification supersedes the provisional chip/delegation design and the older first-creation assumption that “you decide” may complete missing design decisions. It also replaces a mandatory plan-card review and the passive-banner-only Build handoff. The full plan may remain an optional inspection surface, but it is not an independent readiness authority.

The coach can provide more concrete support when the child is stuck without supplying a menu to tap through. A desire to stop ends optional coaching, and existing games remain available to play. Stopping the conversation does not authorize a new game from insufficient child input. No-loss, no-score and open-ended games remain valid; the coach resolves what matters to that design instead of demanding every conventional rule.

The contextual review uses the existing conversation service and explicitly quoted child evidence. Host validation and explicit Build retain execution authority. A new model response contract and the browser that consumes it require coordinated rollout; an old response without readiness cannot silently approve creation. This decision adds no new provider or automatic inference call, paid activation, public sharing, learning score or reward policy.

Preserve the [character-first entrance](2026-11-20-character-first-navigation.md), saved drawings, original games, owner boundaries, voice consent, existing generation policy and learning guards. Source changes, fixture checks, publication, live-provider operation and observed child use are separate evidence. Reconsider coaching copy and optional tool grouping when observed use shows that children lose their place, cannot express an idea or receive repetitive questions.

## Acceptance and references

Check genuine multi-turn conversation: an incomplete idea receives a relevant open follow-up; the child's own answer changes the coach's understanding; an answered question is not repeated; a coherent clear idea does not face an arbitrary interview. Verify that requested help scaffolds the child's own reasoning, with no supplied-answer menu or delegation escape.

Check that absent, stale, contradictory or unsupported readiness cannot submit a new game through the public Build button, optional plan controls, model proposals or older saved flags. Verify exact child evidence, corrections, separate unfinished drafts, owner changes and reload recovery. Inspect the visible chat and actual build request so minimal presentation does not lose authored intent.

Once readiness and explicit Build are satisfied, check sending → acknowledged build → optional play → explicit ready-result action. Include rejection, unknown connection outcomes, dismissal before completion, failed saves, active learning, keyboard focus, reduced motion and narrow screens. Earlier chip/delegation captures and tests are evidence only for the rejected provisional implementation.

- [Child interface contract](../brand/CHILD_INTERFACE.md)
- [First-creation contract](../child-journey/FIRST-CREATION.md)
- [Coaching standard](../design-coach/GOLD_STANDARD.md)
- [Explicit voice and Build](0003-explicit-voice-and-build.md)
- [Architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery state](../../DELIVERY-STATE.md)
