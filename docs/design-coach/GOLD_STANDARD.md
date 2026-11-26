# Family Game Factory — Child-owned design coaching

## One concept, separate completion action — November 25, 2026

Build sits outside the conversation input form. HTML composer validity cannot block a ready saved concept. Send and reviewed Speak still feed the same conversation; empty-composer Build compiles eligible accumulated decisions. If a child has added unsent text after a ready review, Build sends it exactly once through the same coach and stops for the updated clarification/recap. The child chooses Build again after readiness is established. No stale review, draft loss, automatic build, changed provider model or new spending authority is permitted. See the [modernization decision](../decisions/2026-11-25-child-experience-modernization.md). Earlier placement descriptions below are historical where they differ.

**Status: owner-approved product standard.** This standard applies to initial game creation, play, reflection, experiments, revision, save/fork and release. It is not an optional educational layer. Existing game mechanics remain in scope for later repairs, not silently changed by this UI work.

## Governing principle

> Remove the difficulty of implementing an idea without removing the child's work of discovering what the idea should be.

Two outcomes matter together: an engaging, functioning game suited to its player; and a child who practices noticing, questioning, imagining, testing and choosing. A game designed entirely by the AI does not satisfy the second outcome. A burdensome educational conversation that prevents enjoyable play does not satisfy the first.

The AI should be capable enough to help build safe ideas, knowledgeable enough to help the child examine them, and restrained enough not to make the child's creative judgment redundant.

## The benchmark: redesign, not just easier settings

An aiming-and-shooting mechanic was difficult and unfun for a young player. The child's breakthrough was to replace shooting with jumping into projectiles using a shield, bouncing them toward the dragon. The enjoyable objective remained; the interaction changed from aiming to timing.

The acceptance criterion is NOT that the assistant suggests a shield. It is that the child can recognize a poor interaction, invent an alternative and test it with useful support without losing authorship. Do not encode the example as the expected answer.

Support three depths of change: **Tune it**, **Redesign it**, **Rethink it**. Parameter tweaks are not a sufficient response when the child is questioning the core action or objective. These are conceptual possibilities, not a mandatory child-facing taxonomy.

## Game-design knowledge informs the conversation

Consider the repeated enjoyable action; input/coordination demands; readable cause and effect; player agency; challenge and recovery; and the experience the child wants (humor, suspense, discovery, creativity, accomplishment, cooperation, etc.). Do not optimize every game for the same scoring or difficulty curve.

Use concise, contextual questions such as: Which part would you do again? What were your hands trying to do? Could you tell why that happened? Did your choice matter? Was it exciting or confusing? You wanted funny surprises: which one made you laugh?

The Mechanics–Dynamics–Aesthetics distinction may inform reasoning behind the scenes; children need not know its terminology. Training should favor self-directed experimentation, testing, debugging and reflection rather than reproducing an adult solution.

## Flexible support, not a compulsory decision tree

- A clear idea: help specify and implement it; no unnecessary interview.
- Dislike without explanation: help locate a particular action or moment.
- Problem understood, ideas missing: offer a useful prompt or analogy.
- Multiple ideas: preserve alternatives and help compare; do not pick the winner.
- Unexpected result: distinguish observation from explanation.
- A request to learn: explain the relevant concept directly and briefly.
- A desire to play: stop questioning and let the child play.
- A software defect: acknowledge and repair it; do not turn it into a reasoning failure by the child.

Ask a child to invent before offering possibilities. “What could your fox do to get away from the flying leaves?” leaves the move to the child. Asking whether it should jump or duck supplies two answers. Once the child has named a move, use it in the next question only if something about it still needs explaining.

When a child gets stuck, help them picture one moment from inside their game. If that approach stalls, draw on a familiar toy, animal or ordinary object doing something impossible. A child who needs examples can have a few different ideas from jems to change, mix or reject. Give the requested number when a child asks directly. Choose support from the conversation. A child can skip straight to examples or stop at any time.

Use the words a six-year-old would use to tell a friend about the game. Pixel art can be “a picture made of little colorful squares.” A realistic fox “looks like a real fox.” Respect a child's own vocabulary. A short acknowledgment can simply pick up the new detail. Vary the rhythm and reserve celebration and emoji for moments that warrant them.

## Creation conversation

Start with the child's game idea and help them picture the result. A new first-build conversation begins with a short, friendly introduction from jems: "Hey, I'm jems! Tell me the game you're imagining. I'll ask a few fun questions so we can make it look and play the way you want." Show it once as UI presentation, not fabricated child text or a recurring model turn.

