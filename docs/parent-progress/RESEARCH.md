# Parent reporting research and decisions

**Reviewed November 19, 2026 (America/New_York).** Primary sources below describe
current vendor functionality or educational guidance; they do not establish Jems
efficacy. Product choices are our application of that evidence. The
[feature contract](README.md) separates implemented boundaries from later work.

## Product comparison

| Reference | Verified reporting approach | Decision for Jems |
| --- | --- | --- |
| IXL | Student Summary connects assessment history, accomplishments, focus areas, and home support; Questions Log exposes actual answered questions. SmartScore is a proprietary skill-practice index using difficulty, responses, and consistency, not percent correct. Its labels include 80 proficient, 90 excellent, 100 mastered. [S1–S3] | Use summary → skill → example → next action. Explain each Jems metric directly; do not copy a 0–100 score or suggest numeric equivalence. |
| IXL assessments | Flex/LevelUp diagnostic levels describe working grade levels; IXL illustrates 400 as readiness for grade 4 and 450 as partway through its grade-4 curriculum. LevelUp separately supplies nationally normed percentiles. [S4–S5] | Distinguish a practice score, diagnostic level, and percentile. Jems currently supplies none of the latter two; a grade setting is a content boundary. |
| Khan Academy | Parent reports separate activity and individual/assignment details. The August 25, 2026 guide defines course mastery as the share of skills at Proficient or Mastered, with Brazil/Peru exceptions; skills can move up or down. [S6–S7] | Keep activity distinct from skill evidence. State the denominator and avoid presenting a practice catalog as complete school coverage. |
| Prodigy | Separate Math/English views, recent skills, weekly questions, curriculum progress, and monthly report cards. Its July 8, 2026 guide defines in-game skill mastery using seven consecutive correct answers. [S8] | Borrow subject navigation and approachable summaries. Retain Jems assistance/delayed-evidence rules; a streak does not prove retention or transfer. |
| Seesaw | Families inspect approved student work in a chronological journal, filter it, and respond where classroom settings allow. [S9] | Make actual tasks and creations inspectable. First release exports locally; it does not add school accounts, teacher approval, or messaging. |

These are feature and interpretation comparisons, not a claim of equivalent
curriculum depth, psychometric quality, user experience, or measured outcomes.
Vendor terms such as “mastered” retain their own definitions. A Jems fraction
cannot be converted to SmartScore, a diagnostic level, a percentile, or a school
test result without a justified linking/validation study.

## Framework connections and evidence principles

| Reference | What it contributes | Reporting rule |
| --- | --- | --- |
| Common Core Math | Content expectations and mathematical practices, including reasoning, modeling, checking, and adapting a solution. [S10] | Show the specific learning goal and code where available; a content tag is not proof of all aspects of that standard. |
| Common Core ELA | Separate reading, writing, speaking/listening, and language expectations, with grade-specific detail. [S11] | Show observed strands and unobserved areas. Grammar or selected-response reading alone does not establish full ELA proficiency. |
| CSTA 2026 | PK–12 CS concepts, practices, and progressions; the official development record says publication occurred in summer 2026. [S12–S13] | Keep legacy 2017 mappings versioned until reviewed. Do not silently relabel old codes; current high-level references are not certification. |
| ISTE Student Standards | Innovative Designer 1.4 includes testing/refining prototypes; Computational Thinker 1.5 includes decomposition and algorithmic solutions. [S14] | Connect an observed behavior to a named practice; no overall ISTE score or general-thinking inference. |
| Evidence-centered design | Assessment claims require an evidentiary argument connecting tasks, observable evidence, and interpretation. [S15] | Preserve task/version, response, conditions, provenance, scoring rule, and supporting examples; narrow the claim to its evidence. |
| Retention and transfer | IES recommends spaced learning and retrieval. National Academies distinguishes application in new contexts and explains why multiple contexts matter. [S16–S17] | Immediate completion, later independent recall, and meaningful new-context application remain different observations. |
| Formative assessment | Clarify a goal, elicit evidence, interpret it, and act on it. [S18] | Every useful opportunity should lead to a concrete practice step or parent question, with the evidence visible. |
| Responsible score interpretation | AERA emphasizes intended-use validity, appropriate opportunity to learn, and justification for proficiency classifications. [S19] | Missing opportunity is not failure; access supports must be interpreted against the intended construct; unvalidated categories remain product observations. |

## Decisions for the first release

1. **Four separate areas:** Math, Language Arts, Computational Thinking, Problem
   Solving. No composite learning, intelligence, attention, or school-readiness score.
2. **Evidence before adjectives:** describe what happened, when, and with what
   recorded help. “No hint recorded” does not establish unaided scene authorship.
3. **Honest time scopes:** selected-period records and cumulative skill states are
   distinct. Retained history cannot support a complete historical growth curve.
4. **Useful uncertainty:** insufficient evidence and unavailable domains stay
   neutral. Repeated or unoffered tasks are not new independent evidence.
5. **Readable examples:** a journal and local teacher summary make observations
   reviewable; no LLM-written diagnosis or unsupported success story is required.
