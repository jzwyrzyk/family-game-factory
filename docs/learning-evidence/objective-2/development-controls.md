# Objective 2 — Authoring, measurement, security and release controls

**Decision:** educator review and controlled validation **are postponed as approvals**, but no technical modeling, item authoring, reproducible scoring or integrity checks are postponed unnecessarily. The Jems app must not make unsupported claims. Current status is **research prototype**, no child data collection.

## 1. Item life cycle and roles
1. **Author** creates original prompt, answer key, acceptable aliases, age/grade rationale, claim, standard/component, cognitive demand, distractor misconceptions, representation, modality, transcript/audio asset and fairness considerations.
2. **Deterministic oracle** (for numerical and fixed answers) verifies answer; numeric strings have exact fraction/decimal logic and unit-mode constraints. Objective wrong answer is zero; skipped/incomplete is never automatically zero.
3. **Internal content QA** checks ambiguous or multiple solutions, grade expectations, math bounds, passage coherence, fairness, audio availability, IP/attribution, accessibility and stylistic consistency.
4. **Optional human reviewer in future** signs grade mapping and rubrics; later item pilot inspects response distributions. This should not block drafting and local synthetic engineering tests but **is required before graded deployment**.
5. **Lock/label** A, B, C forms and versions; never edit a released test in place. Maintain a secure item-leak register. Revise by new form version and test score compatibility.
6. **Calibration** on appropriately consented pilot sample establishes test reliability, equating, dimensionality and construct validity. An item with a reproducible oracle is **not automatically a validated instrument**.

## 2. Full data contract
**Public research blueprint:** 24 fixed forms. Each contains subject, grade, form, item slot, claim, strand, official target code, intended format, full mark count, accessibility modality and secure-bank reference. It includes **no prompt or correct key**.

**Private authoring bank:** object with `schema = jems.secure.bank.v2`, `formId`, locked `version`, and **all** items. Each item must match a slot and contain `slotId`, `format`, `version`, `prompt` and:
- closed choice: 2–6 unique labeled options and one exact `correctOptionId`.
- numeric: an exact `correctValue`, optional unit mode and accepted synonymous unit spellings; cannot award credit for a different unit or unreviewed conversion.
- short text: fixed accepted aliases; do not accept arbitrary semantic similarity from an unreviewed model.
- human rubric: all dimensions and written 0/1/2 exemplars. **Two separate blinded raters**; any criterion disagreement must be adjudicated by a third distinct rater who records a rationale.
- listening: audio asset ID and `transcriptVisible:false`; audio production and validity must be verified before testing.

**Response:** exactly one first independently submitted response per locked item with item ID, status, help/exposure flags and optional separate rubric observations. No quiz-like feedback during the module, no hints, no auto-corrections, no GPT answer consultation. A response may be `missing`, `technical_invalid`, `assisted`, `contaminated` or `scored`. An entire form gets **no raw total** when any required item cannot be validly scored.

**Output:** raw points/possible and per-claim results are internal research descriptions, `notNormed:true`, `growthClaimAllowed:false`, `schoolProficiencyClaimAllowed:false`. No national percentile, grade equivalence, growth chart or causal claim until empirical calibration and appropriate comparisons.

## 3. Assessment integrity and permissions
- Keep original item content and answer keys out of **any public repo, client bundle, static Pages deployment, child chat transcripts and generated game code**. Research code here is intentionally public and does not include the secure bank.
- Production assessment content must be stored in a **purpose-isolated authenticated server**, not the existing public website or game-generation sandbox. Verify membership, item access, signed session, scoped retrieval, rate limits, audit, credential rotation and no outbound provider logging of secure keys.
- Provider AI services must never receive protected complete forms for coaching; do not ask LLMs to score private content without explicit security/legal approval and measured scorer validity.
- Children may decline assessments; production consent and research participation must be opt-in as appropriate. Record parent permission, withdrawal, minimal retention, deletion and school use agreements with dedicated privacy review.
- School outcomes/M-STEP/IXL/MAP are **authorized third-party evidence**, never equivalent Jems-scale metrics; no scraping, no reuse of protected questions.
- Audio and writing are personally revealing. Avoid raw recordings and drafts unless essential and explicitly approved; use transcription/derived records only when defensible, minimize access and define deletion cascade.

## 4. Test operations and accommodations
- Start only after neutral practice directions with **unscored** example, not an item from the secure forms. Show test overview without threat/competition.
- Default no timers in scoring. Capture elapsed time only for test operations and invalidation, not inferred intelligence.
- G1–G2 breakable modules; reading text not read aloud when reading is measured. Math instructions may be read neutrally. G3–G4 listening source remains audio-only.
- Content/load/font/contrast/touch/keyboard/screen reader, language status, hearing/visual support and text-entry accommodations reviewed. Accommodation must not silently transform comprehension into listening and claim comparable reading.
- A crashed test or playback failure is **technical invalid**; preserve opportunity for a fair restart without exposing answer keys.
- Proctor neutral script, number of replays, optional pauses, questions from adults and irregularities documented per standardized administration mode. Same mode across pre/post for comparison; if different, report separately.