**November 22 creative-readiness revision:** A new idea is ready when it describes a *faithful first build*, not merely a technically playable interaction. Before the first Build invitation, establish a child-chosen central action and its consequence, a goal/win condition or explicitly open-ended purpose, the game world, a visual direction (e.g. storybook, pixel, cartoon, realistic) and intended mood (e.g. cute, lively, spooky, cool). Resolve side-view vs first-person vs overhead and control/movement style when the distinction materially affects the first result. A special surprise, celebration, levels, scores, technical control mapping and numerical tuning are optional unless central to that particular idea. An open-ended game needs no fabricated win condition. Information requirements are *not* individual questions: one statement may supply several, and the coach never repeats a decision already given.

The owner's [November 21 clarification](../decisions/2026-11-20-guided-chat-creation.md) requires a conversation coach that guides children to their own answers. Do not turn creation into tapping suggested answers, and do not offer **You choose** or **Choose the rest** to complete the design for them. An invitation to give the child ideas can provide perspective, a brief explanation or clearly attributed inspiration in conversation when requested; it is not a clickable answer menu or permission to generate a new game from the helper's choices. Preserve alternatives, the child's own wording and their right to revise an earlier choice. Parent learning/privacy/spending settings remain inherited.

No new game may be created until there is enough coherent child-provided detail to make a reasonable game. The coach follows the actual idea across turns and asks at most one useful open question about a material gap. Understand what the player does, what happens as a result or what they are trying to make happen, and the intended experience. Resolve additional rules when this particular idea depends on them. Do not equate readiness with eight completed fields, a turn count, word count, keyword matches, an accepted helper proposal or an old delegation flag. A sufficiently clear child-authored idea can be ready without an interview; an incomplete one stays in conversation even if Build is requested.

Keep a side view separate from running direction, a cartoon look separate from dimensionality, and a mood separate from a palette or celebration. A child who says “like Bluey's floppy ears” has given their own character floppy ears. Preserve the characteristic they named. Ask what they mean only when the comparison leaves an important choice open.

An explicitly selected or adapted jems idea belongs in the current design with its helper origin and the child's choice attached. Only the child's own words can serve as conversation evidence. “Sure” after several options leaves the decision open. One child message can express an entire game, including an unusual rule or an explicitly open-ended purpose. Recap a complete game briefly and invite the child to select **Build my game**.

The first build should be recognizable as the child's mental picture, not merely functional. Keep separate grounded evidence for action, consequence, experience, world, goal, visual style and mood. Generic builder defaults are appropriate for low-impact implementation details but never a substitute for important unresolved creative choices. A clear statement of a playful purpose may serve as a goal in open-ended games, but its emotional/visual direction still needs the child's own words. Preserve the original premise and later authored corrections in bounded context, with accepted child plan choices carried separately. If a child is stuck, try a specific imagined moment, something they love, or a nearby ordinary object turned extraordinary before supplying attributed inspiration. After an appropriate short reflection of the complete game, offer an explicit Build invitation without further questions. **Check my idea** reviews those saved words without adding a synthetic child message or starting a build.

The default workspace is chat, free text or editable dictation, and action buttons. The full plan and other tools remain expandable for inspection, but neither a hidden plan action nor an old approval field may bypass first-creation readiness. Readiness must be grounded in the current child's stated intent, become stale when material choices change, and never itself submit a job. The child still explicitly chooses Build after the coach has enough information. Preserve the fun intention as an evaluation anchor.

Keep experiment controls, explanation preferences and longer support behind a disclosure. Build compiles the child's coherent saved intent without inserting the compiled prompt into the transcript. Lifecycle progress belongs in the focused handoff or concise status, with optional play after an acknowledged build. Background readiness cannot demand a response, choose Keep or interrupt required learning. A limited local fallback must identify itself honestly; it cannot pretend a live coach has understood the idea or grant readiness through a scripted questionnaire.

For a new idea, technical failure shows only a short saved-idea notice and an explicit reconnect path. Do not continue a fixed interview while chat is unavailable. A valid reply with the required creation verdict establishes connection; a status probe establishes only availability. Missing readiness, incomplete output and transport/provider failures are technical failures. Actual refusals retain their existing handling and do not themselves mean that chat disconnected. No automatic inference retry or increased allowance is implied by reconnect.

## Experiments and editions

An experiment shelf retains independent tests (A, B, C...) and optional notes. A new alternative starts from the chosen **main edition** unless the child explicitly continues a test. Continuing a test creates a new recoverable experiment, never silently erases it. Comparing an older version does not overwrite any main pointer.

