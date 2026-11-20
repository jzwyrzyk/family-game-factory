# jems product doctrine

**Purpose:** canonical summary of existing product intent and principles. These are standards to build toward, not a claim that every capability is implemented or validated.
**Source review:** original doctrine audit November 18, 2026 (America/New_York), application `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`; the owner's subsequent style-diverse quality direction is recorded in [ADR0006](docs/decisions/0006-style-diverse-playable-quality.md), November 19, 2026 (UTC).
**Scoped addition:** November 18, 2026, 11:52 p.m. America/New_York (`2026-11-19T04:52Z`), [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57), source `f650bdac730be9bb6655325b32052a9524880933`: the illustrated making journey described in section 7. Other principles retain their recorded review scope.
**Integration review:** November 19, 2026: preserve the merged Creation Studio, style-diverse quality, learning/evidence and adult/guardian contracts on main `c4ce21be410e7fccb16922c4711f4c4172edbc7e` while adopting the owner-approved v1.2 visual library and PR57 making journey. [ADR0009](docs/decisions/0009-approved-brand-library-v1-2.md) records the accepted visual refinement; earning and authorization rules are unchanged.

**Rewards extension:** November 19, 2026: the owner subsequently requested shared lifetime gem increments, milestones and a cohesive Rewards page while reserving companion artwork and the companion system for separate work. [ADR0010](docs/decisions/0010-lifetime-gems-and-shared-rewards.md) records this additive earning policy; the creator-rank criteria and learning assessment remain separate.

**Companion extension:** November 19, 2026: the owner approved implementation of the separate companion framework, including funny encouragement and easy use in children's games. [ADR0012](docs/decisions/0012-pals-from-earned-activity.md) records the accepted engagement balance. Final character artwork remains a separate owner review.

**Historical first Gem Pal art tranche:** November 20, 2026: PR85 preserved the selected S–X Base boards, Pleeko/Talli/Whorl Grown portraits and Brio's two approved neutral forms from PR74. The original roster's later approved package 2.9 now resolves its former form/expression gaps in the [artwork index](docs/pals/art/README.md). Brio's six expressions retain their separate **in-review** status. Artwork approval does not assign a creature identity to the provisional three-Pal collection or change growth policy.

**Maintainer:** the author of a change that affects product behavior; the product owner resolves new product choices.

Read [current architecture](ARCHITECTURE-CURRENT.md) for implementation boundaries and [delivery state](DELIVERY-STATE.md) for what is planned, merged, deployed, activated and verified. A past feature document's draft/release wording is not current operational evidence. The [decision index](docs/decisions/README.md) preserves the reasons behind these commitments.

## 1. The child owns the idea and the creative judgment

jems removes the difficulty of implementing an idea while preserving the child's work of discovering what the idea should be. The intended result is both an engaging, functioning game and opportunities to notice, imagine, predict, test, explain and choose. AI help must leave meaningful choices with the child.

Support tuning, redesigning the interaction and rethinking the objective. An unusual mechanic must not be quietly replaced by the nearest template. A clear idea can move directly toward implementation; a desire to play ends optional questioning. When help or ideas are requested, provide useful scaffolding and progressively more concrete assistance. Preserve the distinction between the child's original idea, an AI suggestion and the child's adoption of that suggestion.

The [owner-approved coaching standard](docs/design-coach/GOLD_STANDARD.md) is the detailed behavioral contract. A software defect is the system's responsibility, not evidence of a child's poor thinking.

### One creation journey: games, scenes, and problem solving

The owner's November 19, 2026 direction adds child-facing computational practice to the creation experience. A child's game characters and ideas can become editable stories, animations, and behavior rules. Free creation and **watch a scene, then rebuild it** practice share meaningful actions; practice should help children gain control of their own creations. Children can start with a game, a story, or a challenge without a compulsory ladder.

The [first-creation journey](docs/child-journey/FIRST-CREATION.md), refined by the owner on November 20, begins with **Choose your character** and one **Let’s create** action. The two existing human makers, Spark and Nova, are equal cosmetic choices. The opening screen does not ask the child to jump into a ready-made game; existing play becomes useful during an acknowledged build. Returning creators and intentional direct entrances retain their existing routes. [The refinement decision](docs/decisions/2026-11-20-character-first-navigation.md) supersedes the former Explore-first invitation. Use brief contextual hints as the child imagines, waits, plays, tries a change, chooses a version and returns. Keep the child's ready result or unfinished intention easy to continue. The child can dismiss hints and show them again; those preferences are never achievements or learning evidence. A **Done for now** action must save through the existing guards and report a failed save honestly. The [decision record](docs/decisions/2026-11-19-first-creation-journey.md) preserves this approved scope.