## 5. Measurement/calibration plan (external expertise later)
- **Response-process evidence:** observe small samples of children solving each type (how they interpret directions, distractors and controls). Iterate items *before* locking.
- **Content coverage:** specialist reviews every claimed standard *subclause*, item family and grade-bound complexity; independent forms sample enough distinct stimuli and representations.
- **Reliability:** alpha/omega where justified, conditional error for each score level, test-retest on nonexposed forms, inter-rater weighted kappa/ICC for writing, dimension check.
- **Item properties:** difficulty, discrimination, distractor effectiveness, local passage dependence, speededness, floor/ceiling, differential item functioning and invariance.
- **Equating:** randomize/counterbalance A/B order, incorporate secure anchor items / suitable IRT or equivalent linking after collecting enough data. A/B/C are **structurally parallel only** today; not equated.
- **External criterion:** with permission, correlate with official Michigan G1/2 benchmarks and G3/4 M-STEP; compare provider-native standardized growth windows, not Jems' arbitrary percent. Discriminant validity and additional content external outcomes required for strong claims.
- **Impact:** controlled group with preregistered primary Math/ELA outcomes, meaningful learning dose, baseline adjustment and attrition/cluster handling. Could use active comparison of equivalent educational time.
- **Progress-monitoring precedent:** NCII evaluates sensitivity, slope reliability, alternate forms and decision rules as distinct properties; its strong alternate-form rating concerns 20+ comparable forms, **far beyond our A/B/C research exam drafts**. https://intensiveintervention.org/resource/academic-progress-monitoring-tools-chart

## 6. Score and reporting decision tree
| Situation | Allowed internal statement | Prohibited |
|---|---|---|
| Correctly solved 7 of 9 *practice* questions | Recorded independent practice success | Grade-level proficiency |
| 25/36 on original uncalibrated form A | 25 raw points earned of 36 possible | “69th percentile” or “ahead of school” |
| Form A then B, scores differ | Show two separate raw forms with prominent noncomparability | “Improved by 20%” |
| Linked/equated form change + acceptable error | Descriptive growth on a calibrated Jems scale with uncertainty | Jems caused growth |
| Authorized Michigan external result | Report provider-native result with grade, date and original interpretation | Replace with Jems score or claim test question reuse |
| Randomized study positive effect | Prespecified controlled effect estimate with CI and limitations | Marketing conclusions beyond tested grades/tasks |

## 7. Automated gates implemented now
- 24 forms must exist, exactly 915 item slots across Math/ELA grades 1–4 A/B/C, unique IDs.
- Official mathematics and ELA claim quotas match the state reference tables; correct standards references, grade/claim, max points, scoring rubric ID, hidden answer keys.
- Synthetic private-bank fixture fills and grades all 915 slots; mutations remove a response or add AI help and are refused as evidence. Test verifies no key leaks in display payload.
- Actual secure-bank validators require complete matching item/slot lists, valid choices, numeric answers, human scoring anchors, audio clip references and immutable versions.
- Duplicate option IDs, missing key, missing/assisted response, transcript leaked, rubric rater agreement failure, invalid score bounds, unknown standards: fail or return **no score**.
- All are **logic/integration tests, not item-content or psychometric validation**.

## 8. Remaining engineering work without waiting on teachers
1. **Provisional bank authoring done privately:** 426 Math + 489 ELA *machine-drafted* candidates linked to all 915 slots, on private `research/jems-academic-items-v0`. Source-level duplicate-prompt repairs are recorded and a private audit can verify full stimulus uniqueness. **Do not** treat those files as completed validated item banks or store them in the actual game generation worker; move to dedicated isolated assessment infrastructure after extensive rewriting.
2. Validate original item keys via independent numeric oracles, inspect for duplicate solutions; record authoring revisions and reviewer notes. Produce real audio and appropriately varied protected reading passages.
3. Implement a private assessment-only delivery service behind verified family authorization, session boundaries, item-bank access control and audited human rating. Keep it disconnected from production until privacy gates are satisfied.
4. Design independent parent research report with sample-size/uncertainty labels, avoiding standardization or outcome comparisons prior to data.
5. Later specialist grade-level review and calibrations become release gates—but **they are not reasons to stop developing draft items or backend infrastructure**.

## 9. Source record and assumptions
- Official state K–2 count blueprint **April 2022** and M-STEP grades 3–7 count blueprint **March 2021**. They are public benchmarks, **not** test item licenses.
- Michigan K–2 state test administration in 2025–26 uses two sessions and audio support for younger children. Jems' proposed 2–3 shorter sessions are **new product assumptions**, not copied validated timings.
- NCII progress monitoring: https://intensiveintervention.org/resource/academic-progress-monitoring-tools-chart
- IES K–3 foundational: https://ies.ed.gov/ncee/wwc/PracticeGuide/21
- NCME / AERA / APA Testing Standards: https://ncme.org/resources/books/testing-standards/
- Reading League assessment literacy guide: https://www.thereadingleague.org/media/administrators-role-in-developing-an-evidence-aligned-assessment-plan/
- Source licenses for any quoted framework text or released sample item remain unresolved. This repo authors original summaries and demonstrations; does not copy commercial test items.

**Scope note:** Do not merge/deploy this into the adult-only production pilot. Research approval can proceed alongside engineering without exposing minors or prematurely storing test histories.
