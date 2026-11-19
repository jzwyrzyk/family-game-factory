# Math instrument: grade 1–4 independent assessment blueprint and scoring

**Research status:** design and code prototype only; **never advertise grade-level proficiency from these raw scores.** Source: official grade content https://www.thecorestandards.org/Math/Content/ ; state blueprint https://www.michigan.gov/mde/-/media/Project/Websites/mde/OEAA/Early-Literacy-and-Mathematics/2022-ELBMA-MATH-ELA-Blueprint.pdf and https://www.michigan.gov/mde/-/media/Project/Websites/mde/OEAA/M-STEP/M-STEP_MATH-ELA_Blueprint.pdf .

## A. Construct and outcome definitions
**Primary independent outcome:** correctly solve *new* grade-appropriate mathematical problems, including word problems and representations, without feedback from Jems, parent, teacher or AI. **Secondary:** explaining a valid approach, modeling unfamiliar contexts and retention after a delay. **Not measured by this instrument:** IQ, “months ahead,” classroom achievement norms or speed unless a separately validated fluency module exists.

Math strands:
- **OA:** operations/algebraic thinking, facts and story structure, properties, multistep reasoning.
- **NBT:** place value, whole number relationships and arithmetic.
- **NF (grades 3–4):** fractions, equivalents, comparisons, grade-valid operations, decimals in grade 4.
- **MD:** measurement, time and money, data/graphs, area/perimeter, angles in grade 4.
- **G:** shape attributes, equal partitions, geometry reasoning.
- **Math Practices:** making sense of novel problems, strategies, argument and modeling are sampled through open/constructed tasks. Do **not** label practices “mastered” because a child answered a generated calculation.

## B. State-anchored content blueprint
### Grades 1–2
| Grade | OA | NBT | MD | G | Total |
|---|---:|---:|---:|---:|---:|
| Grade 1 | 13 | 9 | 7 | 5 | 34 |
| Grade 2 | 5 | 10 | 16 | 5 | 36 |

The state blueprint has these counts. **Jems-specific** response formats: selected, constructed number/fraction, and approximately **5–6 reasoned responses per form** scored 0–2. State item-point values are *not* being copied. Child-neutral directions, visually accessible counters/grids, and no speed score.

### Grades 3–4
| Claim | G3/G4 Jems slot count | Type and scoring |
|---|---:|---|
| Concepts / Procedures | 19 | closed or constructed number (1 point) |
| Problem-solving | 4 | mixed numeric / explanation (1–2 points) |
| Communicating reasoning | 8 | mixed written explanation and objective/constructed (1–2 points) |
| Modeling / data analysis | 5 | context, charts and evidence (1–2 points) |
| **Total** | **36** | 42 total points in current provisional rubric allocation |

These are values chosen **within** the Michigan M-STEP published claim ranges, not copies of actual assessment items or calibration.

**Grade-specific distribution targets:** Grade 3 includes within-100 multiplication/division, base-ten rounding/add/subtract, unit fractions and equivalent fractions, area/perimeter, elapsed time, graphs and geometric attributes. Grade 4 includes factors/multiples, multi-digit multiplication/division and comparison, fractions and tenths/hundredths, measurement conversion, angles and lines/symmetry. The machine blueprint maps one current state primary code to every slot; per-subclause evidence is **not** automatically established.

## C. Item-authoring requirements (applies to every Math item)
A draft authored item includes:
- Immutable `item_id`, `form_id`, `slot_id`, grade/strand, original standard code, **subclause target when relevant**, content author, source/license, item-version date, reviewer status.
- Prompt, optional figure asset with alt text, allowed response interaction, verified correct result, accepted equivalent answers or eligible numeric units, *all* distractor rationales and an item-specific reasoning anchor where applicable.
- Constraints: exact cognitive skill; grade-valid values, permitted operations and rounding, intentional representation, unbiased context, correctly specified units, unique solution and verified accepted alternatives.
- Difficulty target `intro / typical / transfer` **author-set, not statistical calibration**; avoid conflating numerical magnitude with cognitive difficulty.
- Prescribed neutral reading of directions. When measuring mathematical understanding, unrelated reading difficulty should not control accuracy; when measuring written explanation, permit accessible non-leading transcription and explicitly label modality.
- Each pre/post form uses different numbers **and different story structures**; simply changing 8 apples to 9 apples is not strong transfer evidence.
- Two reviewers eventually evaluate: mathematical correctness/clarity and target standard/child development; **not a blocker to preparing complete drafts now**.

## D. Candidate question families by grade (original *public examples only*)
These examples cannot be later used as protected pre/post questions.

