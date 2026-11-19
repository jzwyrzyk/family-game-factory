# jems product doctrine

**Purpose:** canonical summary of existing product intent and principles. These are standards to build toward, not a claim that every capability is implemented or validated.
**Source review:** November 18, 2026 (America/New_York), application `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`.
**Scoped addition:** November 18, 2026, 11:52 p.m. America/New_York (`2026-11-19T04:52Z`), [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57), source `f650bdac730be9bb6655325b32052a9524880933`: the illustrated making journey described in section 7. Other principles retain their recorded review scope.
**Maintainer:** the author of a change that affects product behavior; the product owner resolves new product choices.

Read [current architecture](ARCHITECTURE-CURRENT.md) for implementation boundaries and [delivery state](DELIVERY-STATE.md) for what is planned, merged, deployed, activated and verified. A past feature document's draft/release wording is not current operational evidence. The [decision index](docs/decisions/README.md) preserves the reasons behind these commitments.

## 1. The child owns the idea and the creative judgment

jems removes the difficulty of implementing an idea while preserving the child's work of discovering what the idea should be. The intended result is both an engaging, functioning game and opportunities to notice, imagine, predict, test, explain and choose. AI help must leave meaningful choices with the child.

Support tuning, redesigning the interaction and rethinking the objective. An unusual mechanic must not be quietly replaced by the nearest template. A clear idea can move directly toward implementation; a desire to play ends optional questioning. When help or ideas are requested, provide useful scaffolding and progressively more concrete assistance. Preserve the distinction between the child's original idea, an AI suggestion and the child's adoption of that suggestion.

The [owner-approved coaching standard](docs/design-coach/GOLD_STANDARD.md) is the detailed behavioral contract. A software defect is the system's responsibility, not evidence of a child's poor thinking.

## 2. Deliver the actual playable experience

The requested player action must produce the intended visible consequence, and the essential payoff must happen. Collection without the requested growth, assembly without the launch, or a changed label without a changed mechanic does not fulfill an idea. Open-ended play can be complete without a manufactured win condition.

Establish correct function, then robust integration and verified repairs, then polish and observed enjoyment. Readable worlds, expressive art, responsive controls and rewarding feedback remain product requirements; a compile pass cannot substitute for them. Keep idea fidelity, game-form fit, technical playability and observed player experience as separate judgments. Record missing evidence explicitly instead of averaging it into a reassuring score.

See the [Game Intelligence standard](docs/game-intelligence/README.md) and [cross-vertical review](docs/game-intelligence/cross-vertical-standard.md). Automated checks and model opinions do not establish fun, engagement or educational benefit.

## 3. Choose the simplest method that preserves the intent

Choose a game's form from its actions and consequences. Rendering (2D or true 3D), input, simulation, visual style and goal/free-play mode are independent decisions. A robot does not imply 3D; a launch animation does not imply physical simulation.

Use actual physics when weight, contact, balance, momentum, suspension or another physical cause materially determines the requested experience, or when it is an explicit requirement. Preserve verified existing mechanics when editing a saved game. If an essential requirement exceeds the runtime's capabilities, explain the gap or resolve the choice; do not silently substitute an easier experience and claim completion. Reusable game families should support invention rather than confine every idea to the same game.

See [the game-form decision](docs/decisions/0002-intent-faithful-game-forms.md). The current runtime capability is an architecture fact, not a permanent limit on the product's ambition.

## 4. Experiments are recoverable; choosing a favorite is explicit

Keep the current playable game and earlier editions safe while a new experiment is built. New alternatives start from the selected main edition unless the child explicitly continues a particular test. Compare, Keep, Undo, copy and return must preserve ownership and provenance. Autosave protects work; it does not select a favorite, publish or silently promote an experiment.

While a build runs, the child can keep playing, make supported local edits and choose optional practice. A ready result must not seize focus, replace a newer decision or interrupt the learning host. Failure, cancellation, disconnection or a stale callback must not destroy the last working version. Report save failures honestly.

See [child continuity](docs/child-continuity/README.md) and [the ownership decision](docs/decisions/0001-child-led-creation.md). Supported local edits must change real mechanics; an unsupported novel request must identify the need for the builder.

## 5. Conversation, dictation and building have distinct actions

The coach helps understand intentions, examine friction and explore choices. The builder implements the agreed change. The runtime supplies observable evidence and protects versions. Conversation alone must not spend a generation budget or alter a game.