6. **Actionable opportunities:** prioritize recorded support needs and due reviews;
   offer a short activity and an explanation prompt rather than generic “try harder.”
7. **Familiar references with limits:** explain IXL and school-framework connections
   in ordinary language; avoid score conversion, grade placement, and full-coverage claims.
8. **Preserve existing ownership:** read current engines and stores, reuse settings,
   and consume the concurrent Problem Solving feature only through its optional adapter.

## Subsequent validation and research

Educators should review task-to-standard fidelity and content gaps. Parent usability
work should test whether families distinguish activity from progress, support from
independence, and no evidence from difficulty. Evaluate understandable actions and
representative examples, not just dashboard appeal. A future growth view needs
comparable task conditions and a defensible baseline/follow-up design; research
on retention, transfer, or product effectiveness needs its own study. None is
established by fixture tests, screenshots, standards tags, or a successful merge.

## Sources

All URLs accessed November 19, 2026. Dates below are publisher dates when available;
“current guide” means no publication date was established. Summaries are paraphrases.

- **S1:** IXL, [How does the SmartScore work?](https://www.ixl.com/help-center/article/1272663/how_does_the_smartscore_work), current guide. The help page's indexed article text was available when its rendered page returned only the navigation shell.
- **S2:** IXL, [Keep parents in the loop with IXL Analytics](https://blog.ixl.com/2025/02/04/keep-parents-in-the-loop-with-ixl-analytics/), February 4, 2025; updated March 27, 2025. The publisher flags changing assessment terminology; current assessment claims use S4–S5.
- **S3:** IXL, [How can I use the Questions Log?](https://www.ixl.com/help-center/article/8422671/how_can_i_use_the_questions_log), current guide.
- **S4:** IXL, [What do the levels in IXL Assessments mean?](https://www.ixl.com/help-center/article/2909803/what_do_the_levels_in_ixl_assessments_mean), current Flex/LevelUp guide, retrieved through indexed article text.
- **S5:** IXL, [The LevelUp Diagnostic is nationally normed](https://blog.ixl.com/2026/07/13/the-levelup-diagnostic-is-nationally-normed/), July 13, 2026. This newer announcement describes K–12 Math/ELA coverage; older product PDFs may describe a narrower rollout.
- **S6:** Khan Academy, [Parent activity reports](https://support.khanacademy.org/hc/en-us/articles/36120531499789-What-reports-can-I-use-as-a-parent-to-monitor-my-child-s-activity-on-Khan-Academy), updated June 9, 2025.
- **S7:** Khan Academy, [What are Course and Unit Mastery?](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery), updated August 25, 2026. Do not substitute older weighted-mastery-point explanations for this current calculation.
- **S8:** Prodigy Education, [Parent Dashboard](https://prodigygame.zendesk.com/hc/en-us/articles/115001744726-Parent-Dashboard), updated July 8, 2026.
- **S9:** Seesaw, [Using the Learning Journal to engage with your student's work](https://help.seesaw.me/hc/en-us/articles/205803229-Using-The-Learning-Journal-to-engage-with-your-student-s-work), current family guide.
- **S10:** Common Core State Standards Initiative, [Standards for Mathematical Practice](https://www.thecorestandards.org/Math/Practice/), current official presentation of the Common Core standards.
- **S11:** Common Core State Standards Initiative, [How to read the ELA standards](https://www.thecorestandards.org/ELA-Literacy/introduction/how-to-read-the-standards/), current official guide.
- **S12:** CSTA, [2026 PK–12 Computer Science Standards](https://csteachers.org/pk12standards/), 2026 edition, DOI `10.1145/3820482`.
- **S13:** CSTA, [Development](https://csteachers.org/pk12standards/about/development/) and [Standards FAQ](https://csteachers.org/pk12standards/about/standards-faq/), current 2026 edition guidance.
- **S14:** ISTE, [Standards for Students](https://iste.org/standards/students), current maintained online version reviewed November 19, 2026; sections 1.4 and 1.5.
- **S15:** Mislevy, Almond, and Lukas, [A Brief Introduction to Evidence-Centered Design](https://cresst.org/publication/a-brief-introduction-to-evidence-centered-design/), CRESST Report 632, May 5, 2004.
- **S16:** Institute of Education Sciences / What Works Clearinghouse, [Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/PracticeGuide/1), September 2007; recommendations distinguish their evidence strengths.
- **S17:** National Research Council, [How People Learn: Learning and Transfer](https://www.nationalacademies.org/read/9853/chapter/6), expanded edition, 2000, DOI `10.17226/9853`.
- **S18:** California Department of Education, [Formative Assessment and Tools for Teachers FAQs](https://www.cde.ca.gov/ta/tg/Sa/formativeassessfaq.asp), reviewed April 6, 2026.
- **S19:** American Educational Research Association, [Position Statement on High-Stakes Testing](https://www.aera.net/About-AERA/AERA-Rules-Policies/Association-Policies/Position-Statement-on-High-Stakes-Testing), 2000. Its validity/fairness principles inform this lower-stakes design; Jems is not a high-stakes assessment.