Use demonstrated behavior, predictions, experiments, and revisions as specific formative observations. Allow equivalent working programs. An AI-authored scene, copied solution, or hint-supported attempt must not be counted as independent mastery. Critical thinking and computational thinking are intended capabilities, with no global thinking score or validated growth claim implied by this first implementation. [ADR0007](docs/decisions/0007-creation-and-rebuild-practice.md) records the accepted development direction; the [Creation Studio contract](docs/creation-studio/README.md) distinguishes current source adapters from the broader continuous-project vision.

## 2. Deliver the actual playable experience

The requested player action must produce the intended visible consequence, and the essential payoff must happen. Collection without the requested growth, assembly without the launch, or a changed label without a changed mechanic does not fulfill an idea. Open-ended play can be complete without a manufactured win condition.

A ready experiment must combine correct function with deliberate presentation, responsive controls, visible consequences and appropriate variation or expression. Polish is part of that acceptance floor, not work deferred until after a compile pass has made a game Ready. Keep idea fidelity, game-form fit, technical playability, presentation and observed player experience as separate judgments. Record missing evidence explicitly instead of averaging it into a reassuring score.

Hold pixel art, flat digital 2D, illustration, dimensional art and realistic treatment to equivalent standards of craft in their own styles. Preserve the child's chosen appearance and the identity of saved artwork through unrelated mechanic changes. Gem Factory can set a reference for finish without becoming every game's palette, theme or loop. A simple complete game can meet the standard; an open-ended toy does not need a forced win, and a beautiful static scene does not establish meaningful play.

See the [Game Intelligence standard](docs/game-intelligence/README.md), [presentation and playable quality contract](docs/game-intelligence/PRESENTATION-QUALITY.md), [style-diversity decision](docs/decisions/0006-style-diverse-playable-quality.md) and [cross-vertical review](docs/game-intelligence/cross-vertical-standard.md). Automated checks and model opinions do not establish fun, engagement or educational benefit. Human calibration and observed play remain separate evidence.

## 3. Choose the simplest method that preserves the intent

Choose a game's form from its actions and consequences. Rendering (2D or true 3D), input, simulation, visual style and goal/free-play mode are independent decisions. A robot does not imply 3D; a launch animation does not imply physical simulation.

Use actual physics when weight, contact, balance, momentum, suspension or another physical cause materially determines the requested experience, or when it is an explicit requirement. Preserve verified existing mechanics when editing a saved game. If an essential requirement exceeds the runtime's capabilities, explain the gap or resolve the choice; do not silently substitute an easier experience and claim completion. Reusable game families should support invention rather than confine every idea to the same game.

See [the game-form decision](docs/decisions/0002-intent-faithful-game-forms.md). The current runtime capability is an architecture fact, not a permanent limit on the product's ambition.

### Original drawings belong to the child across creations

The [Art Studio](docs/drawings/ART_STUDIO.md) is a dedicated place to import or draw pictures, prepare separate derivatives, develop meaningful parts and motion, and reuse chosen versions in games and scenes. Preserve original pixels and the child’s decisions. A saved use pins the chosen image or movement revision; later library edits cannot silently change an earlier adventure. Keep local storage, export/restore and missing-asset recovery explicit. Supported physical and block-scene adapters do not imply arbitrary generated-game compatibility, universal recognition or cloud synchronization. [The accepted decision](docs/decisions/2026-11-19-private-art-studio.md) records this extension.

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

The owner's November 19, 2026 direction adds [formative problem-solving observations](docs/problem-solving/README.md) across the three existing mechanisms and game creation. Quiet source context and optional structured reasoning opportunities share provenance, not a combined ability score. Keep six dimensions distinct: define, compare, test, interpret, revise and transfer. A missing opportunity remains unknown; a failed initial prediction can be followed by useful revision; no recorded hint does not prove no outside help. Neutral access support and reasoning assistance have different effects on the construct being observed. Only known task rules may produce a structured result; arbitrary chat, game complexity and AI-authored work cannot earn competence credit. [ADR0011](docs/decisions/0011-formative-problem-solving-evidence.md) records the accepted design. Independent benchmark research remains separate from this formative layer, and early/recent records do not establish calibrated growth.