| Grade | Target | Original example | Expected reasoning |
|---|---|---|---|
| 1 | Add/sub different unknowns | “Twelve paper stars were on a wall. Some fell. Eight remain. How many fell?” | 4; 12 − 8 or 8 + 4 |
| 1 | Place value | “Make 62 with tens rods and single squares. How many rods?” | six tens and two ones, not 6+2 |
| 1 | Equal partition | “A circle is folded into four *equal* pieces. One is shaded. What share?” | one fourth; equality matters |
| 1 | Length comparison | “A ribbon uses eight identical unit tiles; another uses five. How much longer?” | 3 units; equal-sized units |
| 2 | Multistep | “A shelf has 46 books, receives 25 and lends 18. How many now?” | 53; correct order |
| 2 | Measurement | “Two 9-cm strips are put end to end with no gap. What total length?” | 18 cm, not 9 cm |
| 2 | Data and graph | “Line plot: 2 children chose red, 4 chose blue, 3 chose green. How many chose red or green?” | 5; interpret frequencies |
| 2 | Arrays | “Draw 3 equal rows with 5 dots each. How many dots?” | 15; support repeated addition |
| 3 | Area | “A rectangular patch has 6 rows of 4 equal square tiles. How many tiles cover it?” | 24 square units |
| 3 | Fractions | “On the same whole number line, explain why 2/4 equals 1/2.” | matching position, equal parts |
| 3 | Data | “A chart shows five groups with 4 shells each. A basket has 3 fewer than the chart total. How many?” | 17; model and interpret |
| 3 | Two-step | “Four teams of 7 children each have two children leave. How many remain?” | 26; multiply then subtract |
| 4 | Fraction comparison | “Which is greater, 5/8 or 2/3? Explain without guessing.” | 2/3; common benchmark or 15/24 vs16/24 |
| 4 | Multiplicative comparison | “A tree is 4 times as tall as a 3-m pole. What height is the tree?” | 12 m; times-as-many |
| 4 | Place-value relationship | “What is the value of the 7 in 72,000, compared with the 7 in 7,200?” | tenfold; place value ×10 |
| 4 | Angle reasoning | “A quarter-turn clockwise from a north-pointing arrow is how many degrees?” | 90°; angle unit |

## E. Math open-response rubric (item-specific 0–2)
- **0:** mathematically incorrect relation, unsupported guess, or no relevant independent attempt.
- **1:** recognizable valid mathematical structure, representation or intermediate step, but missing/incorrect conclusion or incomplete explanation.
- **2:** mathematically valid strategy **and** correct answer, with context and units respected where required.

**Do not score a correct answer with invented reasoning as 2.** Distinguish lucky final number from a demonstrably valid approach when rubric measures strategy. Some problems may have multiple fully valid strategies (diagram, operation, number line). The model must not prefer one style or vocabulary.

Objective numeric items have 0/1. The independent scorer uses exact rational equivalence, so 2/4 and 1/2 may both be correct; scientific notation/percent, ambiguous units and unusual formats are *not* accepted without explicit authoring and testing. **Fractions, decimals, length and angle units** require item-specific validation.

## F. Grade and score interpretation
- One form scores **G1 ~39 points**, **G2 ~42 points**, **G3/4 42 points**, depending on authored reasoning allocation: the definitive possible score is the generated `form.possiblePoints`—not the item count.
- Form A/B/C results are reported only as raw earned/possible counts until equating. A parent's 22/34 and 28/34 are not proof of growth if form difficulty differs.
- Separate subscores OA/NBT/MD/G/NF require sufficient samples; do not issue mastery for single-digit item counts.
- No general score across grades; grade 3 fraction proficiency cannot be inferred from grade 4 math percent.
- **Later psychometrics:** item difficulty, discrimination, response process, DIF/fairness, reliability, standard-setting, equating and test-retest. Predictive/concurrent evidence from properly authorized school measures, separately from Jems scores.

## G. Specific regression and authoring QA
- Every generated item has a single authoritative oracle and nonambiguous distractors; no number overflow or wrong type.
- Fraction and decimal equivalence; mixed numbers, zero, negative zero, optional vs required units and source formatting.
- Unscored/hinted attempts excluded; no item leaks from prompts/examples into future secure pre/post.
- Math word problems vary unknown positions, operations and numerical contexts; benchmark not optimized for the existing practice engine's repeated templates.
- Visual items have meaningful alt descriptions; graphs are not pure motor-skill tests.
- Human-coded explanations demand blinded raters; disagreements adjudicated with reason.

**Current authoring status:** **426 provisional original Math item candidates** now exist only in the private `research/jems-academic-items-v0` branch. The version-0 draft had **39 exactly repeated questions** within grades; the version-1 draft replaces those with alternate original question candidates (recorded in `repair-math-duplicates.mjs`) and passes structural validation, **not grade, content, educational or psychometric validation**. Critical next work is independent item-key verification, deeper and more diverse reasoning tasks, additional diagrams/models, item-specific grade-anchored 0–2 exemplars, alternate-form equating, content review, and the proper private assessment service. These prompts **must not be administered** as a child's progress test.
