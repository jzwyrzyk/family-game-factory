# Problem-solving observations

**Scope:** an owner-authorized formative feature alongside Math, Language Arts and computational practice. Development began November 19, 2026 from `5f2c97e6fdbbd90845fcc274298c8052221d94f6`, after PR62. Source implementation, merge, deployment and educational validation remain separate; see [delivery state](../../DELIVERY-STATE.md).

The feature keeps specific evidence of what a learner chose, tested, understood or revised. It combines quiet records from existing activities with optional short, authored reasoning challenges. It does not infer a general ability score from a conversation, the quality of an AI-generated game, or time spent playing.

## What counts as evidence

| Source | What can be retained | Interpretation |
| --- | --- | --- |
| Math | A completed host-owned activity, its identity/outcome and recorded support | Existing Math evidence stays in its subject. Correct arithmetic alone is not an APS observation. |
| Language Arts | A completed host-owned activity and recorded support; creative work remains exploration | Reading, listening and writing stay distinct. An ELA answer does not automatically demonstrate reasoning. |
| Creation Studio | A check linked to the tested scene/challenge, outcome, assistance history and specific finite subchecks | Concrete computational practice context. Passing a generated or copied scene is not independent child mastery. |
| Studio conversation and game development | Child/helper provenance, a recorded prediction, experiment, observation or revision reference | Context for understanding activity. A nonempty sentence or a successful build cannot earn APS credit. |
| Structured problem-solving practice | A committed choice for a known opportunity, its deterministic rule result, support and task identity | A specific prompted demonstration on that task. It does not establish broad competence or independent assessment. |

All five sources use one record vocabulary; Math, Language Arts, computational thinking and APS retain separate interpretations. Ordinary subject scores are not averaged into a fourth score. Context records never become scored structured evidence merely because they share the ledger.

## Six dimensions, with explicit coverage

| Dimension | Useful observable behavior | First implementation |
| --- | --- | --- |
| Define the problem | Identify the goal and a relevant success condition | Represented in the model; no automatic competence claim |
| Compare ideas | Compare meaningfully different options against a goal | Represented in the model; no automatic competence claim |
| Plan a test | Choose a relevant check or a comparison that addresses the question | Authored practice opportunities |
| Use the result | Identify what a displayed result supports | Authored practice opportunities |
| Revise an idea | Choose a suitable change after seeing a result | Authored practice opportunities; causal justification is not established |
| Try in a new situation | Apply a principle in a materially different context | Represented in the model; a new picture alone does not establish transfer |

An unoffered, skipped or interrupted opportunity is **unobserved**, not a wrong response. A software failure is invalid evidence. Only a valid response to a defined opportunity can be marked demonstrated or not yet demonstrated. The earliest relevant response per dimension within an episode supplies the descriptive result; many clicks in one episode do not create many independent demonstrations.

## Child journey

The reasoning practice is optional and can be left without losing access to games. Three original task families offer a small sequence: choose a useful test, look at a supplied result, then choose a revision. The first content bands serve grades 1–2 and grades 3–4. They adjust language and task demands; they are authored bands, not calibrated grade norms.

| Family | Playful task | What the deterministic rule can observe |
| --- | --- | --- |
| Robot stop | Help a robot stop on its gem | Relevant movement change, correct reading of the resulting position, and a plan that reaches the goal |
| Gem delivery | Deliver the whole parcel | A test that retains the stated parcel constraint, interpretation of the chosen route, and a suitable delivery plan |
| Ready gate | Try a gem-count rule | A relevant input/check, interpretation of its displayed result, and a rule matching the stated goal; the older band introduces a boundary case |

Each family first records a prediction without awarding an APS result for prediction accuracy. Matching a supplied result or choosing a suitable revision is a narrow prompted observation. The current task does not establish why the child chose it, an independently devised experiment or a causal explanation.

The child entrance is **Try an idea**, also addressable with `?problem-solving=1`. My Powers provides the selected profile's child observation view. The existing parent dashboard includes the same source in Overview, Skills & progress and Evidence journal; its Settings tab keeps the selected-profile clear action and family backup controls.

