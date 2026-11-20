# Parent area implementation and verification

**Source:** [PR65](https://github.com/jzwyrzyk/family-game-factory/pull/65), merged as [`864bee8f9427bce4a8dc0e7df5495e576fd3bcdc`](https://github.com/jzwyrzyk/family-game-factory/commit/864bee8f9427bce4a8dc0e7df5495e576fd3bcdc) after main `7fa7ff252e277bd9610a11afeca8bf8f1ae13715`, preserving approved brand library v1.2, PR57's maker journey and its documentation receipt. Development originally began from `eebeebeb8896554bd3619029d8ca80d4b06b2f2b`.
**Disposition:** merged November 19, 2026, at 10:53:45 a.m. America/New_York (`2026-11-19T15:53:45Z`). Deployment and provider activation are not established by this receipt.

## Final-head and merge receipt

The merge's complete tree `365160ea59cd951f3b4675d06d2738b361aae915` exactly matches final PR head `d3082160d82c131e44f1a738378ce1455f3c8858`. All five final-head PR workflows passed, including [parent dashboard run 44556150312](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44556150312); [Delivery state](../../DELIVERY-STATE.md#pr65-parent-reporting--merged) records each run, review state and duplicate-job disposition. The earlier development and capture evidence below retains its original commit/run identity and does not stand in for these final-head checks.

## Included behavior

The existing parent route now has Overview, Skills & progress, Evidence journal, School connections and Settings. The reporting model reads existing Math, Language and scene records; an optional versioned problem-solving provider connects without importing a concurrent feature branch. Reports use copied profile snapshots and create no new learner database.

Parents can select one learner and a retained-record time window, inspect the actual question or checked scene/version, distinguish first responses from supported completion, review comparable examples, choose an existing practice focus, and download a local text summary for a teacher conversation. Prior learning settings, family backups and device/guardian controls retain their original handlers.

No-data states are neutral. Scene checks are not independent-authorship or coding-mastery claims. Problem-solving context is not scored. Framework tags are not verified complete coverage; reports cannot convert to IXL or state-test scores. A descriptive pair of examples does not establish a calibrated or causal learning gain.

The clarity follow-up makes the time scope explicit above the skill list: Math/Language status uses all recorded practice, while counts and Creation/Problem Solving status use retained observations in the selected period. Recorded-support filtering includes hints, retries, worked examples and read-aloud on unfinished work without awarding completion. Unknown Problem Solving support has a separate filter. Missing providers and failed/malformed reads remain different states; failed sources produce no results, and readable subjects stay available without modifying saved data.

The main integration retains the new brand/provenance references, original maker artwork, cosmetic progression, and Creation/Journey navigation contracts. Parent observations do not consume maker rank or reinterpret it as educational attainment. The combined parent source has its own browser evidence recorded here; PR57's earlier checks do not establish parent-dashboard acceptance.

The first complete hosted journey passed on `f550cb5706380f5ab84a20c741327ada1e150354` ([run 44552394554](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44552394554)). Visual review then caught overlapping phone controls and crowded chart labels despite the width assertion passing. The corrected mobile layout stacks its controls; new geometry assertions check actual overlap and readable selector sizes. Skills now foreground observed work when records exist, retaining the full catalog as an explicit choice. The corrected candidate passed its own journey and visual review as recorded below.

## Earlier development and acceptance evidence

| Check | Result and limit |
| --- | --- |
| Parent reporting model | 16 focused checks passed locally on the integration working tree: outcomes and assistance, dates, profile boundaries, duplicate scene checks, unknown evidence, exact recommendation examples, optional problem-solving records, conservative comparable pairs, unfinished-support filters, and absent-versus-failed source handling. |
| Existing source regressions | 65 Math/Language engine and creation-storage checks passed locally. These are software contracts, not observed learning outcomes. |
| TypeScript / production build | Passed during development; exact submitted-source CI is authoritative for the final revision. |
| Local browser attempt | Chromium could not start because the workspace denied its socket operation. The shared browser could not reach the workspace's loopback preview. Neither attempt is a UI pass. |
| Initial hosted runner setup | The new job's first run used `ubuntu-latest`, which resolved to Ubuntu 26.04, unsupported by this repository's pinned Playwright 1.56.1. The job is now pinned to Ubuntu 24.04 with the same browser installation step as the existing working journeys. No test assertion was changed to address this setup failure. |
| Hosted browser follow-up and readability | A subsequent hosted attempt did not complete successfully. Fixture initialization is now restricted to the top-level app, avoiding storage access from sandboxed game frames. Earlier report captures also exposed inherited light bold/table text on light panels; scoped Ink text and browser contrast assertions now cover dates, evidence text, skill names and school-table headers. The first integrated run then exposed a test-helper serialization error (`__name` from the TypeScript runner); contrast calculations now stay in the test process while browser evaluation only reads rendered styles. These harness corrections preserve every assertion and are not a final browser-pass receipt. |
| Hosted dashboard journey | **Passed** on source `e83893cfd392706aca227dbcd01a0fab3cdd7ab2`, [run 44553513882](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44553513882): production build, all 16 model/snapshot checks and production-dist desktop 1440px, tablet 820px, phone 390px and narrow phone 320px journeys. Checks cover actual examples, saved writing, duplicate checks, exports, persistence, family/adult separation, keyboard tabs, read-only reporting, text contrast, control/date-label overlap, selector size and preserved skill-filter choices. No page errors or paid requests were observed in these fixtures. |
| Visual review | Reviewed the [preserved captures](screenshots/README.md), including corrected mobile toolbar/date labels, observed-first Skills, evidence and School connections. No blocking clipping, contrast or overlap defect remained in the inspected captures. These are synthetic viewports, not actual-device or family usability acceptance. |
| Existing browser journeys and final source checks | **All five PR workflows passed on `e83893c`:** [Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44553513968), [full visual review](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44553513754), [trusted family-device security](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44553513829), [documentation context](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44553513991), and the dedicated parent workflow above. Arcade jobs for browser, learning, creative and private coach image all succeeded; the final run completed November 19 at 10:31 a.m. America/New_York. Existing assertions were preserved, with Settings navigation adapted where needed. |

Screenshots generated by the dashboard suite are labeled **DEMO RECORDS** and contain only synthetic learning histories. They are design/behavior evidence, not real learner performance. Actual devices, family usability, a secure remote parent account, cross-device history, independent assessments and educational efficacy remain separate work.

The subsequent evidence-only commit added documentation and the captured PNGs. Application source, public assets, tests, dependencies and workflows remained byte-for-byte unchanged from the verified `e83893c` revision. Its automatic workflow runs retain their own identities; no result is silently reassigned to another commit.

## Reproduce

Run `npm run build`, `npm run test:parent-dashboard`, and `npm run test:parent-dashboard-browser` in an environment with the repository's Playwright Chromium dependency. The dedicated workflow uploads `parent-dashboard-evidence` even after a failure. Test fixtures live only under `tests/` and are not included by the product entry point.
