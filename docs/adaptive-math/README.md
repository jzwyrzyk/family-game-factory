# Adaptive Math v1 — grades 1–4

> **Feature contract with historical implementation status.** References below to draft PRs, opt-in Studio and pending release describe the original review. Use [DELIVERY-STATE.md](../../DELIVERY-STATE.md) for current integration and release evidence. The learning model, scope limits and recorded acceptance evidence remain relevant; this banner does not claim educational validation.

## What this change delivers

A shared, deterministic learning service now connects the original games, local remixes, the Studio draft, generated previews, and My Powers. It adjusts the next activity using the child's actual practice history; game scores and game difficulty never establish mathematical proficiency.

The release includes 73 bounded supplemental skill units across grades 1–4, progressive hints and worked examples, answer-building interactions, conservative evidence states, spaced review, confidence practice, and a host-owned game checkpoint protocol. It requires no inference call, credentials, cloud provisioning, or paid activation to generate or check math.

This is the implementation of the learning-model phase. It does not certify a complete school curriculum or demonstrated learning gains. The code and automated acceptance gates can be reviewed now; educator review and a pilot across real elapsed days remain release-validation work. [The curriculum catalog](curriculum.md) states the exact coverage and limits.

The [formative problem-solving feature](../problem-solving/README.md) can observe newly completed Math activities as subject context. It preserves this engine's grading and support semantics; an arithmetic answer, correction or hint count is not automatically scored as a general APS skill. Optional reasoning practice remains separate from required Math checkpoints and uses its own declared opportunities.