The approved voice interaction is **Speak → finish/transcribe → editable draft → explicit Send to jems → a normal text reply**. Build/Try a change is separate. Hear reply is optional and user initiated. Preserve the draft through cancellation, errors and navigation; late results must not appear in another player's project. Availability and fallback must be truthful.

Continuous listening, automatic send, voice-triggered builds and automatic favorite selection are outside this decision. See [the voice decision](docs/decisions/0003-explicit-voice-and-build.md) and [detailed acceptance contract](docs/issue-28/PUSH_TO_TALK_MVP.md). The active pilot and provider permissions belong in delivery state, not in this durable product contract.

## 6. Learning belongs to the trusted host and needs honest evidence

The parent-selected subject, grade boundary and learning settings travel with the child across games and versions. Game difficulty is separate from learning difficulty. The selected Math or Language Arts host controls activities, answers, assistance and progress; generated code cannot grade the child, bypass checkpoints or award proficiency. Additional practice while waiting is optional and does not replace ordinary required checkpoints.

Keep Math and Language Arts evidence distinct. Preserve independent responses, hints, corrections, read-aloud support, interrupted tasks and delayed retrieval as different observations. A grade is a content ceiling, not a diagnosis. A supported answer is not unaided recall; listening is not independent reading; creative writing is not a single right/wrong response.

Computational thinking and active problem solving are intended opportunities, not automatically validated scores. Engineering tests, game performance, clicks and session length do not prove mastery, intelligence, emotions or learning gains. Product thresholds require calibration and appropriate real-use evidence before stronger claims. See [Math](docs/adaptive-math/README.md), [Language Arts](docs/adaptive-language/README.md) and [coaching evidence boundaries](docs/design-coach/GOLD_STANDARD.md).

## 7. The experience must work across devices and retain its identity

Tablet/touch use and desktop/keyboard/mouse use are first-class product targets. Controls, layouts, voice recovery, focus, pause/resume and saved versions need evidence on the intended devices. A desktop screenshot or simulated mobile viewport does not establish actual tablet reliability. Preserve readable text, accessible targets, keyboard operation and reduced-motion behavior.

The brand is lowercase **jems**. Preserve the approved gem/wrench mark and wordmark; use the supplied assets and documented palette rather than inventing a replacement logo. Supporting characters, worlds, banners and rewards should form a coherent visual family. Keep learning and grown-up surfaces calm and legible. Do not describe reconstructed assets as certified masters without the required visual review. See [brand standards](docs/brand/README.md) and [journey acceptance](docs/child-journey/acceptance.md).

The making journey uses a bright white illustrated page, short labels, and two equally capable character choices that evolve across **Gem Maker → Gem Cutter → Gem Polisher → Gem Master**. The choices are cosmetic; do not label or store gender. Show the earned level separately from previews of future artwork. Popups celebrate a durably saved making transition without blocking play, taking focus, or replaying on reload/profile changes.

Making progress comes from saved child-authored design evidence, real experiments, the child's linked reflection, and explicit Keep of that same experiment. It is separate from learning assessment, game scores and provider activity. The initial Gem Master rule is three distinct polished projects, an implementation threshold rather than a calibrated measure of ability. Do not add currency, streak pressure or rankings to this journey. Retained work remains the authority: archives preserve evidence, while erasing required evidence removes its dependent credit. See the [detailed evidence contract](docs/brand/GEM_PROGRESS.md) and [making-journey decision](docs/decisions/0005-cosmetic-making-journey.md).

## 8. Truth, privacy and ownership are part of the product

Distinguish available local behavior, a real accepted remote job, an unavailable service and an unknown network outcome. Show grounded progress, never a fictitious ETA, generated game, saved result or successful deployment. A merge, image build, deployed service, activated capability and successful end-to-end journey are different facts.

Preserve deterministic identity, authorization, spending, isolation and version controls while improving convenience. Keep family data, transcripts, recordings, drawings, credentials and signed private URLs out of public repository examples and logs. Do not invent consent or provider privacy approval. A new feature, brand change or research result does not itself authorize unrelated data processing, spending or public sharing. Existing applicable owner authorization must be carried forward accurately.

## Changing this doctrine

Update the affected principle and its linked detailed contract in the same PR as a material behavior change. Record a consequential choice and its source in [a decision record](docs/decisions/README.md). Distinguish an owner decision, a research hypothesis and an implementation observation. Automated maintenance may flag conflicts and stale evidence; it must not silently rewrite product intent or turn a proposal into an accepted decision.
