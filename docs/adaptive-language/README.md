# Adaptive Language Arts v1 — Family Game Factory

## The product

Language Arts is a second **host-owned learning engine** for Grades 1–4. A grown-up chooses **Math** or **Language Arts** for each child; both subjects require learning checkpoints in games. There is **no Off / creative-play-only option**. The existing Math 73-unit system, player profiles, game versions, trusted worker protocol, and cross-game question budget remain in place.

The initial implementation contains **48 supplemental language skill units (12 per grade) and 192 authored practice items (four per unit)**. It includes selected phonics and spelling patterns, vocabulary, grammar, short-passage comprehension, sentence construction/editing and unscored writing. Closed-response answers are checked by exact local evaluation, not a model. No paid inference, microphone or externally held child account is needed.

**Honest scope:** 48 units do not amount to IXL-equivalent complete curriculum coverage, a calibrated reading assessment, diagnosed reading ability, or demonstrated educational gains. Engineering tests are necessary, not a substitute for literacy specialist review or actual child practice.

## Child journey

A child invents or selects a game as before. The selected educational subject travels with the child, not the game or its version. At a safe game checkpoint, the trusted host pauses the same simulation, clears held inputs, and presents a compact Language Arts activity with large touch targets. A child may choose an answer, construct a word with tiles, rearrange sentence tiles, revise a sentence, read a short passage, or write an imaginative response. Longer creative-writing tasks are reserved for My Powers or completed-round checkpoints, never an active-play interruption. A worked explanation and three graduated hints make recovery supportive rather than punitive. The game then resumes the same state. Child-generated games cannot supply a correct answer, award proficiency, or bypass the host.

Optional browser read-aloud is tagged as supported participation. It cannot count as evidence that a child independently decoded target text. Open creative writing saves locally as **exploration, not a scored right/wrong answer**. Reading, listening, spelling, sentence editing and creative expression remain distinct forms of evidence.

The interface uses question-first focus to avoid surprising a tablet user with a keyboard, reduced-motion behavior, contained passage panes, touch-friendly controls, and clear assistance/continuation. All examples are local to the app and avoid provider latency.

## Instruction and adaptation

Learning units form an explicit prerequisite graph. Grade is a **parent-selected ceiling**, never a diagnosis or an estimate derived from a game score. Earlier-grade foundations remain available and existing higher-grade history is retained if the grade scope is lowered. Optional exact skill focus competes with review, confidence work and prerequisite instruction, not replacing them.

The model records first-answer correctness, raw submissions, hint depth, read-aloud use, date, actual response form, task ID, game, project, version, session and outcome. Invalid empty input is not a wrong answer. A supported correct answer is tracked separately from unaided success. An interrupted task is not fabricated into a failure. Skill evidence uses transparent labels (Still discovering; Learning with help; Solving independently; Remembered later), not an uncalibrated probability of mastery.

A conservative independent label requires at least four unaided correct tasks across at least two dates, at least three distinct examples and stable recent success. Remembered later additionally requires at least five independent examples, three dates, multiple due delayed reviews separated by at least 24 hours and a week of spacing. Review intervals use 1, 2, 4, 8 and 14 days. These are initial **product thresholds**, not psychometrically calibrated proficiency estimates.

Gentle keeps complexity low but can show a third authored example after repeated varied success. Balanced and Stretch can advance toward tier 2 and step back under sustained difficulty. Tier controls authored task challenge, not estimated reading age.

## Engineering layout

| Area | Source |
| --- | --- |
| Parent subject, game routing and reports | src/learning/host.ts, src/legacy/ui.js |
| Saved history, migration and backups | src/legacy/store.js |
| Curriculum and grade/prerequisite standards map | src/language/curriculum.ts, docs/adaptive-language/curriculum.md |
| Four local item banks | src/language/data-g1.ts through data-g4.ts |
| Deterministic item generator and answer oracle | src/language/content.ts |
| Evidence, retrieval intervals, selection and state validation | src/language/engine.ts |
| Child interaction and responsive styling | src/language/activity.ts, activity.css |
| Safe original-game and generated worker checkpoints | src/learning/host.ts, src/learning/remote.ts, src/runtime/lifecycle.ts |
| Automated content, model, UI and production integration tests | tests/language-content.test.ts, language-engine.test.ts, language-activity.test.ts, language-integration.ts |

The existing generated worker message type named math-checkpoint remains unchanged for backwards compatibility with reviewed immutable game runtimes. That name now represents a **subject-neutral host learning opportunity**; only the trusted parent host chooses Math or Language Arts. A wire-protocol rename would require synchronized renderer and host release, plus archived-version coverage.

## Pedagogical references and bounds

The development rationale draws from [IES foundational K–3 reading guidance](https://ies.ed.gov/ncee/wwc/PracticeGuide/21), [IES grades 4–9 reading intervention guidance](https://ies.ed.gov/ncee/wwc/PracticeGuide/29), [IES K–3 reading comprehension guidance](https://ies.ed.gov/ncee/wwc/PracticeGuide/14), and [Common Core ELA grade standards](https://www.thecorestandards.org/ELA-Literacy/).

Recognizing a written vowel pattern in a multiple-choice response is not proof of oral decoding or phonemic awareness; hearing a passage read aloud is not independent reading; composing a creative sentence has no single correct answer. Fluency, pronunciation, extended writing evaluation and complete grade-band coverage are **not** part of this v1 assessment claim.

## Release limits

No claim of educator approval or demonstrated child learning gains. Merge/deploy only after exact-head CI checks, literacy-specialist audit of the actual questions and hints, observed Grades 1–4 device sessions, privacy review, and an across-real-days pilot. The feature branch and draft PR are for review, not a silent production release. A local JSON backup contains sensitive child learning and personal writing and must not be published to public issues.
