# Cross-domain assessment protocol, scoring engine and evidence contract

**Status:** design-only. No child-facing claim, validated norms, calibrated forms, user consent or production workflow is established by this file. Math/ELA are standards-aligned **design blueprints**; CT/APS are research-grounded instruments requiring separate validation.

**November 19, 2026 clarification:** the separately authorized background formative feature does not activate these independent benchmarks. The expanded support/provenance contract below is a design requirement; the isolated scoring prototype has not implemented that expansion and must not be used to certify independence from ordinary app logs.

## A. Three evidence streams (never mix)
| Stream | Purpose | Evidence | Scoring/reporting |
|---|---|---|---|
| **Formative practice** | Adapt question selection/coaching | Attempts, first response, hints, explanations, revisions, delayed retrieval | Existing Jems qualitative states (e.g. `solving independently`) with explicit uncertainty; **not** a school proficiency claim |
| **Independent Jems benchmark** | Test new, unassisted content across domains | Locked parallel forms, no game assistance, declared proctor/accommodations | Raw results and research quality flags; growth claims only after linking/equating |
| **External outcomes** | Corroborate school-meaningful results and later evaluate impact | Authorized Michigan benchmarks/M-STEP, licensed MAP/Star, approved TechCheck/cCTt | Keep provider-native score, grade, window, assessment form and authorized source; never fabricate equivalence |

**Independent score invariant:** For a fixed-answer item, retain the first committed response before teaching feedback. For an iterative APS scenario, apply the rule to each declared decision step, preserving the initial proposal, result evidence and subsequent interpretation/revision separately. A failed initial hypothesis does not invalidate an independently reasoned revision; interpreting the scenario's intended test results is part of the task. Hints, answer-revealing narration, adult reasoning help, automated drafting or an LLM-suggested decision make the affected response assisted. Preserve that response and its timing; exclude it from independent credit without erasing prior valid steps. Do not show the benchmark's teaching solution until the module is finished.

**Support and access are different.** Record neutral instructions/access accommodations separately from help that supplies the target reasoning. Reading a reasoning task's neutral directions aloud can preserve APS evidence but cannot certify independent reading. Record assistance at the step where it occurred, along with source, timing and affected construct. `none` requires the administration protocol's observation; an ordinary browser's `no_recorded_help` or `unknown` cannot be upgraded to verified independence. Unknown adult/external help remains a limitation, not an assumed absence.

## B. Test scheduling (assumption, not an established clinical rule)
1. **Research baseline:** before meaningful exposure, grade appropriate math/ELA; CT and APS separated across multiple short sessions. Allow child/parent decline.
2. **In-game:** formative event-only during normal play, no compulsory exam.
3. **Weekly 2–5 min microprobe:** rotate *practiced* skills for low-stakes formative learning; do not call an eight-item microprobe “grade readiness”.
4. **30-day:** fresh objective-specific math/ELA mini-benchmark if eligible; novel content.
5. **90-day research checkpoint:** alternate independent full forms on all four domains, scheduled over multiple sittings (avoid test fatigue); use same assistance and accommodation rules.
6. **180-day and retention:** independent forms, preplanned horizon and any authorized external measure, separately flag within-year grade changes.

Alternate forms A/B/C are design labels only. Their equal difficulty must be empirically investigated: randomize form order at pre/post where possible; include calibration anchors with security safeguards or use an appropriate IRT/equating design after sufficient pilot data. Repeated *identical* test score is affected by practice. Avoid leaking secure items into an LLM context.

## C. Objective scoring rules
| Item type | Max score | Grader | Special cases |
|---|---:|---|---|
| Numeric math selected/constructed short | 1 | exact deterministic oracle | equivalence, units, multiple accepted representations specified in item metadata |
| Math explanation/novel application | 2 | trained blinded human for evaluation study | 0 incorrect, 1 partial correct method, 2 correct with valid reasoning; item-specific anchors |
| ELA decoding/conventions/vocab/comprehension | 1 | deterministic where answer is closed; human for interpretation | oral reading fluency **separate** standardized instrument |
| ELA original writing | 8 | 4 rubric criteria ×0–2, human | grade-specific anchor texts; blind two-rater calibration |
| CT unplugged puzzle | 1 | deterministic | multi-valid paths explicitly accounted for; trace/oracle unit tests |
| APS scenario | 18 | 6 criteria ×0–3, human | 2 tasks/form = 36 points; grade-band anchored, independent action only |

