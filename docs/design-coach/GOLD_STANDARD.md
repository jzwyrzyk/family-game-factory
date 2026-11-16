# Family Game Factory — Child-owned design coaching

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

A child saying “I don't know” should receive progressively more concrete assistance, not repeated versions of the same question. Start by locating the friction, change perspective, offer inspiration when needed/requested, then candidate designs if requested. Always offer equivalents of **Give me ideas**, **Let me think**, **Explain**, **Just try this**, and **Keep playing**.

Preserving ownership is not withholding help. Offer help that leaves meaningful choices with the child. Recognize decisions descriptively, not through exaggerated flattery or fixed intelligence labels.

## Creation conversation

Start with the idea and what the child thinks would make it fun. Resolve meaningful missing decisions: core actions, objective/winning, failure/recovery (including a deliberate no-loss design), scoring or its deliberate absence, visual style/characters/drawings, challenge/progression and unusual mechanics. Do not ask answered questions or impose a two-question cap. Do not turn this into a mandatory long form.

Allow child answers, “you decide”, alternatives, and revision. Mark AI suggestions as suggestions; never rewrite their origin as child-authored. Confirm a compact game-plan card before the first real build. Preserve the fun intention as an evaluation anchor. Parent learning/privacy/spending settings are inherited, not configured by the child.

## Experiments and editions

An experiment shelf retains independent tests (A, B, C...) and optional notes. A new alternative starts from the chosen **main edition** unless the child explicitly continues a test. Continuing a test creates a new recoverable experiment, never silently erases it. Comparing an older version does not overwrite any main pointer.

Tune one factor when answering a focused question; permit coherent multi-factor redesigns when questioning the core mechanic. Combining ideas creates another test with explicit provenance and stated changes. Do not force all creative work into a one-variable experiment.

The child may play variants serially, use notes or remember impressions mentally, and decide that the original is best. Similar starting conditions may help comparisons; do not fabricate deterministic comparison support where engines cannot provide it.

**Make this my main game** creates the next named edition, like a sequel. Earlier editions and test branches remain. **Save as a different game** creates an independent project. Autosave protects work; it never chooses a favorite, publishes, or promotes a test automatically.

## Reflection without homework

One useful question at a time, short exchanges, and no compulsory answer before play or implementation. Do not ask for reasons already given. Accept showing, pointing, drawing and brief speech where supported; reading/writing skill must not define creative control. Teach a small concept when useful rather than delivering a lecture first.

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
