# Adaptive Math v1: supported curriculum and content contract

## Release scope

This release contains **73 supplemental skill units for grades 1–4**: 16 in grade 1, 16 in grade 2, 19 in grade 3, and 22 in grade 4. They cover operations, place value, measurement (including time and money), data, and geometry in every grade. Grade 1–2 equal-part geometry develops into a separate fractions domain in grades 3–4.

The units support useful, adjustable practice within games. They are **bounded practice coverage, not a complete Common Core curriculum, a grade-placement exam, or evidence of comprehensive grade mastery**. A standards tag identifies the part of a standard addressed by the item family; it does not certify every clause of that standard. No teacher or specialist review is claimed. Automated checks establish numerical correctness and contract consistency; children and qualified educators still need to review readability, instructional usefulness, and accessibility in the integrated experience.

The parent-selected grade is the maximum grade that the engine may serve. Prior-grade prerequisites and confidence practice remain available. The content module itself is grade-neutral: callers must apply the engine's eligibility policy before presenting an item. Changing a game or math mode must use the same child profile and eligibility policy.

## Standards grounding

The progression is grounded in the official Common Core mathematics content pages, consulted on 2026-11-16:

| Grade | Official content domains used |
| --- | --- |
| 1 | [Operations and Algebraic Thinking](https://www.thecorestandards.org/Math/Content/1/OA/), [Number and Operations in Base Ten](https://www.thecorestandards.org/Math/Content/1/NBT/), [Measurement and Data](https://www.thecorestandards.org/Math/Content/1/MD/), [Geometry](https://www.thecorestandards.org/Math/Content/1/G/) |
| 2 | [Operations and Algebraic Thinking](https://www.thecorestandards.org/Math/Content/2/OA/), [Number and Operations in Base Ten](https://www.thecorestandards.org/Math/Content/2/NBT/), [Measurement and Data](https://www.thecorestandards.org/Math/Content/2/MD/), [Geometry](https://www.thecorestandards.org/Math/Content/2/G/) |
| 3 | [Operations and Algebraic Thinking](https://www.thecorestandards.org/Math/Content/3/OA/), [Number and Operations in Base Ten](https://www.thecorestandards.org/Math/Content/3/NBT/), [Number and Operations—Fractions](https://www.thecorestandards.org/Math/Content/3/NF/), [Measurement and Data](https://www.thecorestandards.org/Math/Content/3/MD/), [Geometry](https://www.thecorestandards.org/Math/Content/3/G/) |
| 4 | [Operations and Algebraic Thinking](https://www.thecorestandards.org/Math/Content/4/OA/), [Number and Operations in Base Ten](https://www.thecorestandards.org/Math/Content/4/NBT/), [Number and Operations—Fractions](https://www.thecorestandards.org/Math/Content/4/NF/), [Measurement and Data](https://www.thecorestandards.org/Math/Content/4/MD/), [Geometry](https://www.thecorestandards.org/Math/Content/4/G/) |

Concrete bounds reflect these sources: grade 1 facts within 20; grade 2 place-value addition/subtraction within 1,000 and repeated-addition arrays through 5 by 5; grade 3 ordinary multiplication/division facts within 100; grade 3 fractions with denominators 2, 3, 4, 6, and 8; grade 4 whole-number operations, like-denominator fraction operations, tenths/hundredths, and fraction-measurement line plots. The generated grade 4 fraction activities use a subset of that grade's denominator scope. Explicit legacy 11/12 multiplication facts are preserved as a bounded extension, described below.

The prerequisite graph is an authored product design, informed by these progressions. It is not an empirically fitted model of every child's learning path. The graph has no cycles, no missing nodes, and no prerequisite from a later grade. It gives the engine a concrete route to prerequisite practice without inventing a diagnosis from one wrong answer.

## What is implemented

| Grade | Practical coverage | Specific boundaries |
| --- | --- | --- |
| 1 | Addition/subtraction within 10 and 20; make ten; missing addends; equality; tens/ones; comparisons and whole tens; comparing supplied lengths; clocks to hours/half hours; three-category charts; familiar shape attributes; halves/quarters | Missing-addend and story structures are limited. No full count-to-120 sequence, hands-on measuring, or shape composition task. |
| 2 | Addition/subtraction within 100 and 1,000; hundreds/tens/ones; skip counting; comparisons; even/odd; repeated-addition arrays; length differences; five-minute clocks; valued U.S. coins; charts; polygons/cube faces; equal shares; two-step add/subtract stories | Coin values are printed. Arrays teach repeated addition. Measurement uses supplied values; open drawings and student-created charts are absent. |
| 3 | Equal groups; multiplication/division; missing factors; two-step stories; stated-rule patterns; rounding; arithmetic within 1,000; multiplying tens; unit/number-line/equivalent/related-comparison fractions; elapsed minutes; mass/volume stories; rectangle area/perimeter; scaled charts; inclusive side-count categories | Facts normally use factors 2–10. Number-line fractions stay between 0 and 1. Stories and geometry sample only part of the standards. |
| 4 | Larger place values/comparisons/rounding; multi-digit add/subtract/multiply/divide and remainders; multiplicative comparison; factor recognition; patterns; fraction equivalence/comparison/like-denominator operations/whole-number multiplication; decimals; conversions; time/money; missing rectangle sides; fraction line plots; angle classification/addition; parallel sides; symmetry | Long division asks quotient or remainder separately. Factor recognition is not a full factors/prime/composite sequence. Angles are supplied, not measured with an interactive protractor. |

### Content and correctness

`src/learning/curriculum.ts` exports `SKILLS` and `getSkill(id)`. `src/learning/content.ts` exports `generateItem(skillId, options)`, `evaluateAnswer(item, raw)`, and `legacyFactItem(factId)`. An injected random function makes generation reproducible for tests. The local generator and exact checker require no model call, network connection, or paid inference.

Every item includes its skill, grade, stable mathematical parameters, answer kind, three graduated hint steps, and a worked solution. Hint progression moves from the relevant concept to a strategy and then a more explicit next step. Some third hints intentionally show intermediate results or a solved visual; requesting those hints must count as supported work in the engine. Worked solutions are for recovery after an answer/help action, not an initial answer display.

Whole-number arithmetic stays exact. Fraction answers accept equivalent fractions, mixed numbers, and exact finite decimals. The checker compares integer rational values using `BigInt` cross-products rather than a floating-point tolerance. It rejects zero denominators, malformed separators, excessive input, nonfinite values, scientific notation, and markup. Numeric answers can also accept equivalent rational notation: a child who writes `2/2` for 1 has expressed the correct quantity. Choice answers must match an offered value or label. The content checker grades the resulting answer; it does not infer which mental strategy the child used.

Tier values are 0, 1, and 2. Several item families use explicit within-skill progression: multiplication factors, multi-digit multiplication/division, elapsed time, number patterns, angle tasks, and line-plot interpretation. Other families vary quantities within their skill's bounds; lowering their tier alone is not a calibrated difficulty guarantee. The engine can also return to an earlier skill or offer scaffolding. These are transparent product heuristics, not psychometric item calibration.

### Representation and visual integrity

Items record the representation actually delivered. Asking for a visual or story does not automatically mark the result as one: if a template only supports symbols, the returned evidence remains symbolic. Distinct supported forms of the same multiplication fact have different item IDs and the same stable fact ID. A same-template repetition must not be mistaken for new transfer evidence.

Visuals use structured, deterministic data: ten frames, unsolved or instructional number lines, arrays/equal groups, fractions, place values, clocks, geometric shapes, bar charts, fraction line plots, and angles. Arrays are at most 12 by 12 and standard fraction diagrams use at most 12 parts. Hundredths are not squeezed into an unreadable 100-slice diagram. Subtraction number lines initially omit solved jumps. Array counting and fraction-number-line steps may be given mathematical data when counting/interpreting them is the task.

Grade 4 line plots have fractional measurement labels and stacked X marks for frequencies. Easier items read a frequency, the next tier finds the difference between extreme lengths, and the highest tier totals all ribbon lengths using their frequencies. Tests calculate these answers independently from the actual visual labels and counts. Clock alternatives are shuffled with the same injectable random source so the correct digital time is not always in the first position.

### Existing arithmetic identity

Stable fact IDs preserve existing targeted practice:

| Fact family | Example | Mapping |
| --- | --- | --- |
| Addition | `add:8:7` | Grade 1 up to 20; grade 2 up to 1,000; grade 4 above 1,000, capped at 1,000,000 |
| Subtraction | `sub:15:7` | Same numeric bands; nonnegative whole-number results |
| Multiplication | `mul:8x7` | Grade 3; explicit legacy factors 1–12 accepted |
| Division | `div:56/8` | Grade 3; divisor 1–12 and exact whole quotient 0–12 |

Legacy 11/12 facts are migration compatibility, not a claim that all such products are required grade 3 facts. A parent grade below 3 must never receive them. Old streaks are not proof of independent retention; that evidence policy belongs to the engine. Invalid or out-of-bounds fact IDs return no item. IDs contain only bounded ASCII identity characters accepted by the engine.

## Quality evidence and remaining work

Run `node --import tsx --test tests/learning-content.test.ts` from the repository root. The suite checks the complete prerequisite graph and all 73 generators across **6,570 seeded samples** spanning requested representations and all tiers. Independent semantic calculations use the quantities supplied by each item, not the generator's answer. Additional tests reconstruct **120 line-plot answers from rendered-data inputs**, exercise equivalent fractions and malformed inputs, verify migration identities/grades, bound visuals, check representation honesty, and prevent fixed clock-answer positions.

These checks are meaningful safeguards, but they cannot establish instructional effectiveness or readability. Remaining content work includes broader story/unknown positions, grade 1 counting and direct measurement, drawing/composition, complete mixed-number instruction, student-created plots, protractor tasks, prime/composite classification, richer explanation responses, and deeper language/accessibility review with actual children. A child who performs well in these units has evidence about these units, not automatic certification of every standard in their grade.

## Skill catalog

The catalog below mirrors the shipped IDs, standards tags, and prerequisites. Titles describe the bounded unit, and the description states what its item family currently practices.


### Grade 1

| ID | Unit and current practice | Standards | Prerequisites |
| --- | --- | --- | --- |
| `g1-add-10` | **Add within 10.** Combine two quantities and count on within ten. | 1.OA.C.6 | None required |
| `g1-subtract-10` | **Subtract within 10.** Take away or find the difference within ten. | 1.OA.C.6 | `g1-add-10` |
| `g1-make-ten` | **Make ten.** Find the missing part of ten. | 1.OA.C.6 | `g1-add-10` |
| `g1-add-20` | **Add within 20.** Combine quantities using a ten or a known fact. | 1.OA.C.6 | `g1-make-ten` |
| `g1-subtract-20` | **Subtract within 20.** Use a related addition fact or subtract through ten. | 1.OA.B.4, 1.OA.C.6 | `g1-subtract-10`, `g1-add-20` |
| `g1-missing-addend` | **Find a missing part.** Find an unknown in an addition relationship. | 1.OA.D.8 | `g1-add-20`, `g1-subtract-20` |
| `g1-equality` | **Understand equals.** Compare the values on both sides of an equation. | 1.OA.D.7 | `g1-add-10` |
| `g1-tens-ones` | **Tens and ones.** Compose a two-digit number from tens and ones. | 1.NBT.B.2 | `g1-make-ten` |
| `g1-compare` | **Compare two-digit numbers.** Use tens, then ones, to compare quantities. | 1.NBT.B.3 | `g1-tens-ones` |
| `g1-add-tens` | **Add multiples of ten.** Combine tens within 100. | 1.NBT.C.4 | `g1-tens-ones`, `g1-add-10` |
| `g1-subtract-tens` | **Subtract multiples of ten.** Subtract whole tens within 90. | 1.NBT.C.6 | `g1-add-tens`, `g1-subtract-10` |
| `g1-length` | **Compare lengths.** Order three measured lengths. | 1.MD.A.1 | `g1-compare` |
| `g1-time` | **Hours and half hours.** Read a clock to the hour or half hour. | 1.MD.B.3 | None required |
| `g1-data` | **Read a small chart.** Read quantities in up to three categories. | 1.MD.C.4 | `g1-add-10` |
| `g1-shapes` | **Shape attributes.** Recognize flat shapes from their sides and corners. | 1.G.A.1 | None required |
| `g1-halves-quarters` | **Equal halves and quarters.** Name two or four equal parts of a whole. | 1.G.A.3 | `g1-shapes` |


### Grade 2

| ID | Unit and current practice | Standards | Prerequisites |
| --- | --- | --- | --- |
| `g2-add-100` | **Add within 100.** Use place value to add two-digit numbers. | 2.NBT.B.5 | `g1-add-20`, `g1-tens-ones` |
| `g2-subtract-100` | **Subtract within 100.** Decompose tens when subtracting two-digit numbers. | 2.NBT.B.5 | `g1-subtract-20`, `g1-tens-ones` |
| `g2-hundreds` | **Hundreds, tens and ones.** Compose and interpret three-digit numbers. | 2.NBT.A.1, 2.NBT.A.3 | `g1-tens-ones` |
| `g2-add-1000` | **Add within 1,000.** Add hundreds, tens and ones with regrouping. | 2.NBT.B.7 | `g2-add-100`, `g2-hundreds` |
| `g2-subtract-1000` | **Subtract within 1,000.** Subtract three-digit numbers using place value. | 2.NBT.B.7 | `g2-subtract-100`, `g2-hundreds` |
| `g2-skip-count` | **Count by 5, 10 and 100.** Continue a skip-counting sequence within 1,000. | 2.NBT.A.2 | `g1-add-tens` |
| `g2-compare` | **Compare three-digit numbers.** Compare hundreds, then tens, then ones. | 2.NBT.A.4 | `g2-hundreds`, `g1-compare` |
| `g2-even-odd` | **Even and odd.** Pair objects to decide whether a quantity is even. | 2.OA.C.3 | `g1-add-20` |
| `g2-arrays` | **Equal rows and columns.** Find totals using equal rows, up to five by five. | 2.OA.C.4 | `g1-add-20`, `g2-skip-count` |
| `g2-length` | **Length differences.** Find a difference between measurements in the same unit. | 2.MD.A.4, 2.MD.B.5 | `g2-subtract-100` |
| `g2-time` | **Time to five minutes.** Read an analog clock in five-minute steps. | 2.MD.C.7 | `g1-time`, `g2-skip-count` |
| `g2-money` | **Count money.** Combine explicitly valued U.S. coins in cents. | 2.MD.C.8 | `g2-add-100`, `g2-skip-count` |
| `g2-data` | **Compare chart categories.** Compare quantities shown in a bar chart. | 2.MD.D.10 | `g1-data`, `g2-subtract-100` |
| `g2-shapes` | **Sides, angles and faces.** Identify polygons and a cube using their attributes. | 2.G.A.1 | `g1-shapes` |
| `g2-fractions` | **Equal parts of a whole.** Describe halves, thirds and fourths as equal shares. | 2.G.A.3 | `g1-halves-quarters` |
| `g2-word-problems` | **Two-step addition stories.** Use two addition/subtraction steps in a short story. | 2.OA.A.1 | `g2-add-100`, `g2-subtract-100` |


### Grade 3

| ID | Unit and current practice | Standards | Prerequisites |
| --- | --- | --- | --- |
| `g3-groups` | **Understand equal groups.** Connect equal groups with multiplication. | 3.OA.A.1 | `g2-arrays` |
| `g3-multiply` | **Multiplication facts.** Recall or derive multiplication facts within 100. | 3.OA.C.7, 3.OA.B.5 | `g3-groups` |
| `g3-divide` | **Division as sharing.** Use a related multiplication fact to share equally. | 3.OA.A.2, 3.OA.B.6 | `g3-multiply` |
| `g3-missing-factor` | **Missing factors.** Find an unknown factor in a multiplication equation. | 3.OA.A.4 | `g3-multiply`, `g3-divide` |
| `g3-two-step` | **Two-step multiplication stories.** Find a group total, then add or take away. | 3.OA.D.8 | `g3-multiply`, `g2-word-problems` |
| `g3-patterns` | **Continue number patterns.** Continue a constant-step pattern from a stated rule. | 3.OA.D.9 | `g3-multiply` |
| `g3-round` | **Round to tens or hundreds.** Choose the nearest multiple of ten or one hundred. | 3.NBT.A.1 | `g2-hundreds` |
| `g3-add-subtract` | **Add and subtract fluently.** Use place-value relationships within 1,000. | 3.NBT.A.2 | `g2-add-1000`, `g2-subtract-1000` |
| `g3-multiply-tens` | **Multiply a multiple of ten.** Use a fact such as 3 times 4 to solve 3 times 40. | 3.NBT.A.3 | `g3-multiply`, `g1-add-tens` |
| `g3-unit-fraction` | **Unit fractions.** Describe one equal part using fraction notation. | 3.NF.A.1 | `g2-fractions` |
| `g3-fraction-number` | **Fractions as numbers.** Connect equal parts of one with a position on a number line. | 3.NF.A.2 | `g3-unit-fraction` |
| `g3-equivalent-fraction` | **Simple equivalent fractions.** Recognize equal amounts partitioned in different ways. | 3.NF.A.3 | `g3-unit-fraction`, `g3-multiply` |
| `g3-compare-fraction` | **Compare related fractions.** Compare fractions with the same denominator or numerator and the same whole. | 3.NF.A.3.d | `g3-fraction-number` |
| `g3-time` | **Elapsed time in minutes.** Find elapsed minutes without crossing midnight. | 3.MD.A.1 | `g2-time`, `g2-add-100` |
| `g3-mass-volume` | **Mass and liquid volume.** Solve same-unit mass and liquid-volume stories. | 3.MD.A.2 | `g3-multiply`, `g2-add-100` |
| `g3-area` | **Area in square units.** Cover a rectangle with unit squares. | 3.MD.C.5, 3.MD.C.7 | `g3-multiply`, `g2-arrays` |
| `g3-perimeter` | **Perimeter.** Add all side lengths of a rectangle. | 3.MD.D.8 | `g2-add-100`, `g1-shapes` |
| `g3-data` | **Scaled chart data.** Interpret a chart in which each count represents several objects. | 3.MD.B.3 | `g2-data`, `g3-multiply` |
| `g3-shapes` | **Shape categories.** Recognize shared polygon attributes and inclusive categories. | 3.G.A.1 | `g2-shapes` |


### Grade 4

| ID | Unit and current practice | Standards | Prerequisites |
| --- | --- | --- | --- |
| `g4-place-value` | **Large-number place values.** Identify the value of a digit through the hundred-thousands place. | 4.NBT.A.2 | `g2-hundreds` |
| `g4-compare` | **Compare large whole numbers.** Compare whole numbers through one million. | 4.NBT.A.2 | `g4-place-value`, `g2-compare` |
| `g4-round` | **Round large whole numbers.** Round to a specified place up to hundred thousands. | 4.NBT.A.3 | `g3-round`, `g4-place-value` |
| `g4-add-subtract` | **Multi-digit addition and subtraction.** Add and subtract whole numbers through one million. | 4.NBT.B.4 | `g3-add-subtract`, `g4-place-value` |
| `g4-multiply` | **Multi-digit multiplication.** Multiply up to four digits by one digit, or two digits by two digits. | 4.NBT.B.5 | `g3-multiply-tens`, `g4-place-value` |
| `g4-divide` | **Division and remainders.** Find whole-number quotients or remainders with a one-digit divisor. | 4.NBT.B.6 | `g3-divide`, `g4-multiply` |
| `g4-comparison` | **Multiplicative comparison.** Distinguish times-as-many relationships from additive ones. | 4.OA.A.1, 4.OA.A.2 | `g3-multiply`, `g3-divide` |
| `g4-factors` | **Recognize factors.** Recognize factors of whole numbers within 100. | 4.OA.B.4 | `g3-multiply`, `g3-divide` |
| `g4-patterns` | **Patterns from a rule.** Use an explicit additive or multiplicative rule. | 4.OA.C.5 | `g3-patterns` |
| `g4-equivalent-fraction` | **Generate equivalent fractions.** Scale numerator and denominator by the same factor. | 4.NF.A.1 | `g3-equivalent-fraction` |
| `g4-compare-fraction` | **Compare unlike fractions.** Compare equal wholes using common-size parts or benchmarks. | 4.NF.A.2 | `g4-equivalent-fraction`, `g3-compare-fraction` |
| `g4-add-fraction` | **Add and subtract like fractions.** Combine or separate fractions with the same denominator. | 4.NF.B.3 | `g3-unit-fraction`, `g2-add-100` |
| `g4-multiply-fraction` | **Whole numbers times fractions.** Combine repeated groups of a fraction. | 4.NF.B.4 | `g4-add-fraction`, `g3-multiply` |
| `g4-decimal` | **Tenths and hundredths.** Connect fractions with denominator 10 or 100 to decimals. | 4.NF.C.5, 4.NF.C.6 | `g4-equivalent-fraction`, `g2-hundreds` |
| `g4-compare-decimal` | **Compare decimals.** Compare tenths and hundredths for the same whole. | 4.NF.C.7 | `g4-decimal` |
| `g4-measurement` | **Convert measurement units.** Convert a larger unit into a smaller unit within one system. | 4.MD.A.1 | `g4-multiply` |
| `g4-time-money` | **Time and money problems.** Solve elapsed-time or money-change stories. | 4.MD.A.2 | `g3-time`, `g2-money`, `g4-add-subtract` |
| `g4-area-perimeter` | **Rectangle formulas.** Use known area or perimeter to find a missing side. | 4.MD.A.3 | `g3-area`, `g3-perimeter`, `g3-divide` |
| `g4-data` | **Fraction measurement data.** Interpret frequencies of measurements in halves, fourths and eighths. | 4.MD.B.4 | `g4-add-fraction`, `g2-data` |
| `g4-angles` | **Angle measurement.** Classify and combine stated angle measures. | 4.MD.C.5, 4.MD.C.7 | `g2-add-100`, `g2-subtract-100` |
| `g4-shapes` | **Parallel sides in polygons.** Count pairs of parallel sides in familiar polygons. | 4.G.A.1, 4.G.A.2 | `g3-shapes` |
| `g4-symmetry` | **Lines of symmetry.** Recognize mirror folds in regular familiar shapes. | 4.G.A.3 | `g3-shapes` |

The [early crosswalk](EARLY-CROSSWALK.md) covers the six-grade development stack. Seeded early items rebuild their options, prompts and answer on admission and import.