**Automated grading must be deterministic for objective items.** Use LLM only to *suggest* formative feedback or assist scorer workflow, subject to review; never give a generative model unverified authority to certify proficiency or overwrite assessor decisions.

## D. Validity flags and explicit absence
- `completed`, `aborted`, `technical_invalid`, `no_opportunity`, `assisted`, `help_unknown`, `accommodation_changed`, `item_exposed`, `time_window_outside`, `unproctored`, `scoring_pending`, `rater_disagreement`, `not_equated`.
- Wrong answer is **0**. Invalid/aborted response is **missing/invalid**, not automatically 0. Completion and reason required; incomplete forms have **no overall score** except separately labeled partial progress.
- Grade / form / difficulty changes invalidate naive comparisons; never rescale raw percentages to "national percentile", "grade levels gained", "months of learning", "IQ" or "expected growth".
- Invalid device operation or broken renderer does not equal child cognitive error. The existing game production quality pipeline is separate from assessment validity.
- Multiple answers, actions or subchecks from one scenario are related observations, not independent samples. Preserve episode/task-family identifiers and count relevant opportunities. A repeated check of the same unchanged solution is not a new demonstration. Correctness and an assistance flag alone do not establish a general problem-solving construct.

## E. Research-quality progression
| Level | Allowed statement | Gate |
|---|---|---|
| 0 | "Participated in 18 practice activities" | valid event counts |
| 1 | "Independently solved 7 of 9 recent problems in this skill" | verified independent practice attempts |
| 2 | "Correct responses increased across *these sample items*" | locked documented forms, clear descriptive comparison |
| 3 | "Independent benchmark score increased" | matched **calibrated/equated** forms, suitable measurement error/uncertainty |
| 4 | "Score growth also observed on [external measure]" | authorized independent assessment and consistent units |
| 5 | "Jems caused a gain compared with [alternative]" | adequate controlled study, valid primary outcome, analysis plan and effect confidence interval |

## F. Quantification and uncertainty
### Prior to psychometric calibration
- Report `points_earned / points_possible` and number of tasks, **separately** by domain/form/grade. A percentage is just a descriptive raw score.
- Do not plot raw A/B differences as *measured learning growth* when form difficulty is unverified. For a single small skill, report counts and examples rather than precision decimals.
- Never arbitrarily set mastery cutoffs at 70/80/90%; criteria must be developed through educator standard-setting plus field evidence.
- Parent labels: `early evidence`, `practice trend`, `independent checkpoint`, `externally corroborated` with limitations visible.

### After calibration, as applicable
- Establish measurement model (classical-test-theory or IRT) with item difficulty/discrimination, dimensionality, alternate-form linking, reliability and subgroup fairness; use age/grade relevant samples.
- On a linked scale, `change = post_scale - pre_scale`. For CTT, `SEM = SD × sqrt(1 - reliability)`; approximate difference error requires correlation/covariance treatment. Show a defensible confidence interval rather than a naked exact percentage.
- To evaluate controlled efficacy, pre-register a primary outcome, comparison, estimand, analysis and multiplicity treatment across four domains. Baseline-adjusted post-score model (ANCOVA) or appropriate multilevel model; cluster corrections if assignment by school/class; intent-to-treat; account for attrition and missingness.
- If reporting school comparisons, keep original provider-native scales; use that provider's norm table and test window. Correlation with school test is not evidence that Jems caused the result.
- Assess differential item functioning/bias, ceiling/floor, measurement invariance across time and alternate administration modes. Don't claim group differences from an instrument that measures different constructs across groups.

## G. Pilot technical gates (provisional, **not** industry-certified numeric thresholds)
| Gate | Evidence needed | Decision |
|---|---|---|
| Content | Mapping to current standards, educator review, source rights | no operational item without sign-off |
| Response process | 6–12 cognitive interviews per grade/domain *as a planning target*, not a validated sample rule | revise confusing items |
| Grading | objective item property tests; human rubric anchor exemplars; blinded double scoring | mismatch blocks release |
| Reliability | inspect alpha/omega, test-retest, rater kappa/ICC and interval precision as appropriate | psychometrician establishes purpose-specific minimum |
| Form equivalence | paired / balanced crossover pilot and calibration | no raw A/B growth claim until adequate |
| Access/fairness | touch/keyboard/screen-reader and age/language/accommodations review | invalid or inaccessible item blocks deployment |
| Security | withheld secure bank, answer key isolation, no model/child item leakage | fail closed |
| Privacy | lawful guardian notice/consent, optional longitudinal tracking/permission, retention/deletion, access audit | fail closed |
| External | instrument owner permission + contracts; match permitted use and age range | no unauthorized use |
| Research | preregistered protocol, sample power, independent assessor | efficacy claims withheld |

