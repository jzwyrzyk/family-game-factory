# Parent progress

**Feature contract — November 19, 2026.** This describes the parent-area source on
`feature/jems-parent-progress-20261119`, not a production deployment or validated
learning outcome. [Delivery state](../../DELIVERY-STATE.md) owns release evidence.
The [research and comparison record](RESEARCH.md) explains the design choices;
the [implementation ledger](IMPLEMENTATION.md) records verification and limitations.
The current integration includes main `c6576c16e005ae58ce8c706801414be4d864242e`
with approved brand library v1.2 and PR57's cosmetic maker journey. Maker levels
remain separate from the learning evidence described here.

## Purpose and boundaries

Help a parent answer: **What has my child tried? What did they demonstrate? What
help was involved? What would be useful next?** Use concrete examples before broad
conclusions. Keep Math, Language Arts, Computational Thinking, and Problem Solving
separate; their observations are not interchangeable units of a total score.

The implemented [UI](../../src/parent/ui.ts) is a read-only reporting layer over existing profile-owned learning and
creation records. It adds no assessment engine, child-data database, LLM grading,
account synchronization, parent authentication, messaging, or school connection.
Existing settings still use their existing owners and persistence paths. A parent
page is not a new access-control boundary; existing family/device controls apply.

## Parent journey

| Section | What it answers | Reporting boundary |
| --- | --- | --- |
| Overview | Recent work, a useful next step, and the four learning areas | Counts describe retained activity; rewards and time played do not establish learning. |
| Skills & progress | Skills seen, support needs, current evidence states, and due reviews | Existing Math/Language states remain authoritative; activity charts are not gain scores. |
| Evidence journal | What task was offered, what happened, what help was recorded, and when | Keep responses, forms, outcomes, and source identity together; no invented examples. |
| School connections | How Jems relates to familiar products and educational frameworks | Related content is not complete curriculum coverage, grade placement, or score equivalence. |
| Settings | Existing learning preferences and family/privacy/backup controls | Reuse current controls; changing a filter does not change the child's learning plan. |

The active profile owns every view. Switching profiles must clear old content and
invalidate stale actions before another profile's evidence appears. Empty and
unavailable states explain what has not been recorded without calling it weakness.
An absent optional provider displays **Not connected**; a failed or malformed
read displays **Records unavailable**, with a recovery notice. Failed sources
contribute no results. Other readable areas remain available, and reporting does
not overwrite the saved data that could not be read.

## Sources of evidence

| Domain | Existing source | Allowed interpretation |
| --- | --- | --- |
| Math | [Learning engine](../../src/learning/engine.ts), [insights](../../src/learning/insights.ts), retained attempts | First response, independent/supported completion, form, hint/retry history, due review, and existing evidence state. |
| Language Arts | [Language engine](../../src/language/engine.ts), retained attempts | Language-skill observations with reading support, objective responses, and open expression kept distinct. |
| Computational Thinking | [Creation workspace](../../src/creation/storage.ts), [authored challenges](../../src/creation/challenges.ts) | Whether a particular saved scene/version matched a stated behavior, with recorded hint use. |
| Problem Solving | Optional host adapter for the separately developed Problem Solving feature | Only that feature's reviewed observations; absence remains unavailable, never a fabricated score. |

The [snapshot adapter](../../src/parent/snapshot.ts) normalizes a copy, so opening
the report does not initialize or save learner state. The
[parent model](../../src/parent/model.ts) assembles snapshots after owner
filtering. Math/Language report snapshots and retained attempts must identify the
same selected owner. Creation joins only that owner's projects and revisions.
Repeated checks of the same scene/version/goal remain inspectable in history but
are collapsed for overview counts; repeated clicks do not become new examples.

### Optional Problem Solving integration

The concurrent Problem Solving feature was not merged into this branch's base.
Its parent adapter is optional: consume `FG.problemSolvingEvidence.list()` when available, show
an honest unavailable state otherwise, and do not import its unfinished scoring
or create a parallel store. Confirm the adapter's profile identity, report shape,
and error behavior when integrating that feature. Schema-v1 episodes retain
authorship, support, elicitation, task version, and exposure; context-only,
interrupted, technical-invalid, and unobserved work contributes no skill result.
Ordinary game completion and
scene passes do not substitute for useful-test, interpretation, or revision evidence.

