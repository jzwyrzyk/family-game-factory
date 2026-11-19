# Jems Learning Evidence v1 — research and assessment design

**Status:** DRAFT R&D DESIGN — **not** an operational standardized assessment, validated growth metric, approved standards alignment, or deployed child feature. **Date:** 2026-11-18. **Age/grade:** U.S. grades 1–4. **Scope:** math, English language arts (ELA), computational thinking (CT), and active problem-solving (APS), as four separate constructs.

## Decision and intent
Children should be able to create and improve enjoyable games without waiting for assessment. The learning layer must demonstrate independent academic competence *outside* the game, transfer and retention, and eventually incremental benefit versus a comparison group. The immediate phase designs a standards-grounded assessment and evidence system; a later consented controlled pilot tests effectiveness. Never infer intelligence, academic-grade placement, broad creativity, or causal gains from game telemetry alone.

## Contents
- [Mathematics benchmark, tests and scoring](mathematics.md)
- [English / Language Arts benchmark, tests and scoring](language-arts.md)
- [Computational Thinking benchmark, tests and scoring](computational-thinking.md)
- [Active Problem-Solving benchmark, tests and scoring](active-problem-solving.md)
- [Shared administration, measurement and data contract](assessment-scoring.md)
- [Assumptions, permissions, evidence hierarchy, launch gates](assumptions-and-licensing.md)
- [Original public **demonstration** items and rubrics](sample-items.md) — these **cannot** be used as secure scored assessment items after publication.

## Official anchors and precedence
| Layer | Mathematics | ELA | CT | APS |
|---|---|---|---|---|
| Curriculum/expectations | CCSS math content and 8 Practices, state crosswalk | CCSS RL/RI/RF/W/L/SL, state crosswalk | CSTA 1A K–2 and 1B 3–5 *research reference only*; K–12 CS Framework | NGSS K–2 ETS1 and 3–5 ETS1 |
| Instrument/research | 2026 NAEP grade 4 math framework; IES elementary math; NCII review methodology | 2026 NAEP grade 4 reading framework; IES reading/writing; NCII | TechCheck K–3 with permission; cCTt grade 3–4 with permission | NGSS design performances + original scenario/rubric; PISA 2012 problem solving only conceptual research (age 15, not age norm) |
| School external | Michigan K–2 math benchmark; M-STEP grade 3–4; optional licensed MAP/Star | Michigan K–2 ELA benchmark; M-STEP grade 3–4; optional licensed MAP/Star | No single established schoolwide grade-level proficiency standard | NGSS classroom/work samples; no validated general "problem-solving IQ" claim |

**Important:** Michigan scores are *external* and licensed/authorized educational records. Jems may not reconstruct their scales, claim score equivalence, scrape accounts, or import them without permission.

## Existing Jems code — integration boundary
- `src/learning/curriculum.ts`: 73 standards-tagged **supplemental** math skill units; `src/learning/engine.ts`: independent vs assisted, representations and spaced review.
- `src/language/curriculum.ts`, `src/language/data-g1..g4.ts`: phonics, spelling, grammar, vocabulary, comprehension and some writing practice. Existing activity content is not complete reading/writing assessment.
- `docs/adaptive-math/*` and `docs/adaptive-language/*` already explicitly disclaim full curriculum coverage or validation. Preserve this.
- `docs/learning-evidence/*` is specification-only: do not splice into games or parent-facing claims before instrument and privacy gates. Never use public frontend `src/` to store secure tests or correct answer keys.

## Four independent outputs
1. **Math:** domain subscores: operations, place value, fractions (grades 3–4), measurement/data, geometry, applied mathematical reasoning. Grade-specific not a cross-grade percent scale.
2. **ELA:** word decoding/recognition, comprehension of original connected texts, vocabulary/language, constructed writing. Oral reading fluency is an optional **separate**, appropriately administered measure; do not infer it from speech recognition.
3. **CT:** algorithmic sequencing, patterns/control flow, decomposition/representation, debugging; unplugged, no coding syntax required. Independent test.
4. **APS:** problem definition and criteria, hypothesizing and options, planning fair test, evidence interpretation, iteration, transfer. Independent *unfamiliar physical/real-world scenarios*; not app engagement or AI-built sophistication.

