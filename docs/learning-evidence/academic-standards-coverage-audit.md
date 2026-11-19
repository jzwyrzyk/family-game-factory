# Objective 1 — Michigan grades 1–4 academic standards coverage audit

**Status:** AUTOMATED SOURCE-AND-TAG INVENTORY COMPLETE; **INSTRUCTIONAL CONTENT VALIDATION NOT COMPLETE**. Research design only, not validated test, endorsed standards alignment or permission to process child assessment data. Review date: **2026-11-18**. Scope: Michigan-published 2010-adopted mathematics/ELA standards currently linked by Michigan's education department, grade 1–4.

## 1. Deliverable inventory (actual GitHub files)
1. [Full machine-readable standards crosswalk](michigan-grades-1-4-standard-crosswalk.json): **455 official-style codes** (including 189 lettered children), their parent-child links, grade, strand, official reference URL and exact/current Jems practice-tag evidence. Not published full standards text.
2. [Educator-review queue](primary-standard-review-queue.csv): **266 primary standards**, children, corresponding Jems skills, flagged gaps, next action, review priority and empty sign-off fields.
3. [Original 121-skill audit](current-practice-inventory.csv): per-unit Jems practice skill references.
3a. [Source content modality footprint](practice-content-footprint.csv): all 73 math generator cases and all 192 authored ELA items, including formats and actual passage word counts.
3aa. [Source-level exemplar review sheet](skill-to-question-review-evidence.csv): all 121 practice skills with exact source paths and line numbers, sample question expressions or authored questions and scoring nature. Reviewer evidence starter, not expert sign-off.
3b. [Targeted false-positive tag / partial alignment review](standard-tag-fidelity-risks.md): cases where an existing tag likely exceeds what the question actually demonstrates.
4. [Tests](../../tests/learning-evidence-crosswalk.test.mjs): fail on unknown standard tags, missing child parents, subject/grade misalignment, silently changed skill inventory, and unvalidated claims.
5. Research provenance, source permissions and later test blueprint in this directory. This is **not** a secure assessment item bank.

### Important terms
- **Official primary standard**: a numbered `1.OA.A.1` or `RL.4.2` expectation.
- **Lettered component**: a more precise `3.NF.A.3.d` or `L.3.2.c`; reported separately so parent+child *aren't double-counted as distinct primary targets*.
- **Exact tag match**: existing curriculum metadata references this code. **This does not establish the task actually tests or teaches all of it.**
- **Missing tag**: no direct code match in existing source. This does **not** establish no related practice exists; e.g. a story-based arithmetic question may accidentally address an untagged word-problem standard.
- **Independent benchmark gap**: no presently mapped externally validated or protected Jems A/B/C assessment item. **All 266 primary standards currently have this status.**

## 2. Verified counts, by grade and subject
| Grade | Math primary standards | Math with ≥1 matching tag | Math no matching tag | ELA primary standards | ELA with ≥1 matching tag | ELA no matching tag | Math/ELA components |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21 | 13 | 8 | 41 | 4 | 37 | 3 / 40 |
| 2 | 26 | 16 | 10 | 40 | 5 | 35 | 2 / 31 |
| 3 | 25 | 21 | 4 | 42 | 8 | 34 | 12 / 48 |
| 4 | 28 | 25 | 3 | 43 | 9 | 34 | 9 / 44 |
| **Total** | **100** | **75** | **25** | **166** | **26** | **140** | **26 / 163** |

**Mathematics identifiers:** Michigan source includes **126 total** coded math standards and components. Independently corroborated **126/126** exact code equality against the Multi-State CCSS Math data published by `khash89/pbl-builder` (from Learning Commons KG 2026).
**ELA identifiers:** Michigan source includes **329 total** coded ELA standards and components. Cross-checked with official published Michigan ELA/CCSS grade-page structures; **not** yet independently compared with a separate exhaustive machine-readable ELA universe due access constraints. An ELA specialist must confirm no state-specific omission before final sign-off.
**Not-applicable placeholders:** excludes `RL.1.8` through `RL.4.8`, `W.1.4`, `W.1.9`, `W.1.10`, `W.2.4`, `W.2.9`, `W.2.10`, `W.3.9`. These appear on official website index pages but are explicitly not current grade performance expectations (e.g. grade-4 literature `RL.4.8` marked not applicable). Their absence must not be counted as a gap.

## 3. Domain-level coverage signals (primary standards; **candidate tags, not mastered or verified coverage**)
### Math
| Strand | Primary standards | With candidate practice tag | No candidate practice tag |
|---|---:|---:|---:|
| Operations & Algebraic Thinking (OA) | 26 | 19 | 7 |
| Number & Operations—Base Ten (NBT) | 24 | 18 | 6 |
| Number & Operations—Fractions (NF, grades 3–4) | 10 | 10 | 0 |
| Measurement & Data (MD) | 29 | 20 | 9 |
| Geometry (G) | 11 | 8 | 3 |
| **Total** | **100** | **75** | **25** |