### Parent reporting follows the evidence

The [parent area](docs/parent-progress/README.md) should help a parent see what happened, inspect the supporting example, and choose a useful next step. Keep Math, Language Arts, Computational Thinking and Problem Solving distinct. Clearly separate recent retained records from accumulated skill history, and observed task performance from standards coverage or validated assessment results. Unknown evidence is not a deficit; recorded help is context for teaching. Explain connections to familiar products and frameworks without converting scores or implying an overall grade level. Recommendations and exports must remain profile-specific and grounded in existing records. See the [parent reporting decision](docs/decisions/2026-11-19-parent-evidence-reporting.md).

## 7. The experience must work across devices and retain its identity

Follow [Child interface: clear at six](docs/brand/CHILD_INTERFACE.md): remove redundant reading load, keep visible child labels at least 18px and main instructions at 20px, and check foreground/background contrast in the actual composed task and its help/error states. Question screens lead with the actual question; assessment interpretation belongs in parent reporting. Optional reading uses a deliberately chosen warm female local voice with truthful availability and immediate cancellation. Device audio quality remains a separate acceptance check.

Tablet/touch use and desktop/keyboard/mouse use are first-class product targets. Controls, layouts, voice recovery, focus, pause/resume and saved versions need evidence on the intended devices. A desktop screenshot or simulated mobile viewport does not establish actual tablet reliability. Preserve readable text, accessible targets, keyboard operation and reduced-motion behavior.

The brand is lowercase **jems**. Preserve the approved gem/wrench mark and wordmark; use the supplied assets and documented palette rather than inventing a replacement logo. The host's supporting characters, banners and rewards should form a coherent visual family. Child-created game worlds can have distinct styles; host brand consistency must not flatten their creative choices into one house look. Keep learning and grown-up surfaces calm and legible. Do not describe reconstructed assets as certified masters without the required visual review. See [brand standards](docs/brand/README.md) and [journey acceptance](docs/child-journey/acceptance.md).

The approved [v1.2 library](docs/brand/LIBRARY_V1_2.md) carries that identity across the shell: the supplied ray-free SVGs, a separate five-pose Gem companion, preserved factory artwork, local Nunito/Inter fonts and consistent control states. Rank thumbnails use the chosen Spark/Nova character in the exact original outfit holding its level gem across Journey, cards and earned popups. Keep the soft original characters; retired metal medals and generated replacements do not return. Shared shell styling does not constrain the visual style of a child-created game.

The shell keeps **My Games**, **Create** and a labelled **Menu** as its three ordinary primary actions. Secondary creative, progress, learning, help and grown-up destinations remain accessible in the menu; parent access is available even before character selection. Mobile navigation must leave game and editing controls usable.

The making journey uses a bright white illustrated page, short labels, and two equally capable character choices that evolve across **Gem Maker → Gem Cutter → Gem Polisher → Gem Master**. Once chosen, only that player’s human maker appears in the host’s profile, banners, journey cards and earned celebrations. Before selection, use neutral gem imagery outside the explicit two-character chooser. Changing the character must update those surfaces without resetting work, changing earned ranks or replaying rewards. Gem Pals, the separate Gem brand helper and children’s own game artwork retain their identities. The choices are cosmetic; do not label or store gender. Show the earned level separately from previews of future artwork. Popups celebrate a durably saved making transition without blocking play, taking focus, or replaying on reload/profile changes.

Making progress comes from saved child-authored design evidence, real experiments, the child's linked reflection, and explicit Keep of that same experiment. It is separate from learning assessment, game scores and provider activity. The initial Gem Master rule is three distinct polished projects, an implementation threshold rather than a calibrated measure of ability. Retained work remains the authority for maker rank: archives preserve evidence, while erasing required evidence removes its dependent credit. See the [detailed evidence contract](docs/brand/GEM_PROGRESS.md) and [making-journey decision](docs/decisions/0008-cosmetic-making-journey.md).

The shared [Rewards experience](docs/rewards/README.md) adds nonspendable lifetime gems from trusted, durably saved learning completions, qualifying developed games, scene challenges and documented milestones. The same completion reward applies with appropriate assistance; do not incentivize avoiding help or claim that gems measure proficiency. Gems cannot buy the four maker ranks, and there is no additional XP level. Use one stable receipt per qualifying fact, recoverable source outboxes, explicit backup/reset semantics and isolated family/adult records. No automatic historical backfill, streak pressure, rankings, shop or cloud balance is introduced. Previously committed gems survive removal of individual source evidence; explicit profile/family erasure and backup replacement remain separate actions.