## Measurement priority
**P0:** own the competency maps, skill crosswalk and fixed independent test blueprints; separate gameplay/coaching vs assessment; protect the item bank; ensure inclusion and scoring audit; external instrument permissions. **P1:** educator-reviewed parallel forms, age-appropriate usability, human-blind rubric scoring, pre/post/retention, psychometric pilot. **P2:** grade/season norms, calibrated growth scale and controlled effectiveness research.

## What constitutes usable evidence
1. *Engagement:* sessions and completed activities (not learning).
2. *Formative:* independent answers vs help, across new examples (not norm-referenced).
3. *Observed change:* parallel unassisted forms, same construct, new stimuli and error bars (descriptive only until forms equated).
4. *Externally corroborated:* appropriately authorized school or validated third-party measures.
5. *Causal evidence:* pre-registered study with randomized or defensible quasi-experimental comparison and independent scoring.

## Product guardrails
- Child can play even if an assessment is skipped; no coercive "pass this test to build" design.
- Independent assessment is unassisted, novel, outside the game/coach, with explicit start/end and restart rules.
- Avoid exposing grades, rankings or deficits to children. Parent view reports specific competencies and uncertainty, not "IQ".
- Separate protected `assessment_event` from existing local practice events. Do not silently retain new longitudinal child data or move it to a server without the approved privacy/consent architecture (see ongoing consent PR).
- **Never claim educational impact simply because these documents or a score calculation exist.**

## Primary-source register (accessed 2026-11-18)
- CCSS mathematics: https://corestandards.org/mathematics-standards/
- CCSS ELA: https://www.thecorestandards.org/ELA-Literacy/
- CCSS commercial permissions: https://www.thecorestandards.org/commercial-license/
- Michigan academic standards: https://www.michigan.gov/mde/Services/academic-standards
- Michigan K–2 benchmarks: https://www.michigan.gov/mde/services/student-assessment/early-literacy-and-mathematics-benchmark-assessments
- Michigan M-STEP sample item formats: https://www.michigan.gov/mde/services/student-assessment/m-step/content-specific-information/online-practice-for-m-step-ela-math-science-and-social-studies
- NAEP mathematics 2026: https://www.nagb.gov/naep-subject-areas/mathematics/2026-naep-mathematics-framework.html
- NAEP reading 2026: https://www.nagb.gov/naep/reading/naep-reading-assessment-framework.html
- IES elementary math guide: https://ies.ed.gov/ncee/wwc/PracticeGuide/26
- IES K–3 reading: https://ies.ed.gov/ncee/wwc/PracticeGuide/21
- IES writing: https://ies.ed.gov/ncee/WWC/PracticeGuide/17/Published
- NCII progress monitoring technical review: https://intensiveintervention.org/resource/academic-progress-monitoring-tools-chart
- CSTA grades K–5: https://csteachers.org/2017standards/interactive/
- TechCheck: https://sites.bc.edu/devtech/assessments/techcheck/
- cCTt comparison: https://pubmed.ncbi.nlm.nih.gov/36578687/
- NGSS engineering design: https://www.nextgenscience.org/topic-arrangement/3-5engineering-design and https://my.nsta.org/ngss/DisplayStandard.aspx?id=10&view=topic
- NCME/AERA/APA testing standards: https://ncme.org/resources/books/testing-standards/

**Source hierarchy:** government and standards-setting bodies first; peer-reviewed validation next; assessment vendors for product facts only. Any numerical score thresholds in these documents are *Jems pilot assumptions*, not purported norms.
