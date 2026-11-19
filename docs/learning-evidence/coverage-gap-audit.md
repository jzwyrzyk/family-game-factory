# Actual Jems content coverage audit — what exists versus educational benchmark intent

**Source inspection:** `main` as of 2026-11-18, before this draft branch. Source of truth is the **121-row machine-readable inventory**: [current-practice-inventory.csv](current-practice-inventory.csv). These are *practice units*, not standard proficiency, test questions or validated learning outcomes.

## A. Math current practice distribution (73 total)
| Grade | Operations | Place value | Measurement | Data | Geometry | Fractions | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7 | 4 | 2 | 1 | 2 | 0 | 16 |
| 2 | 7 | 3 | 3 | 1 | 2 | 0 | 16 |
| 3 | 7 | 2 | 4 | 1 | 1 | 4 | 19 |
| 4 | 6 | 3 | 4 | 1 | 2 | 6 | 22 |

**Interpretation:** meaningful supplemental content coverage and grade tags exist, but each unit may address *only a portion* of an official standard. `1 unit = 1 state standard` is a false equivalence. Data and geometry have very few unit families; conceptual explanation, varied item types, external comparison, unbiased independent testing and cross-grade calibration are additional gaps. Grade-1/2 absent *fractions domain* is not necessarily a gap: equal-share geometry is appropriately represented in their geometry standards.

## B. English/Language Arts current practice distribution (48 total)
| Grade | Phonics | Spelling | Grammar | Comprehension | Vocabulary | Writing | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 2 | 1 | 1 | 0 | 0 | 12 |
| 2 | 5 | 2 | 2 | 1 | 2 | 0 | 12 |
| 3 | 1 | 0 | 3 | 3 | 5 | 0 | 12 |
| 4 | 0 | 0 | 2 | 4 | 4 | 2 | 12 |

**Interpretation:** school-grade ELA expectations extend well beyond the current catalog. Priority gaps: richer connected-text comprehension with original passages, separate decoding/reading accuracy where developmentally relevant, authentic constructed writing G1–G4, oral/listening assessment if claimed, standards-appropriate conventions and vocab and reviewed item difficulty. The fourth-grade writing units do **not** equate to an externally validated essay score. The limited grade-4 phonics count need not imply failure, because older grades shift emphasis to fluency, comprehension and vocabulary.

## C. New domains: current state
- Computational Thinking: games, builders and debugging experiences may be present but there is **no independently validated CT diagnostic or score** in the reviewed current academic curricula. Proposed new construct and unplugged forms.
- Active Problem-Solving: game revisions can provide formative evidence of decisions but there is **no APS independent assessment/grade-specific rubric** in the reviewed math/language curricula. Proposed separate real-world design-test scenario form.

## D. Coverage classification for every existing practice skill
`current-practice-inventory.csv` covers every skill from `src/learning/curriculum.ts` (73) and `src/language/curriculum.ts` (48); every record has:
- a grade and existing strand/domain
- current content standard tag(s)
- **practice status** `supplemental_practice_tag_only`
- **independent assessment** `not_yet_mapped_to_validated_test`

This is deliberately conservative. It is not a claim that Jems has no questions—rather, the *existing adaptive practice questions were not authored/validated as independent external assessments.*

## E. Next traceability deliverable for genuine comprehensive school alignment
The current CSV is an **exhaustive catalog of Jems skills**, *not* an exhaustive enumeration of every substandard in U.S. education. An educational standards crosswalk must:
1. Inventory all current CCSS Math/ELA standard sub-IDs for grades 1–4 (including reading, writing, language and speaking/listening) and Michigan's current version and exceptions.
2. Join each existing 121 practice skill to one or more standard subclauses **only if genuinely assessed**; retain all unmapped official standards as explicit gaps. Add an “instructional opportunity but no scored assessment” status.
3. Add locked independent test item families/blueprint slots and **review date, specialist, source license, code version and coverage depth**. No implicit coverage by title similarity.
4. Ensure standards are interpreted at the correct performance expectation and grade-level text/quantitative complexity.
5. Conduct independent educator review and version the approved crosswalk.

**Proposed source-to-standard rows:**
`jurisdiction,version,grade,subject,standard_id,expectation_digest,practice_skill_ids,practice_depth,assessment_item_families,benchmark_subscale,review_status,reviewer,rights_status`.

## F. Priority gap closure
| Order | Action | Why first | Acceptance |
|---|---|---|---|
| 1 | Complete official curriculum substandard inventory and state crosswalk | grade expectations must be explicit | reviewer-signed every standard/gap state |
| 2 | Math independent A/B/C forms, automatic oracles | deepest current catalog; straightforward scoring | reviewed comparable forms, no practice leakage |
| 3 | ELA passage and writing forms + rater training | largest curriculum-to-assessment gaps | passages reviewed, consistent scoring, modality clarity |
| 4 | CT unplugged forms and TechCheck/cCTt rights | independent CT needs validation | external instrument permission or internal rigorous validation |
| 5 | APS real-world scenario tests, rubric and blinded scorer | differentiated active problem-solving hypothesis | grade anchors and tested rater agreement |
| 6 | Technical measurement and privacy integration | cannot record sensitive child progress casually | independent secure bank, consent, audit and deletion |
| 7 | Human cohort comparison | evidence of product impact | study pre-registration + independent outcomes |

**Do not hold current game reliability/voice production PRs for this research.** This is a draft research workstream with no runtime change or test-item publication.

## G. Assessment engineering test cases
- Each mapped standard has a reviewer-affirmed source and declared item type; uncovered standards remain visible, never auto-closed by LLM.
- Existing 121 skill IDs unique; no grade outside 1–4; every standards tag parseable; CSV regeneration flags newly added skills.
- Assessment score must reference a locked item/form/rubric version; formative history cannot be promoted into an independent form.
- No aggregate score generated on incomplete/assisted forms; rubric marks audited; no score-grade equivalence claim without linking evidence.
- Prototype grader tests: `node --test tests/learning-evidence-scoring.test.mjs`.

## Audit limitations
I reviewed the curriculum source declarations, not every possible dynamically generated practice variant or all parent dashboard pathways. UI quality, accessibility, teacher judgment, item difficulty, psychometric properties, validated test content and external permissions require follow-up work.