## H. Minimal versioned data contract (proposal)
```ts
type EvidenceDomain = "math" | "ela" | "computational_thinking" | "active_problem_solving";
type AssessmentStatus = "completed" | "aborted" | "technical_invalid" | "assisted" | "scoring_pending";
type Assistance = "none" | "no_recorded_help" | "unknown" | "neutral_instructions" | "adult_help" | "ai_help" | "other";
interface IndependentAssessmentRecordV1 {
  schemaVersion: 1;
  pseudonymousLearnerId: string;        // child identity kept separately
  assessmentSessionId: string;
  episodeId: string; taskFamilyId: string;
  domain: EvidenceDomain;
  gradeAtTest: 1 | 2 | 3 | 4;
  formId: string; formRevision: string;
  administrationProtocolId: string;
  itemId: string; itemRevision: string;
  strandId: string; standardRefs: string[];
  deliveredAt: string; answeredAt?: string;
  firstResponse: unknown;               // protect and minimize content
  assistance: Assistance;
  assistanceEvents?: {
    stepId: string; at: string;
    source: "app" | "adult" | "ai" | "external" | "unknown";
    kind: "neutral_access" | "reasoning_prompt" | "worked_example" | "solution" | "unknown";
    affectedStrandId: string;
  }[];
  authorship?: "child" | "helper" | "mixed" | "unknown";
  elicitation?: "prompted" | "spontaneous" | "unknown";
  accommodationCode?: string;
  status: AssessmentStatus;
  score?: number; maxScore: number;
  scoringVersion: string;
  raterIds?: string[]; adjudicationId?: string;
  sourceOfEvidence: "jems_independent" | "licensed_external";
  provenance: { testWindow: string; assessor: "automated_deterministic" | "trained_human" | "external_provider" };
}
```
**Not implementation authorization:** schema includes sensitive child performance data. Do not ship storage, new cloud ingestion, student identifiers, audio or automatic submissions before privacy and retention controls/parent authorization. Define strict data minimization, encryption, role segregation and deletion cascade at system design review.

The existing `tools/learning-evidence/scoring.mjs` prototype accepts only its original narrower assistance enumeration and externally supplied human rubric marks. It does not observe authorship, support timing, accommodations or external help. These documentation corrections do not silently make that kernel an operational background scorer; extend its contract and tests deliberately before any benchmark use.

## I. Test-authoring and scoring QA invariants
- Unique IDs and immutable item/form revision; every form references existing scoring rubric; each item has an independent oracle.
- A math item cannot accept two different canonical results unless explicitly allowed; CT path puzzles must have enumerated valid paths, and no ambiguous distractors.
- Writing/APS allow multiple legitimate responses; human anchors must not punish different cultures, communication styles or disability-related modalities.
- Item scoring never exceeds max or becomes negative; no skipped item misclassified incorrect; scorer cannot see previous Jems usage or before/after label.
- Form release checks item exposure, visible answer keys, leaked standards proprietary content, automated prompt injection and grade-boundary errors.
- A child cannot alter parent/assessment records through game chat; game source/generative worker cannot access assessment answer key.
- Audit: all score revisions have version, rater, reason and append-only provenance; restoring backups preserves valid old versions and refuses unknown future records without destructive migration.

## J. Product-facing disclosure examples
Good: “On a new fraction check, your child independently answered 6 of 8 questions correctly. This is early information, not a grade-level placement.”
Bad: “Your child is now 45% smarter”, “Jems raised school scores by 20%”, “Grade 3 mastery achieved” based on 4 questions.

## References
- AERA/APA/NCME 2014 Standards: https://ncme.org/resources/books/testing-standards/
- NCII reliability/validity/growth sensitivity/alternate forms: https://intensiveintervention.org/resource/academic-progress-monitoring-tools-chart
- IES: https://ies.ed.gov/ncee/wwc/PracticeGuide/26 and https://ies.ed.gov/ncee/wwc/PracticeGuide/21
