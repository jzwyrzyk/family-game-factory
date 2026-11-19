# Assumptions, licensing, methodological risks and release gates

**Documented decision record:** 2026-11-18. **Status:** DRAFT. Every numeric test length, item count, rubric cut and timing is a Jems pilot hypothesis unless linked to a cited instrument's own spec.

**Reference correction, November 19, 2026:** CSTA 2026 is now the current published standards reference. Its full publication carries CC BY-NC-SA 4.0; existing 2017-inspired Jems grade anchors have not been revalidated against it. PISA 2025 Learning in the Digital World adds a relevant process-assessment precedent for adolescents, not elementary norms. The background formative feature is a separately authorized implementation; the independent assessments, external records and research operations below retain their own gates.

## A. Explicit assumptions and risk ledger
| ID | Assumption | Evidence status | Risk if false | Required test / owner |
|---|---|---|---|---|
| A01 | Intended child scope initially grades 1–4 | Product-scope assumption | wrong norms and literacy load | product owner to confirm grade by school year |
| A02 | National CCSS is a useful U.S. benchmark backbone | official framework exists | state-specific deviations | curriculum lead state crosswalk before pilots |
| A03 | Math and ELA can be assessed with original standards-tagged items | educational precedent | weak validity if items shallow | trained educators, technical review |
| A04 | Existing 73 math units are supplemental, not full coverage | verified repo docs | false mastery claims | exhaustive CCSS gap crosswalk |
| A05 | Current language practice does not fully measure extended writing/reading | verified repo docs | inflated ELA coverage | add unassisted passages/writing |
| A06 | CT separate from APS will reveal meaningful differences | construct hypothesis | scores correlated or not separable | factor/discriminant validity later |
| A07 | TechCheck appropriate for grade 1–3 children aged 5–9 | developer-validated age range | grade-4 mismatch and license | written permission, specialist guidance |
| A08 | cCTt useful grades 3–4 | research (575 children) | language/form/permission issues | seek license and validation material |
| A09 | NGSS engineering design covers useful APS process | standards-grounded | not general cognitive measure | many cross-context tasks + performance review |
| A10 | Original test items can be created without copying protected test banks | content-production assumption | infringement or teaching-to-test | independent item authoring, source review |
| A11 | A/B forms can be equated with sufficient research | psychometric requirement | spurious “growth” | field trial + professional calibration |
| A12 | 20–28 math, 22–24 ELA, 16 CT, 2 APS tasks per form are feasible | **proposed**, not validated | fatigue or unreliable subscores | usability studies by grade |
| A13 | CT/APS scores can be measured unassisted while product contains powerful AI | requires controls | contamination by suggestions/adult | isolated protected test session |
| A14 | Longitudinal storage is allowed once privacy design approved | **NOT APPROVED** | child privacy/legal risk | approvals + purpose/retention controls |
| A15 | Schools/families can provide authorized external data | conditional, not confirmed | no independent benchmark | permission/partnership and data agreement |
| A16 | A scoring rubric can be consistently applied to children of different ages | untested | rater bias and unstable scores | grade anchors, double-blind scoring |
| A17 | Test familiarity does not drive all measured gains | untested | false improvement | alternate forms, control group, delayed assessment |
| A18 | Active problem-solving in game-making transfers to unrelated tasks | **key research hypothesis** | no differentiated moat | far-/near-transfer test and controlled study |
| A19 | More practice time produces meaningful academic exposure | **not established** | engagement with negligible gains | measure dose of actually relevant problems |
| A20 | Math and ELA grade scores could predict school test outcomes | untested | marketing overclaim | prospective correlations on provider-native scores |
| A21 | Adult-only initial production continues until child legal gates pass | project deployment boundary | inadvertent minor use | release gating, owner sign-off |
| A22 | Public availability licenses commercial reproduction or official endorsement of CSTA standards | **Not established**; 2026 publication is CC BY-NC-SA 4.0 | unauthorized reproduction or alignment claims | review applicable rights and formal alignment process; cite broad concepts in original language |
| A23 | Six equally weighted APS ratings form a valid total scale | **Untested research choice** | misleading precision or composite ability claim | human anchor calibration and dimensionality/aggregation review; no background total |
| A24 | No recorded in-app hint proves unassisted reasoning | **False** | external/adult/AI help counted as independent | preserve unknown help and step-level source/timing; use protocol-observed evidence for benchmarks |

## B. Rights register and permitted design uses
| Resource | Publicly available? | Can Jems copy test items into commercial product? | Approved use for this R&D |
|---|---|---|---|
| CCSS math/ELA | Yes | Standards text subject to conditions of published commercial license; **not blanket authorization for third-party examples/tests** | cite official codes, build original alignments, review terms |
| Michigan academic standards | Yes | Terms/third-party components to be reviewed | grade expectation crosswalk |
| Michigan K–2 official benchmark | Public overview; tests administered through state systems | **No permission established** | school-authorized external score only |
| M-STEP samples | Viewable practice items | **No blanket copy permission established** | format/rigor benchmark; build original questions |
| 2026 NAEP reading and math frameworks | Yes | No assumption of rights to the secure items or individual norms | Grade-4 content/complexity reference |
| IES WWC guidance | Public reports | guidance not assessment item pool | evidence-based instructional design |
| NCII tools chart | Public | not a free licensed test bank | method for evaluating psychometric properties |
| IXL diagnostics | Proprietary platform | **No** | optional authorized score import subject to provider terms/contracts |
| MAP Growth / Star | Proprietary licensed tests | **No** | external licensed outcome when agreed |
| CSTA 2026 standards; legacy 2017 mapping | Yes, published 2026 document is CC BY-NC-SA 4.0 | No commercial reproduction or official endorsement permission is established here | cite current reference; original tasks; educator review of 2017-to-2026 mapping |
| TechCheck | Descriptive info/examples public; full test by request | **No commercial rights established** | pursue direct permission; no item copying |
| cCTt/BCTt | Research published | **Rights unknown** | request authorized instrument |
| NGSS engineering design | Public | reproduce only after applicable terms reviewed | original performance tasks mapped by codes |
| OECD PISA tasks | Public descriptions and some materials | no embedded reuse without permission | conceptual research only; wrong age norms |