The math component was developed in [draft #19](https://github.com/jzwyrzyk/family-game-factory/pull/19). It is now combined with the current physical games and child journey in [integrated draft #21](https://github.com/jzwyrzyk/family-game-factory/pull/21); that review's checks are the authority for the combined application. The ordinary arcade path still works. Add `?studio=1` to the development URL to inspect Studio integration. Opening or testing the draft does not merge it, change the live Pages site, provision cloud services, or enable the paid agent.

## Gaps bridged

| Earlier gap | Implemented behavior | Main evidence |
| --- | --- | --- |
| Small arithmetic-only bank | 73 standards-tagged skill units: 16 grade 1, 16 grade 2, 19 grade 3, 22 grade 4 | Content oracle, grade/range checks, prerequisite graph checks |
| Exact fact targets replaced every question | Targets receive focus slots; review, familiar practice, and supporting skills remain in the sequence | Target-mixing and repetition tests |
| Intensity had no selection effect | Gentle, Balanced, and Stretch change the practice mix; recent independent success raises local challenge and repeated difficulty lowers it | Selection and challenge tests |
| Weakness inferred from one low smoothed percentage | Small samples remain “Still discovering”; recent repeated difficulty can prioritize a skill and its prerequisites | Limited-evidence and recovery tests |
| Only eventual correct answers were saved | Each valid wrong answer and hint event is saved immediately; interruptions remain visible without inventing a failed response | Engine and browser abandonment tests |
| Rapid repetition advanced long review intervals | Review advances only on a due independent retrieval at least 24 hours after the previous qualifying retrieval | Clock-controlled spacing tests |
| One hint after an error | Three authored hint steps, help before error, and a worked example with a supportive exit | Content and activity tests |
| Assisted success counted like recall | First response, hints, correction, outcome, and actual representation are recorded separately | Hint, correction, constructed-answer tests |
| Generated games had no learning integration | Trusted host handles math outside the isolated worker; native and preview games pause and resume safely | Production integration and worker-security suites |
| A child could disable math | Three presentation modes, no Off option; frequency is at least one eligible activity per rolling budget | Policy, migration, and parent-setting tests |
| Game changes could lose the learner context | Attempts include child-owned state and game/project/version/session provenance; switching versions does not replace the learner | Profile/remix integration tests |
| Unsupported saved learning could be overwritten | Strict version validation, preserved original recovery data, blocked writes, compatible-backup restore | Real-store import/recovery tests |

“Implemented” describes code paths and tested contracts. The acceptance record distinguishes checks actually executed from checks awaiting an available browser environment.

## Learning model

### Inputs we use

The child profile supplies a grade scope, optional skill or multiplication-fact focus, intensity, question budget, and help/challenge preferences. The grade is an upper content boundary, not a prediction of ability. Earlier-grade skills remain available; lowering the grade retains higher-grade history.

### Profile grade and difficulty setup

Each child profile now shows its saved **Grade · Difficulty** inside the player menu, with **Set learning level** until setup is confirmed and **Change learning level** afterward. The editor explicitly selects one of the reviewed grades 1–4 and **Gentle**, **Balanced**, or **Stretch**. The same settings appear under **Grown-ups → Settings**, labelled with the active learner's name. These controls edit the existing profile, not a second learner record.

New child profiles start at **Grade 1 / Gentle**, including the second starter profile that previously shipped with a grade-3 multiplication preset. Missing grades no longer infer a school level from age. Existing explicitly saved grades and valid difficulty settings remain intact; the setup reminder asks for confirmation without silently lowering a legitimate setting. Missing/invalid difficulty starts Gentle. The reminder does not cover character-first onboarding or prevent ordinary navigation. Adults' isolated test workspace does not show the child setup control.

Both subjects enforce the saved grade as an upper content boundary, including Stretch, review, older fact targets, and prerequisite selection. The grade never rises automatically with age, game level or success. Lowering the ceiling preserves higher-grade learning history. Difficulty changes the authored challenge and practice mix within that boundary; it does not set game difficulty. A parent can adjust either setting later.

Saving the short editor confirms setup only after the existing profile store succeeds. A failed save restores the previous grade, difficulty and confirmation state. Escape/Not now discards unsaved edits; a profile change closes the editor and prevents a late save from changing the next child. Editing is unavailable during an active learning activity; existing Grown-ups navigation remains available for leaving that activity safely.

An attempt records the item and its mathematical parameters, actual representation, tier, purpose, session, game/project/version, start and finish times, valid raw answers, hint depth and events, and outcome. Invalid input such as an empty field is input feedback, not evidence of a mathematical error. Skipping or leaving an unanswered activity is not a wrong answer.

We do not infer emotion, intelligence, attention diagnoses, or disability from clicks or response time. A fast/slow game outcome does not alter answer correctness. Error patterns are narrow, tentative descriptions—currently repeated addition-for-multiplication or neighboring-product responses across different facts—and do not label the child.

### Selection and adjustment

The initial policy is transparent and inexpensive:

| Setting | Intended repeating mix | Challenge behavior |
| --- | --- | --- |
| Gentle | 25% focus, 50% familiar practice, 25% review | Tier 0, with more visual requests |
| Balanced | 50% focus, 25% familiar practice, 25% review | Starts within the skill; advances after varied independent success and steps down with repeated support needs |
| Stretch | 40% focus, 20% review, 20% readiness, 20% familiar practice | Same evidence-driven adjustment, with explicit opportunities to try a next step |

These are selection slots, not a guarantee that every short session contains those percentages. If there is no established familiar skill, that slot becomes a low-tier supporting probe. If no review is available, the policy uses an eligible readiness activity. Exact targets remain subject to the grade ceiling. Recently repeated items and skills are avoided where the candidate pool permits.

Four recent independent successes spanning at least three examples can raise local challenge to tier 2. Two recent supported/error presentations lower challenge; repeated difficulty in a focus skill can select a relevant prerequisite. Gentle remains tier 0. A readiness probe with unestablished prerequisites also stays at tier 0. These changes affect local challenge only; they do not establish across-day retention.

Tier numbers are authored complexity controls, not calibrated difficulty estimates. Some templates vary numerical complexity more strongly than others. Returning to a prerequisite or providing a representation is often a more useful adjustment than changing the number range alone.

### Evidence states and retention

The UI deliberately avoids a “mastery probability.” It shows:

| UI state | Interpretation |
| --- | --- |
| Still discovering | There is not yet enough independent evidence to make a stronger statement |
| Learning with help | Recent repeated supported/error presentations suggest useful teaching or prerequisite work |
| Solving independently | At least four independent successes across at least two dates, enough different examples, and sufficiently reliable recent responses |
| Remembered later | At least five independent successes across at least three dates and two actual representations, with delayed retrieval at least a week after first success, plus reliable recent evidence |

These are conservative product rules, not standardized assessments. Separate dates alone do not advance a review interval: qualifying retrievals must also be at least 24 hours apart and due. The initial review intervals are 1, 2, 4, 8, and 14 days. Early practice does not postpone a due review. Supported work returns the review horizon toward the next day. A single success is neither a weakness nor mastery; old errors stop dominating after recovery.

An independently solved visual task shows that the child solved that visual task without requested help. It is not automatically evidence of rapid symbolic fact recall. The actual representation is preserved for this reason.

### Teaching and confidence

Every item includes three concept/strategy/next-step hints and a worked solution. Help is available before a mistake. The optional automatic-hint preference determines whether the next hint appears after a wrong answer; it does not remove access to help.

After three wrong responses, the activity offers the worked solution and a “Continue playing” route. A child can request the worked solution sooner. That outcome remains supported/shown practice; it never becomes independent success. The activity does not trap a child in an infinite retry loop.

The existing parent-selected Original Challenge remains an explicit optional game consequence. It is off by default. In Splash or Pass, the first wrong response can end the run when that option is enabled. Other original challenge consequences retain their existing behavior. An ordinary mid-play learning checkpoint does not manufacture a lost game or erase its progress.

## Math remains part of every game

Children can choose a mode for a game:

- **Math at a pause:** a question at a safe checkpoint, with optional visual support.
- **Build, move & solve:** an interactive mathematical answer where supported—place-value quantities, fractions, or answer tiles. Written answers remain available for content that has no suitable construction.
- **A mix of both:** mathematical construction and a written-answer route within the same attempt.

The current interaction implementation is a host-owned mathematical mission inside the game flow. Its quantities/fractions are genuinely constructed and checked. It does not claim that every original game's physics has been redesigned around a mathematical operation; bespoke in-world mechanics can be added through the same service later without forking the learner model.

Mode requests in Studio and the existing remix/build prompts are handled locally. A request to remove all math explains the allowed choices. Math-format changes leave the game's immutable revision history and the child's evidence intact. Each game can use a different mode; the learning history remains shared by child.

### Timing and pausing

Math may be offered after a completed round or at a safe mid-play checkpoint. The original games expose an explicit `isPlaying/pause/resume` contract. During a learning checkpoint, simulation updates stop, held inputs are cleared where applicable, and the game mount becomes inert. Learning time is excluded from the recorded play duration. The mid-play trigger is initially 90 active, visible playing seconds; it waits until the game can safely pause.

The shared rolling question budget is 1–8 eligible activities per ten minutes, with a minimum separation between opportunities. The budget is shared across games and versions for the child, so changing games does not create a burst of questions. A floor of one means the setting cannot remove math altogether; it does not mean every ten-minute window must contain an activity regardless of whether a safe opportunity occurs. My Powers is child-initiated practice and does not consume the game checkpoint budget.

Generated previews receive only a narrow connect/pause/resume message. The worker never receives the learner's name, record, selected answer, or authority to change mastery. The trusted renderer reports a validated round/checkpoint identity; the host checks the source frame, random channel, artifact identity, owner, and event bounds. Duplicate messages cannot create duplicate attempts. [Integration contracts](integration.md) specify the lifecycle.

## Persistence and compatibility

The existing browser state key and profile identity remain in place. New learning state is version 2 inside each profile. A one-way compatibility adapter keeps existing fact callers working while all active selection and grading use the new engine. The old independent `legacy/math.js` implementation is retired.

Legacy counters migrate without inventing historical response strings, session dates, or representation diversity. Imported streaks cannot establish remembered-later status. Raw attempt history is bounded to 120 entries and per-fact summary storage to 1,500 entries; aggregate skill evidence survives detailed-history pruning. Compatibility counters and existing family data are retained. Storage remains browser-local with JSON backup/restore; this change does not create cross-device sync or a secure parental login.

Invalid/future learning state is rejected at restore time without replacing the working data. If such a state is already in local storage at startup, the original raw data remains exportable and saving is blocked. The app asks the grown-up to preserve it and restore a compatible backup. A storage quota failure is shown; the app does not claim that practice was durably saved when the write failed.

## Implementation and validation phases

| Phase | Result |
| --- | --- |
| Curriculum and contracts | Authored bounded catalog, grade eligibility, prerequisites, exact answer evaluation, representations, hints |
| Adaptive engine and persistence | Evidence stream, local challenge adjustment, focus/review/confidence mix, spacing, recovery and migration |
| Learning activities | Keyboard/touch entry, answer construction, progressive help, bounded recovery, meaningful progress descriptions |
| Game integration | Original-game pause/resume, shared native checkpoints, secure generated-preview bridge, Studio/local prompt and mode integration |
| Automated verification | Content oracle, synthetic multi-day histories, import/recovery tests, lifecycle/policy checks, browser regressions and production integration suite |
| Release validation | Review complete UI evidence; educator content review; observed child sessions and delayed-return pilot before claiming learning effectiveness |

The code and tests for every implementation phase are included in this draft. The final row requires real reviewers and elapsed child practice; it cannot be replaced by synthetic test data.

## Practical review sequence

1. Run `npm ci`, `npm run build`, and `npm run test:unit`.
2. Install the pinned browser with `npx playwright install --with-deps chromium`, then run `npm test`.
3. Open the local app, choose a grade and optional skill focus under Grown-ups, then try My Powers. Request a hint before answering, correct a mistake, and leave an unanswered question. Inspect the resulting report and reload it.
4. Open each original game. Complete a round or keep construction active long enough for a safe checkpoint. Confirm that the game resumes in the same state.
5. Open `?studio=1`, select a starter, and ask for math at checkpoints, inside the game, and both. Try “remove math.” Verify game revisions and learning history independently.
6. Review the trusted generated-preview tests and screenshots. A mocked provider demonstrates integration, not a paid real-agent run.

See [acceptance evidence](acceptance.md) for executed checks and remaining gates, and [curriculum](curriculum.md) for all 73 units.

## Research grounding and tuning limits

The design translates the prior benchmark into a practical system: explicit instruction and mathematical representations, worked examples and graduated help, retrieval after delay, and interspersed familiar practice. Relevant primary guidance includes the [IES elementary math intervention guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/26) and [IES organizing instruction and study guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1). Official Common Core content sources are linked in the curriculum catalog.

Those sources motivate principles; they do not validate this product's exact four-success threshold, three-error recovery rule, 90-second checkpoint, question ratios, or review intervals. All are adjustable initial product settings. We should tune them from actual use while tracking independent later performance, assistance, abandonment, checkpoint burden, and child feedback. Session length or game engagement alone is not a learning-success metric.

## Child presentation refinement

The actual question appears first. Redundant purpose/skill labels and generic encouragement are removed; necessary representation guidance, diagrams, hints and worked examples remain. Ordinary child labels/controls use an 18px floor and main instructional text uses 20px. Both subjects use the shared light learning surface with separate accents. Game results retain their own palette. See the [learning workspace standard](../learning/LEARNING_WORKSPACE_STANDARD.md). The [shared child-interface contract](../brand/CHILD_INTERFACE.md) sets the target; source evidence and required-checkpoint behavior are unchanged.


## Optional question and help narration

The question and displayed choices have a persistent speaker control; hints and worked examples have their own **Read the help** control. Reading is explicit and stoppable, and unavailable audio leaves written content and the speaker visible with a short notice. Submission, replacement content, completion, disposal and profile/navigation changes cancel pending and active speech. Reading the question is access to its wording: it neither computes the answer nor records a mathematical hint, and does not change arithmetic scoring. Revealing a hint or worked example still records its ordinary assistance evidence before it can be narrated. The [shared read-aloud contract](../speech/READ_ALOUD.md) defines authorized natural narration, device fallback, cancellation and validation limits.
