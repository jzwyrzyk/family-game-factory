# Game Intelligence — Cross-Vertical Product Review Standard

**Scope:** ALL Jems creation paths, not only model-generated physics games. This is a product QA standard and staged R&D backlog, NOT a claim that the current code already implements every check.

## Product-wide principle

**A Jems feature is successful only when the child can actually achieve the intended experience.** Compile/pass, great visuals, and ambitious underlying technology are *inputs*, not acceptable substitutes. A trustworthy quality review must ask the same questions across every pathway: what was the child trying to do, what did Jems build, what was observable, what was unnecessarily complicated, what did the child prefer, and what learning was preserved?

| Jems vertical | Design sniff test BEFORE building | Required evidence AFTER building | Failure example |
| --- | --- | --- | --- |
| **Text → game** | What is the actual action, change, goal/open-ended affordance and payoff? Can rule-driven 2D deliver it? | The child performs the action and witnesses every essential outcome | The cat eats donuts, but never grows |
| **Game-form selection** | 2D view or true 3D depth? Direct drag/tap/grid or physical simulation? What *requires* gravity/joints? | Rule/physical mechanic visibly changes outcomes for the right reason | Expensive 2D physics for a sticker robot |
| **Physics and movement** | Would removing simulation change the requested experience? Is physics actually needed? | Different inputs create different sensible physical results; repeated seeds stable | Changing wheel size only changes a label |
| **Draw → playable** | Is the child's drawing decoration, a movable sprite, separable character parts, or a physical rig? | Artwork ownership/provenance preserved; parts and desired interactions verified by child | Every drawing becomes a colliding rigid body |
| **Conversational coach** | Should Jems ask a question, explain what happened, or assist with a requested test? Is it about game design or personal profile? | Actual back-and-forth; child choices respected; no automatic build, no fake advice | Coach unilaterally redesigns the child's game |
| **Live remix / DOE** | Is the request a small visible adjustment, a new mechanic, or a new game? Which variable should be varied? | Versions are playable and comparable; original retained; selected version explicit | Jems compares code revisions but no gameplay difference |
| **Learning — math** | What grades/skills do parent-authorized settings require? Can interruptions occur without losing the game? | Correct host math, helpful hint path, independent/assisted evidence, real pause/resume | A physics game bypasses math or resets after answer |
| **Learning — English** | Does the child see real meaningful grade-appropriate reading/language practice, not a skin over math? | Correct task, response validation, accessible hints, stable progress; educator checks | Language tab looks different but uses irrelevant questions |
| **Gameplay presentation** | Is this an exciting, readable world for a young child? Clear objectives, playful colors, character expression, rewarding animation? | Touch/device review, reduced motion, readable text, child-perceived feedback | Technically correct workshop looks dull/ugly |
| **First-use and return journeys** | Can a child start, understand, change, wait, switch, and pick a test without getting lost? | Child finds next step unassisted; no misleading build state or separated action button | "Ready now" is shown when build not actually playable |
| **Parent insights** | Do reports separate observed counts/assistance from inferred improvement? | Evidence is visible, time windows clear, no fabricated mastery or fun claim | Parent sees a fake numeric "engagement/skill score" |
| **Safety / performance / ownership** | Are identity, privacy, cost, code sandbox, revision ownership, accessibility, and stopping boundaries maintained? | Mandatory trusted tests; version unchanged on failed build; no provider secrets to browser | Speed/quality shortcut silently bypasses safeguards |

The product can be delightful and still wrong; it can be technically correct and still boring. Avoid inferring either category from the other.

## The minimum four-layer review for any playable game

1. **Design fit** — Form, interaction and complexity match the idea. Essential verbs, transformation and payoff have traceable evidence.
2. **Behavioral correctness** — The game can be operated and produces those effects, with normal failures/retries; learn-checkpoint return and prior version preserve.
3. **Player experience** — A child understands the first action, controls feel good, characters and rewards read clearly, and the game is fun *as observed/asked*, never assumed.
4. **Trust and future edits** — Safety/grade/settings hold; wait-time UX honestly describes the asynchronous build; alternate versions and comparison remain explicit.

Do not combine these layers into a single numerical "quality" or "fun" score.

## Typical design mistakes this program must catch

- **Tool-first design:** The model has a physics engine, so it creates a physics game even when drag-and-drop would be better.
- **Theme confusion:** Robots are assumed to need 3D, cars assumed to need simulation, rockets assumed to need physical thrust rather than a launch animation.
- **Payoff omission:** The most interesting action or end state in the child prompt is missing despite a playable tutorial/level.
- **Ambiguous art conversion:** A drawing or item is treated as a physical load-bearing body when the child meant it as a sticker/sprite.
- **Successful-looking, nonfunctional edit:** Source changes without a gameplay consequence, or previews don't change the selected test.
- **Visual box-checking:** Contrast/layout technically pass but game lacks playful feedback, accessibility and expressive reward.
- **Interruption overreach:** Math/language integration interrupts mid-action or breaks the game state; fixing "engagement" by turning learning off is forbidden.
- **Coach overreach:** Jems suggests too much, gives the answer, or pretends to have made an edit; all must remain child-led.
- **Fake inference:** Playback duration, scores, retries, clicks or multiple edits are interpreted as boredom, attention, intelligence, fun or mastery.
- **Untrusted self-grading:** Generated source declares its own pass/fail instead of an independent test observing actual input and rendered results.

## Suggested end-to-end acceptance journeys

**Journey A — Sticker rocket.** Child invents a gum sticker rocket by voice or text. Jems interprets drag/drop + launch, uses simple 2D. The child assembles, sees each piece attach, presses Launch and watches a rewarding animation. Then they can change stickers, test a second version, compare them, and Keep the preferred game. Required learning checkpoint remains available without losing a build. The original idea survives a failed remote build.

**Journey B — Genuine physics car.** Child requests springs/wheel grip on bumpy hills. Jems selects 2D physical simulation. Car responds to real throttle/gravity/friction and suspension, changes are mechanically meaningful, and the child can experiment with size/mass without fake success. If the car flips or stalls it is clear why and they can replay.

**Journey C — Robot route.** Child directs a robot around hazards with a sequence of arrows. It is a 2D grid game; it need not become 3D or physics. The child sees each command executed, can detect an incorrect route, revise a step, and watch the result. The coach asks a question about their plan instead of solving it.

**Journey D — Draw a cat with wheels.** Jems asks whether wheels should actually move and cause a ride or simply be part of the character art if the drawing is ambiguous. No original art is discarded, no assumptions about a mass/collider are presented as the child's intent, and the child can correct the decomposed pieces before a game is built.

**Journey E — Learning + wait-time stress.** A big edit is queued while the child continues playing. The library shows truthful build status; practice is optional while waiting, while normal game checkpoints remain mandatory. A ready preview does not auto-replace the original. A delayed AI coach response cannot wipe a newer child decision.

## Research measurement boundaries

- Measure technical latency, rendered input feedback and failure/recovery separately from judged design fidelity.
- Record concrete visual/auditory presentation issues independently of game physics and source-code correctness.
- Compare revisions using observable state and actual player experiences, not code-diff size.
- Observe real children (with parental permission) before making any claims about engagement, fun, comprehensibility or learning benefit.
- Evaluate across real small-screen/touch devices and accessibility settings; synthetic tests are necessary but insufficient.
- Use time-boxed pilot studies with neutral wording. Respect child autonomy and no coercion to continue play.

This standard complements the Jems homepage/parent PRs, the child-led coach, the drawing engine, and existing gameplay/learning protections. Do not use an R&D draft as permission to merge, activate or deploy those independent changes.