## Evidence language

- **Not enough evidence / still discovering:** an observation limit, not a deficit.
- **Practising with support:** support or correction was recorded; preserve what kind.
- **Observed independently in practice:** the existing Math/Language engine's bounded rule,
  not a guarantee that no unrecorded outside help occurred.
- **Observed again after a break:** only the existing engine's qualifying delayed evidence;
  two sessions or a long play session do not create this state.
- **Scene matched:** a particular saved version passed the authored scene check.
  “No hint recorded” is not “unaided”: starter, copied, adult, or AI help may exist.
- **Applied in another scenario:** a future claim requiring linked, reviewed
  evidence of meaningful context change; this dashboard does not infer it from
  different game names, new artwork, or a standard tag.

The [Math contract](../adaptive-math/README.md) and [Language contract](../adaptive-language/README.md)
define their current thresholds. They are product rules, not standardized
assessment cut scores. Preserve first and final responses separately. Open writing,
shown solutions, skipped/interrupted activities, and missing responses must not
silently become wrong answers. Keep read-aloud visible rather than describing all
support as a hint; its meaning depends on the skill being observed.
The **With recorded support** filter includes hints, retries, worked examples,
and read-aloud even when the activity was not completed. This does not award a
completion. Unknown Problem Solving support/authorship has its own filter and
is not silently classified as either recorded help or independent performance.

## Date ranges, history, and charts

The 7-, 30-, 90-day and all-retained filters operate on **retained dated records**,
using the browser's local calendar days and including today.
They cannot recover older attempt details removed by existing bounded history.
Math/Language skill states and cumulative presentation counts come from their
existing aggregate reports and may include older practice outside the filter.
Label that distinction beside the view; do not make a cumulative state look like
something earned entirely during the selected week.

Counts and charts show recorded practice, independent completions, and supported
work. If an accuracy fraction is shown, its numerator and denominator must be
explicit and exclude missing responses. Adaptive task mix, difficulty, form, and
help can change; aggregate accuracy changes are not evidence of learning gains.
The implemented side-by-side examples pair the newest qualifying result with an
earlier retained example on another date, matching skill, practice tier, and form.
They expose differing help conditions and do not select only improving results.
These are not equated test forms. The first release does not reconstruct
historical skill states or fit growth curves.

## Opportunities and local teacher summary

Next steps draw from due reviews and actual support/unfinished-work observations,
with the underlying evidence accessible. Offer a short practice action and a
parent conversation prompt. No-data states suggest an opportunity to observe,
not remediation. The parent can export a local teacher-conversation summary of
the selected profile and date range, including up to 12 recent evidence examples,
next-step prompts, source references, and scope notes. The implemented export is
a user-initiated `.txt` download, not a PDF/print feature; it sends nothing to a teacher or service.
It is not a complete backup or official school report. Existing backup controls
remain the recovery path for family data.

## Acceptance and follow-up

The focused [model suite](../../tests/parent-dashboard.test.ts) passed **16/16**
tests on this integration working tree on November 19, 2026. It covers response/help timing,
completion semantics, calendar filters, owner isolation, repeated scene checks,
missing and legacy evidence, optional Problem Solving provenance, recommendation
traceability, comparable-example selection, unfinished support filtering, and
the distinction between source absence and read failure. This is deterministic fixture
evidence, not an assessment-validation study or final-head release receipt.

Verify owner isolation, profile-switch clearing, retained-window versus cumulative
labels, hint-before-answer/retry/read-aloud handling, incomplete outcomes, repeated
scene-check collapse, optional-adapter absence/failure, and escaped evidence/export
content. Inspect desktop and narrow layouts, keyboard navigation, empty states,
and preserved settings. Record executed tests and their scope in delivery evidence;
this contract alone does not assert a passing run or observed parent usability.

Later work requires explicit evidence: educator review of mappings, comparable
baseline/follow-up forms, meaningful transfer probes, actual parent comprehension
testing, and research on educational benefit. Account sync, authenticated remote
parent access, automatic digests, school imports, and normed score linking are
separate capabilities, not implied by this dashboard.