**Rights rule:** an item found online, released sample or downloadable PDF is not automatically public-domain, and "standards-aligned" is not "officially endorsed." Obtain professional legal review for all external content at commercial launch.

## C. Validation plan: what exhaustive means in practice
### 1. Content & construct
- Formal definition per domain; content-by-grade blueprint; standards mapping including **every official substandard** with `tested/practiced/gap` state and version; grade/curriculum lead review.
- Four novel assessment bank(s) with 3+ forms; identical form specifications, independent distractor/key validation; accessibility/translation plan.
- Cognitive interviews with representative children and educators; revise items that measure reading load, device skill or adult help rather than target.
### 2. Psychometric research
- Item statistics, discrimination, dimensionality, reliability, repeated-measure sensitivity, equating, rater agreement (writing/APS), differential item functioning; use appropriate models and sample sizes.
- Standard setting for any claims of grade-level proficiency. Outside licensed norms must stay in the **provider's native units**.
- Feasibility runs cannot establish precision, validation, norms or efficacy; a few family tests are only prototype usability.
### 3. Research study
- P0 outcomes should focus on math/ELA independent growth with a small number of prespecified hypotheses. CT and APS have separate secondary/exploratory outcomes until measurement properties adequate.
- Start with consenting adult-managed pilot, then baseline and matched post with comparison group; later preregister randomized/cluster study with sample size formally powered for the chosen endpoint.
- Consider active control with matched game time and academic content, not just a waitlist. Protect against contamination, differential attrition, school clustering, repeated tests and multiple comparisons.
### 4. Privacy and accessibility
- Guardian-facing transparent purpose and optional research consent, no silent historical child-data import, separate school data authorization, minimal fields, tested deletion cascade and consent withdrawal.
- Distinguish no raw voice retention policy from longitudinal scored records; do **not** claim “zero retention” of *all* child data while storing achievement history.
- Apply appropriate COPPA/FERPA/legal review, accessibility, accommodations, human oversight and data processing agreements. Longitudinal tracking is off until approvals.
### 5. Product engineering
- Assessment-specific namespace/service and immutable forms; do not retrofit high-stakes status into existing adaptive practice counters.
- Secure item bank inaccessible from public GitHub, browser assets, LLM prompts, and generated game source. **Do not implement secure scored items in the public `src` tree.**
- Version the `evidence schema`, scorer, proctor script, rubric, assessment form, source license and school assessment import agreement.
- Inspect cross-PR integration: privacy/guardian consent, separate parent reporting, and voice transcription; never block the P0 game reliability release.

## D. Product release phases and acceptance criteria
| Stage | Allowed to ship? | Exit |
|---|---|---|
| Research documentation | Yes, separate draft PR; no child runtime impact | readable specs + citations + coverage gaps |
| Prototype item examples | Yes only as publicly labeled unscored demo | deterministic answer checks, educator review pending |
| Private independent assessment | **No**, not yet | rights, secure bank, consent, privacy, psychometric pilot and accessibility signed off |
| Parent progress from *existing* practice | Maybe after data/UX review | no norm or efficacy claims; show assistance and sample sizes |
| School / paid claims about improvement | **No**, not yet | independent study and externally reviewed effect evidence |

## E. Needed decisions and external expertise
- Owner: decide first pilot target geography/grade bands; product can retain CCSS baseline nationally.
- Elementary mathematics educator: sign off substandard crosswalk/word problems.
- Literacy/reading specialist: phonics, passage quality, text complexity, writing anchors.
- Educational measurement/psychometric advisor: equating, sample size, DIF and score interpretation.
- CS education specialist: CT validity, instrument choice, distinction from coding artifacts.
- Elementary science/engineering education advisor: APS performance tasks, fair tests, transfer.
- Legal/privacy lead: commercial permissions, COPPA/FERPA, consent, retention and school data agreements.
- Research coordinator: IRB/ethical review determination and protocol requirements if later conducting human-subjects research for publication or institutional partnerships.

## F. Explicit nonclaims
No valid assessment content has been field-tested in this PR. There is no established Jems national norm, state percentile, certified curriculum alignment, school achievement comparison, or evidence that Jems increases any learning outcome. Scoring implementations derived from this proposal must report actual validation status, not infer it from code passing tests.

## References
CCSS commercial license: https://www.thecorestandards.org/commercial-license/ 
CSTA 2026 publication and current overview: https://csteachers.org/2026-csta-pk-12-computer-science-standards/ and https://csteachers.org/pk12standards/about/
CSTA legacy mapping reference: https://csteachers.org/2017standards/interactive/
OECD PISA 2025 Learning in the Digital World: https://www.oecd.org/en/topics/sub-issues/learning-in-the-digital-world/pisa-2025-learning-in-the-digital-world.html
TechCheck request: https://sites.bc.edu/devtech/assessments/techcheck/
NCME standards: https://ncme.org/resources/books/testing-standards/
Michigan early benchmarks: https://www.michigan.gov/mde/services/student-assessment/early-literacy-and-mathematics-benchmark-assessments
Michigan M-STEP sample items: https://www.michigan.gov/mde/services/student-assessment/m-step/content-specific-information/paper-pencil-sample-item-sets