Tune one factor when answering a focused question; permit coherent multi-factor redesigns when questioning the core mechanic. Combining ideas creates another test with explicit provenance and stated changes. Do not force all creative work into a one-variable experiment.

The child may play variants serially, use notes or remember impressions mentally, and decide that the original is best. Similar starting conditions may help comparisons; do not fabricate deterministic comparison support where engines cannot provide it.

**Make this my main game** creates the next named edition, like a sequel. Earlier editions and test branches remain. **Save as a different game** creates an independent project. Autosave protects work; it never chooses a favorite, publishes, or promotes a test automatically.

## Reflection without homework

Optional reflection uses one useful question at a time and short exchanges. It is not a prerequisite for playing an existing game or implementing a sufficiently specified change. First creation still requires coherent child-stated intent as described above. Do not ask for reasons already given. Accept showing, pointing, drawing and brief speech where supported; reading/writing skill must not define creative control. Teach a small concept when useful rather than delivering a lecture first.

Avoid stacking math, reflection and version dialogs. A math overlay has priority; optional reflection comes later. Respect skipped coaching for the current round/session. A loss or slow response is not evidence of emotions, diagnosis, aptitude, or motivation. Winning does not prove enjoyment, and a single play is not proof of a better design.

Record observation, child explanation, desired experience, expectation and actual outcome separately. The child need not fill every field. Failed experiments are useful; never blame the child for a broken build.

## Separation of responsibilities

1. **Design coach:** understands intentions/friction, teaches on request, helps generate/test ideas, preserves authorship.
2. **Builder:** implements the agreed change, reports what actually changed and does not quietly improve unrelated rules.
3. **Runtime/version system:** supplies truthful event evidence, keeps alternatives and provides safe promotion/rollback.

A persistent design record holds the child's intention; reported problem; actual event observations; ideas and their provenance; tests and expectations; observations and decisions. Never store credentials, signed preview URLs or inferred psychological profiles there.

Conversational behavior can use a contextual LLM, but permissions, validation, spending, version protection and execution remain deterministic. A mock/local helper must not masquerade as an activated LLM or as a fulfilled novel mechanic.

## Coaching acceptance scenarios

- “I hate aiming”: explore interaction design, not only health/speed.
- Unconventional child mechanic: clarify it, do not force it into existing templates.
- “I don't know”: increase useful scaffolding rather than repeat questions.
- Explicit request for ideas: provide inspiration rather than withhold help.
- “I won, but it was boring”: respect enjoyment independently of victory.
- Similar scores, different preference: do not overrule the child using telemetry.
- Failed change: keep the last working version and support another attempt without blame.
- Declined reflection: allow play without nagging or locked functionality.
- Clear change supplied with explanation: do not make the child repeat the reasoning.
- Joke, comment or compliment: do not turn it into an unauthorized build.
- Helper-suggested mechanic: require a child choice; retain helper provenance after adoption.
- Three alternative tests: no stacking or main overwrite unless explicitly selected.

Deterministic tests validate contracts and state transitions, not educational benefit. Model-output evaluations need a human rubric for ownership, contextual relevance, game-design reasoning, helpfulness, burden, truthful evidence and safe behavior. Short child playtests are required before claiming improved thinking or engagement. This is a research-informed product hypothesis, not a validated critical-thinking curriculum.

## Reference principles (not claims of product efficacy)

- MDA: https://aaai.org/papers/ws04-04-001-mda-a-formal-approach-to-game-design-and-game-research/
- Creative Computing: https://creativecomputing.gse.harvard.edu/guide/
- Creative learning guidance: https://thereader.mitpress.mit.edu/ten-tips-for-cultivating-creativity/
- Input accessibility: https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107

## Release boundaries

Keep review development separate from public deployment. Do not change gameplay engines, educational question selection, credentials, cloud infrastructure, runner policy or paid activation as a side effect. Real conversational inference requires approved identity, safeguarding, data-retention and spending configuration. `store:false` alone is not proof of zero data retention. No child-specific transcripts or drawings in public repository fixtures or logs.

The creation-readiness contract must work through the gateway validator, private coach and web app together. Verify the compatible backend path before publishing the new browser, and preserve older request/reply behavior for clients without the creation opt-in. Notebook compatibility also needs an explicit rollback plan: the updated reader accepts old records, while a pre-change browser rejects the saved readiness field. A rollback must keep a compatible reader or a tested no-loss migration. The [architecture](../../ARCHITECTURE-CURRENT.md#conversation-led-creation-readiness-and-build-handoff) separates these service/web checks from the independently pinned generation worker and sandbox.