**High-priority uncited Math standards, confirmed from practice-tag source:**
- **Grade 1:** `1.OA.A.1` (word problems with different unknown positions), `1.OA.A.2` (three addends), `1.OA.B.3` (operation properties), `1.OA.C.5` (counting strategies), `1.NBT.A.1` (counting sequence), `1.NBT.C.5` (mental ±10), `1.MD.A.2` (unit-length measurement), `1.G.A.2` (compose shapes).
- **Grade 2:** `2.OA.B.2` (mental addition/subtraction fluency), `2.NBT.B.6` (multiple addends), `2.NBT.B.8` (mental ±10/100), `2.NBT.B.9` (explain strategies), `2.MD.A.1-3` (measurement methods/estimation), `2.MD.B.6` (number line), `2.MD.D.9` (measurement line plots), `2.G.A.2` (arrays/partition).
- **Grade 3:** `3.OA.A.3` (apply multiplication/division in word problems), `3.MD.B.4` (line plots with fractions), `3.MD.C.6` (count unit squares), `3.G.A.2` (equal-area partitions).
- **Grade 4:** `4.OA.A.3` (multistep problems, remainders and reasonableness), `4.NBT.A.1` (10× place-value relationship), `4.MD.C.6` (measure/sketch angles).

**Curriculum-fit insight:** math practice is strongest for operations and fractions by metadata linkage, but creating a whole-number arithmetic task is not the same as performing `1.OA.A.1` word problems with all unknown positions or explaining a grade-4 remainder. Inspect the actual `src/learning/content.ts` templates before declaring the standard covered. Several existing generated “story” forms may support *some* currently untagged expectations; every claimed match requires reviewed response evidence.

### ELA
| Strand | Primary standards | With candidate practice tag | No candidate practice tag |
|---|---:|---:|---:|
| Reading Literature (RL) | 36 | 5 | 31 |
| Reading Information (RI) | 40 | 4 | 36 |
| Reading Foundations (RF) | 10 | 3 | 7 |
| Writing (W) | 33 | 2 | 31 |
| Speaking & Listening (SL) | 24 | **0** | **24** |
| Language (L) | 23 | 12 | 11 |
| **Total** | **166** | **26** | **140** |

**Confirmed actual item-bank profile:** 192 ELA items, 178 multiple choice, 4 unscored creative prompts, and 44 unique passage items with text length 9–27 words. See [content-level source audit](standard-tag-fidelity-risks.md). Those short passages cannot substantiate full grade-level reading complexity.

**Critical ELA gaps:**
- Grades 1–4: *authentic connected-text comprehension*, not just a short isolated passage and multiple choice. `RL.1.10`–`RL.4.10`, `RI.1.10`–`RI.4.10` reading-complexity benchmarks are not directly tagged.
- Grades 1–3: all `W.1.1-3`, `W.2.1-3`, `W.3.1-3` opinion, explanatory and narrative writing families lack tags. Grade 4 has two focused writing unit tags, not a full writing assessment.
- Grades 1–4: all 24 `SL` primary standards lack direct practice tags. **This does not imply the microphone feature measures or teaches speaking/listening.** Speech-to-text input is a means of interaction; conversation or presentations require independently scored, appropriate evidence.
- Foundational reading: `RF.1.2` oral phonemic-awareness and `RF.1.4` connected-text fluency lack tags; `RF.2.4`, `RF.3.4`, `RF.4.4` not directly tagged. Reading words via tile choices cannot substitute for validated oral decoding/fluency tasks.
- Grade-4 textual evidence and multiple-source analysis have some narrow practice, not enough to claim broad literacy proficiency.
- Existing language code `src/language/content.ts` deliberately **does not score open-ended creative writing**, and `docs/adaptive-language/README.md` reports 192 curated initial items (four per skill). Correctly preserve this distinction.

## 4. Educational review protocol — no numeric coverage claims until followed
For every primary standard and each lettered component:
1. **Meaning check** — educator reads official Michigan standard including its entire clause, examples, complexity/conditions and grade-adjacent prerequisites. Parent code alone is not enough when components exist.
2. **Practice source review** — locate every relevant `src/learning/content.ts` or `src/language/data-g1..4.ts` template and actual answer/hints, not just the standard tag. Record `skill_id, content_pack, template_id, edition`.
3. **Response task audit** — inspect whether child response truly demonstrates the target behavior. Flag recognition vs recall, in-text reading vs spoken passage, word problem vs naked arithmetic, motor/touch burden, adult/AI help.
4. **Depth of coverage** — assess variations, representations, non-routine tasks, error handling, distractor diversity and realistic grade boundary. Three arithmetic variants do not prove robust conceptual reasoning.
5. **Assessment separation** — author independent, novel secure test item families or explicitly mark objective as practice-only. Avoid reuse of training items; content in `src/` is public and not secure.
6. **Reviewer decision** — assign: `NO_EVIDENCE`, `OPPORTUNITY_ONLY`, `PARTIALLY_ADDRESSED`, `SUBSTANTIALLY_ADDRESSED`, `EDUCATOR_VERIFIED_INSTRUCTION`. This does **not** make a validated proficiency claim. For independent test evidence: `NO_ITEMS`, `ITEMS_IN_DRAFT`, `CONTENT_REVIEWED`, `PILOTED`, `CALIBRATED`.
7. **Sign-off** — educator initials/date/discipline; cross-grade reviewer for prerequisites; **no self-approval by an LLM**.

