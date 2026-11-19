# High-risk standards-tag fidelity findings — targeted source/content review

**Scope:** targeted semantic review of current standards tags versus actual Jems Math/ELA task prompts. This is **not a complete 121-unit educator audit**. Findings require curriculum specialist confirmation before production retagging. User-visible standard proficiency must remain **unclaimed**.

## Crosswalk is not sufficient: specific examples
| Severity | Jems source skill & existing standard tag | Observed actual practice | Standard expectation (original summary; see official link) | Assessment/curriculum consequence | Next action |
|---|---|---|---|---|---|
| **HIGH — likely mis-targeted** | `g4-pronouns` → `L.4.1.a` | Four choice items about *she*, *their*, *they* and resolving generic antecedents | Grade 4 L.4.1.a targets **relative pronouns and relative adverbs**, not merely general personal/possessive pronouns | Correct answer ≠ evidence of named clause | Have ELA specialist remap to a defensible standard or add new tasks using who/whose/which/where/when; do not silently promote |
| **HIGH — partial clause only** | `g1-plural-s` → `L.1.1.c` | Four items form/recognize plural nouns ending in -s | Grade 1 L.1.1.c also requires appropriate **matching verbs** with singular/plural nouns | Plural formation alone cannot establish subject–verb agreement | Add word/sentence agreement tasks or retag |
| **HIGH — unclear alignment** | `g2-r-controlled` → `RF.2.3.b` | Four items identify ar/or/er spelling patterns | Grade 2 RF.2.3.b targets additional **vowel teams**; r-controlled spellings are a related but distinct pattern | A spelling-recognition task does not demonstrate required decoding correspondences | Reading specialist re-evaluates intended anchor; retain r-control as supplemental if not a direct clause |
| **HIGH — broad parent tag** | `g4-add-fraction` → `4.NF.B.3` | Numeric like-denominator add/sub examples, no scenario or child explanation | The 4.NF.B.3 component family includes **unit-fraction decomposition, mixed numbers and contextual word problems** | One fraction arithmetic template cannot close all four components (a–d) | Author component-specific task families, including visual decomposition, mixed number and story tasks |
| **HIGH — broad parent tag** | `g4-multiply-fraction` → `4.NF.B.4` | Direct numeric whole-number × fraction response with hints and optional visual | The 4.NF.B.4 component family includes **interpretation, modeling and word problems** | Narrow arithmetic practice, not complete conceptual/transfer coverage | Expand item families, then review per a/b/c |
| **MEDIUM — insufficient writing evidence** | `g4-transitions` → `W.4.2.c` | Four multiple-choice isolated sentence-level linking phrases | W.4.2.c is within composing an **informative/explanatory text** and linking ideas across categories of information | Isolated selection cannot prove integrated writing ability | Add original composition and human-rated writing; keep this as formative practice |
| **HIGH — unscored & too narrow** | `g4-revision` → `W.4.5` | Four unscored creative prompts, only one explicitly asks for a revision | W.4.5 encompasses **guided planning, revising and editing**, appropriate to task and purpose | No verified rubric-scored revision evidence at all | Add draft→feedback→independent revision comparison with an anchored rubric and assistance tags |
| **MEDIUM — short passages only** | `g1-story-details` → `RL.1.1` | Four MCQs on passages containing ~9–15 words | RL.1.1 involves text-based questioning; school reading also involves a **broader text-complexity progression** | Can demonstrate a short text-detail response, but not broad grade reading proficiency | Author independent varied passages and comprehension formats |
| **MEDIUM — narrow question forms** | `g3-two-step` → `3.OA.D.8` | One generated multiplication-then-subtract story pattern | Grade 3 standard covers **diverse two-step real-world operations and representations** | Fixed template may encourage pattern recall and not prove transfer | Compare independent unseen story structures and multiple representations |

## Directly observed content footprint
**Grade 1 ELA**: 48 authored items; 42 MCQ, 5 word-tiles, 1 edit; 4 passage items on original mini-passages **9–15 words**; 0 open creative.
**Grade 2 ELA**: 48 items; 47 MCQ, 1 word-tiles; 4 passage items (**13–20 words**); 0 open creative.
**Grade 3 ELA**: 48 items; 46 MCQ, 1 sentence-tiles, 1 edit; 16 passage items (**11–26 words**); 0 open creative.
**Grade 4 ELA**: 48 items; 43 MCQ, 1 sentence-tiles, 4 unscored creative; 20 passage items (**10–27 words**).
**Total**: 192 authored items, **178 MCQ**, 6 word-tiles, 2 sentence-tiles, 2 edit, 4 unscored creative, **44 short-passage items**. Original passage word lengths across all four grades **9–27 words**. Exact question texts not redistributed in this report; source is `src/language/data-g1..g4.ts` and independent generator in `src/language/content.ts`. Math has 73 existing deterministic switch cases in `src/learning/content.ts`; generated variability requires runtime item sampling, not inferred from case count. Machine-readable unit footprint: [practice-content-footprint.csv](practice-content-footprint.csv).

**Critical distinction:** 44 separate short passage items do not equal 44 grade-appropriate extended texts. Short controlled items are fine as *supplemental practice*, but they are insufficient for a comprehensive grade reading/composition benchmark.

## Immediate controls
1. Move suspicious tags into review, not automatically “remove” them in production: current scores/history may rely on legacy tags and immutable content versions.
2. Add new `alignment_verdict` to the follow-on curriculum contract: `accepted`, `partial`, `misaligned`, `unreviewed`; store source evidence and reviewer/date.
3. For each accepted link: require an actual task example and child-observable performance demonstrating the **specific** subclause.
4. Do not count `g4-pronouns` as demonstrated `L.4.1.a` without review. Do not count `g1-plural-s` as subject/verb agreement. Do not credit every 4.NF.B.3 subclause from one fraction operation.
5. Create *new*, corrected curriculum pack versions where necessary; prior profiles/evidence preserve historical provenance and remain recoverable.
6. Continue to call existing scores **formative practice**, not comparable to Michigan K–2 or M-STEP scores.

## Original authoritative references
- Grade 4 language: https://www.thecorestandards.org/ELA-Literacy/L/4/
- Grade 1 language: https://www.thecorestandards.org/ELA-Literacy/L/1/
- Grade 2 foundational reading: https://www.thecorestandards.org/ELA-Literacy/RF/2/
- Grade 4 fractions: https://www.thecorestandards.org/Math/Content/4/NF/
- Grade 4 writing: https://www.thecorestandards.org/ELA-Literacy/W/4/
- Grade 1 literature reading: https://www.thecorestandards.org/ELA-Literacy/RL/1/
- Grade 3 math OA: https://www.thecorestandards.org/Math/Content/3/OA/

No grade-level efficacy or psychometric conclusions have been drawn from this targeted review.
