# Objective 2 — Math & ELA independent assessment instruments (grades 1–4)

**Status: RESEARCH ENGINEERING IN PROGRESS.** Source snapshot 2026-11-18. **No educators have reviewed the forms, no students have been tested, no item bank has been calibrated, and no assessment has been integrated with the live child app.** These are original Jems assessment *blueprints* benchmarked to Michigan education requirements, **not** M-STEP, Michigan K–2, MAP, Star, IXL or a validated replacement.

## One-page decision
The child still creates/plays games without delays. The independent grade-appropriate benchmark takes place separately from the learning coach and game engine. Pre-/post-/retention sessions are scheduled as an optional parent/research activity, not generated on the fly in chat. Assessments never expose solutions during testing. Performance is measured independently; assisted responses cannot establish mastery.

### Live files
- [All **24** A/B/C grade-subject blueprints, 915 planned item slots](form-blueprints.v2.json) — **slot metadata only, no protected test content**.
- [Instrument validation, protected bank loader & deterministic scoring](../../../tools/learning-evidence/instrument-v2.mjs) — research-only, no frontend imports, no network or persistence.
- [Blueprint + score tests](../../../tests/learning-evidence-instrument-v2.test.mjs).
- [Complete 915-slot synthetic bank test](../../../tests/learning-evidence-full-bank-v2.test.mjs) — **fake prompts**, not assessment items.
- [Math framework, item-authoring patterns and scoring rubric](math-assessment-spec.md).
- [ELA framework, text construction, listening/research and writing rubrics](ela-assessment-spec.md).
- [Source alignment, validation, administration and security gates](development-controls.md).

## Why replace the earlier 20–28-item draft?
We found Michigan's published item-count benchmarks:
- **K–2 state reference, April 2022:** Grade 1 Math 13 OA / 9 NBT / 7 MD / 5 Geometry = 34 items; Grade 2 Math 5 OA / 10 NBT / 16 MD / 5 Geometry = 36. Grade 1 ELA RL6 / RI6 / RF9 / W6 / L9 = 36; Grade 2 ELA RL7 / RI8 / RF6 / W8 / L10 = 39. Citation: https://www.michigan.gov/mde/-/media/Project/Websites/mde/OEAA/Early-Literacy-and-Mathematics/2022-ELBMA-MATH-ELA-Blueprint.pdf
- **M-STEP 3–7 reference, March 2021:** Math Concepts & Procedures 19–20, Problem Solving 3–5, Reasoning 7–9, Modeling & Data 4–6. Proposed Jems grade 3/4 form uses **19/4/8/5 = 36** slots. ELA Reading 14–16, Writing 13–14, Listening 8–9, Research 8–9. Proposed Jems grade 3/4 uses **15/13/8/8 = 44**. Citation: https://www.michigan.gov/mde/-/media/Project/Websites/mde/OEAA/M-STEP/M-STEP_MATH-ELA_Blueprint.pdf

These **state counts are benchmarks for coverage**, *not* evidence Jems items have state-like difficulty, administration validity, psychometric properties, accommodations or score equivalence. Neither state assessment item text nor its answer key has been copied or licensed here. These sources are the latest accessible blueprint tables located in this review; confirm whether MDE has replaced these before external launch.

## Proposed independent research form volumes
| Grade | Math items (one form) | ELA items (one form) | A/B/C planned slot total |
|---|---:|---:|---:|
| 1 | 34 | 36 | 210 |
| 2 | 36 | 39 | 225 |
| 3 | 36 | 44 | 240 |
| 4 | 36 | 44 | 240 |
| **All grades** | **142** | **163** | **915** |

Every form has **form ID**, graded strand/claim, unique slot ID, original standards identifier, response type, scoring guide, max points, required modality and private-bank status. All 100 Math primary standards appear as a planned target at least once across three forms. The 16 primary ELA standards currently **outside** the published strand-format allocations are grade 1–2 Speaking & Listening and grade 3–4 Reading Foundational Skills; supplemental specialist modules are specified separately. **This does not mean every subclause is assessed.**

## Form delivery, not user interface
- Grades 1–2: two short breakable sessions, provisional max **20 min/module**, adjust based on observed child fatigue. Neutral oral directions allowed; reading passages *not* automatically read aloud if measuring reading.
- Grades 3–4: three short modules, provisional max **25 min/module**, including original listening audio and writing. These are usability targets, **not a speed-scored instrument**.
- Forms **A/B/C** may be counterbalanced; **C** can serve delayed recall/transfer. Same-format forms are *not* mathematically equated yet. No score comparison should claim a measured improvement until calibration and fairness evaluation.
- A missed module is **incomplete**, never scored zero to manufacture decline. Any adult/AI coaching, exposed solutions or transcripts that compromise the measured construct invalidate that response for independent scoring.
- Math: exact numeric/fraction equivalence, approved choice response and grade-appropriate human-reviewed explanation.
- ELA: accepted objective responses, original reading passages, separate writing rubrics, listening audio and research/source integration. Some grades require oral decoding/fluency **outside** this core state-like form; voice transcription is not a validated fluency instrument.

## Data & security separation
**Public app:** can receive a short-lived authorized *display payload* from a dedicated future assessment service. Cannot bundle answer keys, authored form banks or assessor scoring anchors. AI game worker and child chat never see the correct answers.

**Protected private service:** owns the locked item texts, key, content version, answer provenance, proctor instructions and human rubric anchors. A secure bank must meet the `jems.secure.bank.v2` contract and complete **all** slots in a form. No secure content has been committed to this public repo. The module presently runs purely for research and synthetic testing; neither the service, authenticated endpoints nor storage exists.

**Parent/clinical/research records:** require guardian approval, retention schedule, security separation, audit, deletion, reporting agreement and accessibility validation. No new collection is authorized or deployed. A future controlled comparison must use appropriate consent and its own analysis protocol.

## What the current build establishes
1. Exhaustive **slot-level** Math/ELA plan aligned to original published Michigan claim counts: yes.
2. Math and ELA distinct scoring contracts + protected question-bank schema: yes.
3. Deterministic grading for short answers; blind double scoring + adjudication for human-scored tasks: yes, **prototype**.
4. A complete authoring/assessment process, scoring examples and quality gates: yes, in linked documents.
5. **Full 915 educational items written, externally content-reviewed, field-tested and equated: NO.** Synthetic 915-slot test uses intentionally fake prompts; it proves only structural completeness.
6. Parent dashboard, inference-driven scoring, child data and classroom readiness: **not activated**.

## Phase exit gates (do not wait to continue engineering)
- All 915 protected slots populated with **original full-quality draft content**, candidate distractors, keys, scoring examples and language/media; no public training leakage.
- Each item version linked to a standard, complexity rubric and independent rationale; content reviewing happens later and cannot be silently assumed.
- Working secure service + appropriate permissions, test integrity and pause/return; mobile and desktop accessible.
- Later: qualified teacher/literacy review, response-process testing, calibrated equating, norms, subgroup bias, human rater agreement, legal approvals and independent impact research.
