# Standards and measurement comparisons

**Reviewed:** November 19, 2026. These sources guide the formative design. None certifies Jems, establishes grade norms for its tasks, or proves that the feature improves learning. The current implementation and the independent [PR54 research foundation](https://github.com/jzwyrzyk/family-game-factory/pull/54) have separate scopes.

## What to borrow, and what the source does not establish

| Reference | Useful design lesson | Jems decision and limit |
| --- | --- | --- |
| [AERA/APA/NCME testing standards](https://ncme.org/resources/books/testing-standards/) | Interpretations and uses need evidence; fairness/accessibility and automated scoring need scrutiny. | Deterministic checks establish repeatable task rules. They do not establish that the rules measure APS, that tasks are equally difficult or that a score supports an educational claim. |
| [Common Core mathematical practices](https://www.thecorestandards.org/Math/Practice/) | Explain a problem, plan an approach, monitor it, use representations and consider evidence. | Preserve Math content achievement separately. A known-answer arithmetic response alone cannot establish a general reasoning dimension. |
| [NGSS K–2 engineering design](https://www.nextgenscience.org/dci-arrangement/k-2-ets1-engineering-design) and [grades 3–5 engineering design](https://www.nextgenscience.org/dci-arrangement/3-5-ets1-engineering-design) | Younger children compare designs; later expectations add criteria/constraints, fair tests and evidence-based improvements. | Use concrete age-appropriate decisions and controlled comparisons where relevant. Three brief app task families do not cover the complete standards or establish cross-context transfer. |
| [CSTA 2026 PK–12 overview](https://csteachers.org/pk12standards/about/) and [published standards](https://csteachers.org/2026-csta-pk-12-computer-science-standards/) | Algorithms/design and evaluating, modifying and debugging programs complement writing code. The standards describe outcomes, not a mandated assessment. | Treat CT and APS as related but distinct. Evaluate child decisions, not generated artifact complexity. Earlier PR54 2017 grade-band mappings need a reviewed 2026 crosswalk before a current-alignment claim. |
| [OECD PISA 2025 Learning in the Digital World](https://www.oecd.org/en/topics/sub-issues/learning-in-the-digital-world/pisa-2025-learning-in-the-digital-world.html) | Computational learning tasks can combine response and process evidence, including iteration and use of resources. | Use the approach as a design precedent. PISA assesses adolescents; its scales, process models and affective constructs cannot be transplanted to elementary Jems users. |
| [NCII academic progress-monitoring review](https://intensiveintervention.org/resource/academic-progress-monitoring-tools-chart) | Measurement quality requires evidence about reliability, validity, sensitivity to change and alternate forms. | Do not infer improvement from easier tasks, repeated exposure or changing support. Retained early/recent observations are descriptive, not equated progress-monitoring forms. |
| [TechCheck developer information](https://sites.bc.edu/devtech/assessments/techcheck/) | An independent, purpose-built CT instrument can offer external corroboration when its population and administration fit. | An external instrument is a possible future research measure, not an implemented integration or a general APS score. Confirm age, rights, protocol and current validation for the intended use. |

The CSTA 2026 publication carries CC BY-NC-SA 4.0. These documents cite it and use original task language; citation is not commercial reproduction permission, formal alignment review or endorsement. Released assessment examples elsewhere are not a ready-made Jems item bank.

## Research precedents

[Mislevy, Almond and Lukas's introduction to evidence-centered design](https://cresst.org/wp-content/uploads/R632.pdf) starts with the intended inference, the observations that could support it and tasks that can elicit those observations. Jems applies that sequence at the task level: a defined reasoning opportunity, a committed response and a stated interpretation. A large event log cannot replace the missing evidentiary argument.

[Shute and colleagues' game-based problem-solving study](https://myweb.fsu.edu/vshute/pdf/pvz.pdf) built a competency model, identified game indicators and compared model estimates with external measures. Its small middle-school study is a precedent for validation work, not proof of Jems efficacy or elementary norms. Neither the study's Bayesian model nor its item interpretation transfers automatically to another game.

[Morris and colleagues' automated mathematics-scoring study](https://link.springer.com/article/10.1007/s40593-024-00418-w) used item-specific input processing and model training for a bounded set of constructed-response items, with held-out evaluation against human scoring. It does not validate asking a general conversational model to rate a child's overall reasoning. The first Jems feature therefore uses known deterministic practice rules and leaves free-form context unscored.

## Background observation and structured probes serve different purposes

An ordinary conversation may reveal a child identifying a problem or proposing an experiment. It may also contain copied words, an adopted AI suggestion, a transcription error or an explanation written after the result. Saving the conversation does not resolve these alternatives. For this first implementation, such events remain context and are not graded by an LLM.

An authored opportunity makes the criterion visible: which input tests a rule, what the given result supports, or which revision addresses the observed problem. Fixed task identities, committed responses and deterministic checks make those observations auditable. The tasks remain public formative practice; repeated exposure and outside help remain possible.

The six dimensions come from the accepted Jems design: define, compare, test, interpret, revise and transfer. The first practice content covers test selection, interpretation and revision. A new surface theme or a copied successful scene does not fill the transfer dimension. Unoffered opportunities remain unknown.

## Claim ladder

| Claim | Evidence needed | Present scope |
| --- | --- | --- |
| A learner participated in a recorded activity | Valid source identity, owner, event and deduplication | Background context |
| A particular choice met this task's rule | Known task version and deterministic result; visible support/provenance | Structured practice |
| A learner uses a strategy across different tasks | Repeated relevant opportunities with adequate breadth and comparable support | Descriptive examples only; coverage must be shown |
| A learner improved on a comparable measure | Suitable task/form comparability, administration, exposure controls and uncertainty | Not established |
| Performance generalizes outside Jems | Independent tasks in distinct contexts with a justified interpretation | Separate research |
| Jems caused improvement | Appropriate comparison design, prespecified outcomes and independent measurement | Separate impact study |

Do not use arbitrary mastery percentages, LLM confidence, number of prompts, final-game sophistication, response speed or session length as substitutes for the missing evidence. A fixed rule is reproducible; its educational meaning still requires investigation.

## Practical validation sequence

First verify source provenance, persistence and response-rule correctness. Then ask elementary educators to review each actual task, criterion and distractor, and observe whether children understand the prompt and use the intended reasoning. Review reading load, language, accessibility, device demands and help classification. Those checks can improve a formative feature without pretending to establish a norm.

Next investigate task-family and variant comparability, repeated-exposure effects, alternate response modes and how much evidence a dimension needs for its intended report. Predefine how to handle missing opportunities and technical invalidity. If a future statistical model is introduced, validate it on held-out learners and task families and retain its version; fitting existing clicks is not proof that it predicts new reasoning.

Independent benchmarks and school-related claims follow PR54's separate administration, rights, human-rating and measurement plan. Preserve that distinction when adding features to either track.
