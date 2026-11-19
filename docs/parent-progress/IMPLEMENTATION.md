# Parent area implementation and verification

**Source:** `feature/jems-parent-progress-20261119`, originally based on main `eebeebeb8896554bd3619029d8ca80d4b06b2f2b`; now integrating main [`7fa7ff252e277bd9610a11afeca8bf8f1ae13715`](https://github.com/jzwyrzyk/family-game-factory/commit/7fa7ff252e277bd9610a11afeca8bf8f1ae13715), including approved brand library v1.2, PR57's maker journey and its documentation merge receipt. Runtime code in that documentation receipt is unchanged from `c6576c16e005ae58ce8c706801414be4d864242e`.
**Disposition:** implemented for review; not merged or deployed by this work. November 19, 2026 (America/New_York).

## Included behavior

The existing parent route now has Overview, Skills & progress, Evidence journal, School connections and Settings. The reporting model reads existing Math, Language and scene records; an optional versioned problem-solving provider connects without importing a concurrent feature branch. Reports use copied profile snapshots and create no new learner database.

Parents can select one learner and a retained-record time window, inspect the actual question or checked scene/version, distinguish first responses from supported completion, review comparable examples, choose an existing practice focus, and download a local text summary for a teacher conversation. Prior learning settings, family backups and device/guardian controls retain their original handlers.

No-data states are neutral. Scene checks are not independent-authorship or coding-mastery claims. Problem-solving context is not scored. Framework tags are not verified complete coverage; reports cannot convert to IXL or state-test scores. A descriptive pair of examples does not establish a calibrated or causal learning gain.

The clarity follow-up makes the time scope explicit above the skill list: Math/Language status uses all recorded practice, while counts and Creation/Problem Solving status use retained observations in the selected period. Recorded-support filtering includes hints, retries, worked examples and read-aloud on unfinished work without awarding completion. Unknown Problem Solving support has a separate filter. Missing providers and failed/malformed reads remain different states; failed sources produce no results, and readable subjects stay available without modifying saved data.

The main integration retains the new brand/provenance references, original maker artwork, cosmetic progression, and Creation/Journey navigation contracts. Parent observations do not consume maker rank or reinterpret it as educational attainment. The combined candidate needs its own browser evidence; PR57's earlier checks do not establish parent-dashboard acceptance.

The first complete hosted journey passed on `f550cb5706380f5ab84a20c741327ada1e150354` ([run 44552394554](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44552394554)). Visual review then caught overlapping phone controls and crowded chart labels despite the width assertion passing. The corrected mobile layout stacks its controls; new geometry assertions check actual overlap and readable selector sizes. Skills now foreground observed work when records exist, retaining the full catalog as an explicit choice. The corrected candidate requires its own run and screenshots.

## Verification ledger

| Check | Result and limit |
| --- | --- |
| Parent reporting model | 16 focused checks passed locally on the integration working tree: outcomes and assistance, dates, profile boundaries, duplicate scene checks, unknown evidence, exact recommendation examples, optional problem-solving records, conservative comparable pairs, unfinished-support filters, and absent-versus-failed source handling. |
| Existing source regressions | 65 Math/Language engine and creation-storage checks passed locally. These are software contracts, not observed learning outcomes. |
| TypeScript / production build | Passed during development; exact submitted-source CI is authoritative for the final revision. |
| Local browser attempt | Chromium could not start because the workspace denied its socket operation. The shared browser could not reach the workspace's loopback preview. Neither attempt is a UI pass. |
| Initial hosted runner setup | The new job's first run used `ubuntu-latest`, which resolved to Ubuntu 26.04, unsupported by this repository's pinned Playwright 1.56.1. The job is now pinned to Ubuntu 24.04 with the same browser installation step as the existing working journeys. No test assertion was changed to address this setup failure. |
| Hosted browser follow-up and readability | A subsequent hosted attempt did not complete successfully. Fixture initialization is now restricted to the top-level app, avoiding storage access from sandboxed game frames. Earlier report captures also exposed inherited light bold/table text on light panels; scoped Ink text and browser contrast assertions now cover dates, evidence text, skill names and school-table headers. The first integrated run then exposed a test-helper serialization error (`__name` from the TypeScript runner); contrast calculations now stay in the test process while browser evaluation only reads rendered styles. These harness corrections preserve every assertion and are not a final browser-pass receipt. |
| Hosted dashboard journey | Dedicated `Parent reporting and dashboard` workflow runs production-dist desktop, tablet, phone and 320px narrow-phone fixtures, local export, settings persistence, family isolation and adult-profile event handling. Its returned result and screenshots must be recorded before calling this journey verified. |
| Existing browser journeys | Adapted only to choose the new Settings tab before interacting with prior controls. Existing assertions remain. Their final CI results retain their own scope. |

Screenshots generated by the dashboard suite are labeled **DEMO RECORDS** and contain only synthetic learning histories. They are design/behavior evidence, not real learner performance. Actual devices, family usability, a secure remote parent account, cross-device history, independent assessments and educational efficacy remain separate work.

## Reproduce

Run `npm run build`, `npm run test:parent-dashboard`, and `npm run test:parent-dashboard-browser` in an environment with the repository's Playwright Chromium dependency. The dedicated workflow uploads `parent-dashboard-evidence` even after a failure. Test fixtures live only under `tests/` and are not included by the product entry point.