The flow preserves first decisions before teaching feedback. A wrong prediction followed by a useful, child-authored revision is legitimate evidence of revision. Planned test results are information the child is meant to use. A coach or hint supplying the next strategy is different and must remain visible in the evidence.

Help is available without punishment. The data separates access support, strategy help, solution help and unknown support, as well as learner/shared/helper/unknown authorship and prompted/spontaneous/unknown activity. No in-app help recorded means exactly that; the browser cannot prove that no adult or external AI helped. Neutral reading of an APS direction does not, by itself, disqualify reasoning evidence or establish independent reading.

## Reports and claims

Reports show specific dimensions, task examples, observed opportunities, recorded support, repeated exposure and incomplete coverage. They distinguish structured practice from activity context. They can say that a particular choice met a particular task rule. They cannot turn a count into a validated mastery probability, a school percentile, a thinking level or a claim that Jems caused improvement.

The retained early and recent observations are descriptive records. They are not equated baseline/post forms. Changes in task difficulty, familiarity, assistance, source or opportunity mix can change outcomes without a change in skill. A trend needs comparable tasks and administration; a growth scale needs measurement research.

Independent assessment remains the separate [PR54 research track](https://github.com/jzwyrzyk/family-game-factory/pull/54). Its human-scored APS rubric, protected benchmark forms and external outcomes are not activated by this feature. The [benchmark comparison](BENCHMARKS.md) identifies useful precedents and their limits.

## Persistence and privacy boundary

Evidence is local to the browser and profile, including the existing adult workspace namespace. The feature adds no model call, external transcript analysis, cloud ingestion or new provider capability. Records carry short trusted facts and references, not a duplicate conversation archive or psychological profile. The shared family backup coordinator covers this fifth source together with existing family data and rewards. It validates schema and family ownership before mutation, journals exact originals, restores them after failure and invalidates open drafts after replacement. Legacy backups without this section restore an empty observation workspace; legacy four-source recovery journals restore only the keys they originally captured.

Storage is bounded and discloses when older middle records have been discarded. Saving or restoring must not silently erase valid data. Failure of an optional background observation must not turn an already saved game or answer into a failure; the evidence surface must report its own inability to save.

## Development references

- [Implementation and acceptance](IMPLEMENTATION.md): data, source boundaries, persistence, tests and remaining work.
- [Standards and assessment comparisons](BENCHMARKS.md): primary sources and claim limits.
- [Accepted decision](../decisions/0011-formative-problem-solving-evidence.md): why the background layer and structured opportunities are combined.
- [Math](../adaptive-math/README.md), [Language Arts](../adaptive-language/README.md), [Creation Studio](../creation-studio/README.md) and [design coaching](../design-coach/GOLD_STANDARD.md): source evidence remains subject to its original contract.

## Integration with the making journey

The PR57 visual library and **My journey** remain the shared host experience. **Try an idea** is an optional destination, with the same profile selection and active-learning guard. Changing destinations dismisses the maker picker and preserves saved Creation/practice work. Cosmetic maker progress and reasoning observations keep different criteria: a character choice, displayed rank or kept game does not establish a reasoning skill, and practice results do not award a maker rank.

The same guarded shell also includes **My rewards** and the companion extension’s **My Pals**. The compact shell exposes My Games, Create and Menu; Try an idea and My Powers remain in the menu with their existing learning guards. Moving destinations does not change APS activity or evidence authority. APS does not change the accepted lifetime gem schedule or mint a new practice award. Successful subject/Creation/Studio saves preserve their reward outbox before the optional APS observer runs, and an observer failure cannot undo that saved work or its reward eligibility.

## Optional spoken directions

Idea Workshop uses the [shared explicit narrator](../speech/READ_ALOUD.md) for current authored directions and already revealed hints. Read, Stop and Play states preserve the current request when a mobile browser requires another gesture. The optional private natural voice has its own default-off authorization; eligible local female English voices remain the device path. Access support is recorded only when playback starts, and a missing voice adds no support event. Narrating a revealed hint retains its strategy-support history. These audio changes do not alter reasoning outcomes or grade bands. See [Child interface: clear at six](../brand/CHILD_INTERFACE.md).