A standard is “instructionally mapped” only with a reviewed `skill_id → template → actual cognitive behavior` evidence link; “assessable” only with independently authored, versioned, reviewed items; “psychometrically validated” only after empirical study.

## 5. Priority queue and sequencing
The [266-standard reviewer queue](primary-standard-review-queue.csv) uses **142 P0 / 48 P1 / 76 P2** *review priorities* computed from lack of tag and academic strand criticality. P0 does **not** mean product is broken. It means an educator needs to investigate this item first. Each row has editable reviewer and notes fields.

**Pass A — academic gaps and human judgment:**
- Math G1–G2 missing OA/NBT/MD grade-critical expectations first.
- Math G3–G4 missing applied word problems, line plots, composed units and angle measuring; confirm existing tagged fractions tasks truly meet their components.
- ELA foundational reading and both literary/informational comprehension through grades 1–4, **then** independent original writing and appropriate speaking/listening.
- All primary standards, including those with tags, require content review. If a parent contains multiple lettered clauses, check each separately; parent tags do not automatically close children.

**Pass B — content-development backlog:** create new practice or improve tag only if actual evidence shows coverage. This avoids unnecessary duplicate skill families and measures quality, not just row count.

**Pass C — independent assessment backlog:** separate full math and ELA form blueprints, novel secure item banks, human-scored reading/writing where needed. This is **Objective 2**, not done by this code-level mapping.

## 6. School assessment relevance and terminology
Michigan's **grades K–2 Early Literacy and Mathematics Benchmark** assessments are explicitly aligned to Michigan standards and used as one growth measure; with appropriate authorization they are candidates for externally validating Jems' grades 1–2 learning. For grades 3–4, M-STEP Math/ELA school results are the analogous reference. **Standards mapping alone does not confer a Michigan benchmark equivalent score or growth norm.** Student performance records and released item formats have distinct permission and integrity restrictions.

## 7. Source provenance and reuse rules
- Michigan MDE current academic standards page: https://www.michigan.gov/mde/Services/academic-standards
- Math standards PDF (adopted 2010): https://www.michigan.gov/mde/-/media/Project/Websites/mde/Literacy/Content-Standards/Math_Standards.pdf
- ELA standards PDF (adopted 2010): https://www.michigan.gov/-/media/Project/Websites/mde/Literacy/Content-Standards/ELA_Standards.pdf
- Official CCSS standard IDs: https://www.thecorestandards.org/developers-and-publishers/
- Machine-readable Michigan code enumeration: `vrajshroff/Academic-Standards` source `standards/michigan/{mathematics,english-language-arts}.json`; source current Git blob SHAs recorded in the JSON manifest. How To Student/HowToStudent dataset is CC BY 4.0 and requires attribution for use: **Academic standards data provided by [How To Student](https://howtostudent.com)**. This project currently stores **code IDs and derived metadata, not protected full standard statements**, and does not ship the third-party data to Jems UI. If dataset powers commercial app UI later, display the license-required attribution prominently.
- Independent CCSS Math code enumeration from Learning Commons KG v1.11.0 redistributed by `khash89/pbl-builder` under CC BY 4.0: code sets match Michigan **126/126**. CCSS itself has its own publication and commercial licensing terms; inspect separately before reproducing full standards language.
- No licensing rights for external school test questions are assumed.

## 8. What Objective 1 still requires to be fully certified
**Automated standard-code universe and current practice-tag join: DONE.** **Official published source review: PARTIAL (Michigan source, math independent code diff, sample ELA spot checks).** **Educator-certified full subclause content interpretation and real question mapping: NOT DONE.** **State-specific differences/exception audit: not formally signed off.** **Assessment-item alignment/psychometric validation: next objectives, not claimed.**

**Exit criteria** before calling Objective 1 *final*:
- Educator review of all 266 primary standards and 189 lettered components, including actual instructions and activity content, each signed with evidence link.
- Verified Michigan source-document equivalence/crosswalk including any local differences, with date/version and independent spot checks.
- Direct examples/intentional teaching support or an explicitly accepted gap for every priority standard.
- No unreviewed practice tag promoted into coverage; no independent test score promoted into state proficiency.
- Crosswalk and curriculum changes validated in CI; protected assessment security plan signed.