### Companions make progress useful and playful

[Jem Pals](docs/pals/README.md) provide an earned collection, visible growth, short funny reactions and characters children can immediately use in editable scenes. Glim and Kip offer equally useful free starter choices; the other starter and Riff become available at transparent lifetime-gem targets. Collecting does not spend gems. Growth follows completed activities while that Pal is taken along, with no reward for tapping a portrait, waiting or keeping the app open. There are exactly two forms, Base and Grown. [The compatibility policy](docs/decisions/0013-two-form-pals-and-current-main.md) preserves the first earned transition at five adventures and all original receipts; it does not infer a numerical threshold from artwork approval.

Use clear goals, anticipation, expressive personalities and creative utility to encourage return visits. Avoid paid luck, subscription pressure, disappearing companions, care chores, lost-progress threats and guilt about taking breaks. A funny line should respond to something the child did, stay brief, and never ridicule a mistake or claim the Pal needs the child emotionally. Parent controls can hide appearances and encouragement without reducing earned growth.

Pals remain separate from the Gem brand helper and the Spark/Nova maker choices. A Pal can delegate to an existing host hint, retaining recorded assistance; it cannot grade answers, award currency, bypass a checkpoint or become an unbounded AI relationship. Editable Pal starter programs retain their starter attribution and do not prove independent coding ability. Existing approved gem tokens are functional preview art until the separate character-art review.


**Approved core emotion artwork and application previews (November 20, 2026):** The owner approved all 184 core images for 23 original individual Gem Pal profiles: 46 Base/Grown neutral masters and 138 form-specific expressions. The [expression runtime decision](docs/decisions/2026-11-20-pal-expression-runtime.md) implements exact versioned artwork previews, same-character/same-form neutral fallback and a finite Wink Base motion pilot. Preview selections have no collection, growth, scene-save, learning or reward authority; the saved Glim/Kip/Riff IDs retain their existing meanings. Brio remains an independent profile with two approved neutrals and six expressions in review. Source, merge and production acceptance remain separately recorded in delivery state.

### Gem Pal character design

The [Gem Pal Studio method](docs/pals/STUDIO.md) governs companion artwork: invent purposeful gem anatomy from useful inspirations, give the Base a complete identity, and develop one recognizable Grown form through meaningful changes in structure or movement. The current art scope is two total forms and one transition; it is separate from the four maker ranks and any runtime earning thresholds. Preserve exact selected references across edits, one character per individual profile, and form-specific anatomy during expressions. Art approval, expression approval, animation compatibility and in-game acceptance remain distinct. [The accepted method](docs/decisions/2026-11-19-gem-pal-studio.md) makes this reusable in repository work; it does not establish that a companion collection or final art is integrated.

## 8. Truth, privacy and ownership are part of the product

Distinguish available local behavior, a real accepted remote job, an unavailable service and an unknown network outcome. Show grounded progress, never a fictitious ETA, generated game, saved result or successful deployment. A merge, image build, deployed service, activated capability and successful end-to-end journey are different facts.

Preserve deterministic identity, authorization, spending, isolation and version controls while improving convenience. Keep family data, transcripts, recordings, drawings, credentials and signed private URLs out of public repository examples and logs. Do not invent consent or provider privacy approval. A new feature, brand change or research result does not itself authorize unrelated data processing, spending or public sharing. Existing applicable owner authorization must be carried forward accurately.

For the accepted temporary development scope, the adult profile lives on the existing site and its authenticated switch makes approved AI tools available directly. Keep a permanent **Menu → Grown-ups → Private parent session** entry that explains missing connection, disabled testing, required approval or current access. Its visibility grants no authority. Keep adult test work separate from child profiles and retain server authorization; a profile label is not evidence of consent or age. Conversation, game building and dictation each report their actual availability. [ADR0005](docs/decisions/0005-temporary-adult-profile.md) records the owner's one-site requirement, temporary scope and removal condition. It does not change the child's Send, Build, Keep or learning contracts.

## Changing this doctrine

Update the affected principle and its linked detailed contract in the same PR as a material behavior change. Record a consequential choice and its source in [a decision record](docs/decisions/README.md). Distinguish an owner decision, a research hypothesis and an implementation observation. Automated maintenance may flag conflicts and stale evidence; it must not silently rewrite product intent or turn a proposal into an accepted decision.
