# Synthetic validation evidence

## CI architecture and performance

**November 23, 2026 (America/New_York), implementation candidate based on main `28fe3311036f8ef9f3bfc623c522432499c08113`.** This guide separates implemented source, hosted results and activation. No merge, production deployment, traffic change, IAM expansion, provider call or Cloud Shell action is authorized by a CI receipt. The active Gateway cutover remains a separate workstream; [PR152](https://github.com/jzwyrzyk/family-game-factory/pull/152) was awaiting candidate request acceptance at this observation.

### Execution and coverage contract

The [suite manifest](../../scripts/ci/suites.json) explicitly partitions the original Arcade commands into 13 independent runner jobs. The original `browser`, `learning`, `creative`, `notifications` and `private-coach-image` names remain aggregate checks. The source ruleset requires the first three and private image, plus `Documentation references` and `Jems operations policy`; this initiative does not edit that ruleset. The image startup/refusal test remains independent of browser shards.

| Prior group | New shards | Coverage preserved |
| --- | --- | --- |
| Browser | `browser-core`, `browser-generated`, `browser-storage` | Unit/contracts, rewards, deployment/security, original play/remix/build, independent generated-game evaluation/repair, normal-motion captures, restored games, private drawings, offline and touch |
| Learning | `learning-math`, `learning-language` | Math/Language activities, integration, parent reports, grade setup, persistence/pacing, authored problem solving and readability |
| Creative / Studio | `studio-core`, `mining`, `factory` | Shared player, navigation, branding, saved/retained games, parent/adult boundaries, Mining and Factory complete viewport/scenario sets |
| Creative / other | `physical`, `creation-art`, `pals-rewards`, `child-coach` | Physical/generated games, Coding, Art, Pals, rewards, conversation/voice, first creation, submission/reconnect/failed-save recovery |
| Notifications | `notifications` | Owner-scoped notices, saved-work continuity and reading |
| Private image | `image-isolation` → `private-coach-image` | Dedicated image excludes gateway/frontend source, starts without provider access and refuses inference |

The coverage verifier recursively expands the existing npm commands and compares their exact argument vectors and multiplicities. The original 96 Arcade leaf commands remain assigned once within their required group. The complete `npm test` comparison also identifies `test:parent-dashboard-browser`, already covered by the separate parent-reporting workflow. Newly added or duplicated commands fail coverage validation. This proves orchestration equivalence; it does not prove test assertions are sufficient or authorize their weakening.

One clean production build is packaged with its exact commit, Git tree, dependency-lock SHA-256 and archive SHA-256. Each browser runner verifies all identities before extraction, then uses its own server, filesystem and browser contexts. The matrix has a bounded concurrency limit and runs longer groups first. The serial public npm entry points remain available. Superseded PR validation can cancel within that PR; production release concurrency and noncancellation are unchanged.

Every leaf command records duration and first exit code. Independent commands continue after an earlier failure to collect useful evidence, without converting that failure into success or automatically retrying it. Aggregates require a successful preparation job, exactly the selected shard receipt set, matching source/build/manifest/run attempt, the complete expected commands and successful matrix execution. Missing, duplicate, failed, cancelled or unexpectedly skipped work fails closed. A genuinely excluded group can pass only with an explicit authenticated selection reason and successful mandatory preparation.

### Change classification and trust

The [classifier](../../scripts/ci/classify-impact.mjs) compares exact base and prospective-merge source trees, using policy read from the PR's trusted base. Bootstrap without that policy, policy edits, unknown paths, renames, deletions, additions, mode changes, dependencies, test infrastructure, shared code, authentication, persistence, configuration and ambiguous mixed changes require full regression. PR titles, messages and labels never determine mandatory coverage. Manual full regression remains available.

Documentation eligibility is an exact reviewed inert-file list, not `docs/**` or an extension exclusion. Documentation review records may change only their review metadata; routing, required documents and all other policy fields remain part of identity. Release-intent eligibility accepts a strict operation-only transition while exact source, image digests, baseline, configuration and compatibility bytes remain pinned. Operations tests, documentation checks and the production transition controller remain mandatory. Missing, expired or unverifiable reusable application evidence selects full validation.

Reviewed Factory/Mining rule leaves and Language data produce dependency-aware **shadow recommendations**. Executable selection remains full: a filename and a simple import scan cannot prove that new executable behavior has no indirect effects. Isolated UI, coaching and artwork currently also default full. Broader targeting requires evidence for each dependency closure before activation; this is deliberate conservatism, not an assertion that the requested 3–6 minute target has been achieved for all feature PRs.

Loading a trusted classifier prevents a PR from silently changing that classifier's policy. It does not make an editable Actions workflow immutable. The current ruleset checks GitHub Actions names/application, so material workflow changes still require review. Stronger immutable workflow enforcement would be a separately approved required-check/ruleset decision. No new check name, bypass actor or privilege has been installed.

### Exact validation reuse and release integration

The [evidence verifier](../../scripts/ci/validation-evidence.mjs) hashes complete source closures for application, dependencies, test policy and operations, excluding only delivery narration and separately validated operational intent records. It authenticates the fixed repository/main-push workflow through GitHub APIs, requires a first-attempt full pass and exact job/suite coverage, verifies archive and build-payload SHA-256, and rejects policy/configuration/source or normative-documentation drift, revocation, expiry, cancelled/missing work or an arbitrary historical success. Reuse expires after seven days or earlier artifact expiry. No receipt can grant release authorization.

Fixture browser evidence binds the immutable built payload it actually tested. It does not attest a rebuilt payload with different metadata or runtime configuration. GitHub artifact digests and source closure are distinct from production OCI image signatures; the existing signed image, selected source S, current-main, compatibility, readiness, concurrency, etag, canary and rollback controls remain necessary. Runtime configuration changes invalidate the relevant evidence. A preproduction acceptance record must additionally bind its isolated environment configuration, complete component manifest and human acceptance; it cannot be replaced by fixture CI.

All main pushes remain full while the existing production controller consumes main Arcade success as full validation. A separate prepared [release adapter](../../scripts/ci/verify-release-validation.mjs) replaces broad historical-success acceptance with exact receipt verification. Its only legacy migration exception is the already-published cutover source `aa56b60abe152e750f9f0b5e8949bdb44be53196`, exact run `45250456124` and exact full-workflow hash, with every original hosted job independently verified. Integrating that adapter into the privileged release workflow is a distinct review/approval item; the historical activation executor's frozen hashes stay unchanged. Changing those hashes merely to rerun old authorization is prohibited.

### Three validation tiers and environment coordination

1. **Development/PR:** disconnected fixture builds, relevant contracts, conservative selection, full fallback and parallel browser evidence. No cloud or provider credentials. The PR prospective merge is validated once; a main push separately validates the reviewed integrated source.
2. **Preproduction:** follow [PR106's accepted environment direction](https://github.com/jzwyrzyk/family-game-factory/blob/8734e9b2bd19756f2801365619376c2ce5697d9d/docs/deployment/ENVIRONMENTS.md): distinct disconnected PR previews and one isolated shared DEV installation, reserved at an immutable candidate during owner acceptance. Queue shared DEV changes during reservation. Preserve its separate data, identities and adult-only testing boundaries. Live DEV provisioning and acceptance were unverified and require capabilities expressly outside this initiative; no competing staging stack is created.
3. **Production:** full applicable exact-source validation or strictly verified equivalent immutable evidence, plus all existing image/service/worker compatibility, backend-before-frontend, provenance, health, canary, rollback and production acceptance checks. A source merge, fixture pass, owner visual review and actual production acceptance remain different facts.

PR106 overlaps package scripts and canonical documentation. Reconcile those files against current main when integrating it; retain this manifest, policy and evidence boundary. The private worker's frozen source, sandbox image, runner trust and release helper are not repinned by this work.

### Browser and artifact policy

Mining already uses controlled virtual time for functional scenarios and retains separate normal-motion recording and pixel comparison. Factory's waits largely measure real input, physics and pause/cancellation behavior; they remain. The safe changes reject unknown Mining viewport selectors, avoid creating an unused pixel-comparison browser context, preserve the canonical video while removing its byte-identical raw duplicate after successful save, and prevent Factory cadence/reduced-motion captures from overwriting normal desktop/phone evidence. Assertions, timing bounds, visual tolerances and all default viewports remain intact.

Required success screenshots and visual-review videos remain available, as do failure evidence and source receipts. Routine PR shard artifacts have explicit short retention; protected-main reusable build/validation artifacts retain the verification window. Production/visual retention remains governed by those existing workflows. A shared build adds stored bytes; report both total bytes per run and retained byte-days rather than claiming that shorter retention shrinks an archive. Expired evidence triggers full validation. Do not postprocess hash-bound captures or delete success screenshots simply to improve the benchmark.

### Maintenance, diagnosis and rollback

Run `npm run test:ci` after orchestration edits, and the actual affected feature commands after behavior changes. Add a suite to its public npm entry point and the explicit shard manifest. Keep all desktop/tablet/phone, accessibility, normal-motion, persistence, recovery and profile-isolation obligations discoverable. A new shared dependency defaults full until its consumer closure is reviewed. Preserve the existing source/test documentation review process.

For a failed run, read the classification reasons and failing aggregate first, then the named shard's command receipts and evidence. An incomplete receipt is a failure, not permission to skip. Investigate the first attempt; a later pass does not erase an earlier failure or identify its cause. Use the performance reporter below to sort slow commands and compare queue time and runner consumption alongside wall time.

Rollback is a reviewed source revert of the CI architecture, restoring the previous full `test.yml` and its public npm commands while retaining the same required check names. Do not change branch protection or replay production workflows as part of that rollback. Privileged evidence integration, if later approved, must be reverted or kept compatible separately. Before any merge, recheck current main, cutover completion, PR106 overlap, all required checks and owner approval.

### Baseline audit — source 28fe3311036f8ef9f3bfc623c522432499c08113

Read-only GitHub observation on November 23, 2026 (America/New_York). Runtime samples are the latest up to three successful executions per workflow, not matched benchmarks. Historical manual and deployment samples have different sources and purposes. No workflow was dispatched by this audit.

#### Workflow inventory

| Workflow file | Trigger | Jobs and required contexts | Dependencies / runner / timeout | Observed elapsed median (min–max sec); runner min median |
| --- | --- | --- | --- | --- |
| `archetype-research.yml` | pull_request (paths); push (paths; branches main) | catalog-and-reuse | catalog-and-reuse: needs none, ubuntu-latest, repository default | 49 (45–75); 0.77 (3 samples) |
| `bubble-gum-builder.yml` | push (branches feature/bubble-gum-builders-overhaul-20261122); pull_request (paths); workflow_dispatch | host-integration, touch-transport-probe, gameplay | host-integration: needs none, ubuntu-24.04, 15m; touch-transport-probe: needs none, ubuntu-24.04, 5m; gameplay: needs none, ubuntu-24.04, 15m | 545 (539–754); 13.62 (3 samples) |
| `creation-learner.yml` | pull_request (paths); push (branches feature/coding-first-learner-overhaul-*) | learner | learner: needs none, ubuntu-24.04, 18m | 98 (96–104); 1.57 (3 samples) |
| `documentation.yml` | pull_request; push (branches main); schedule; workflow_dispatch | context **required** | context: needs none, ubuntu-24.04, 5m | 36 (26–36); 0.38 (3 samples) |
| `factory-agent.yml` | workflow_dispatch | generate, test | generate: needs none, ubuntu-24.04, 12m; test: needs generate, ['self-hosted', 'factory-isolated'], 5m | no completed executed sample |
| `game-intelligence-contracts.yml` | pull_request (paths); push (paths; branches main,research/game-intelligence-*) | contract | contract: needs none, ubuntu-24.04, 15m | 51 (44–57); 0.78 (3 samples) |
| `jems-cloud-run-release.yml` | push (paths; branches main); workflow_dispatch | verify-identity, verify-access, observe, plan, transition | verify-identity: needs none, ubuntu-24.04, 5m; verify-access: needs none, ubuntu-24.04, 5m; observe: needs none, ubuntu-24.04, 5m; plan: needs none, ubuntu-24.04, repository default; transition: needs plan, ubuntu-24.04, 20m | 25 (24–76); 0.32 (3 samples) |
| `jems-operations-contracts.yml` | pull_request; push (branches main) | contracts **required** | contracts: needs none, ubuntu-24.04, 8m | 24 (21–30); 0.35 (3 samples) |
| `jems-service-images.yml` | workflow_dispatch; push (paths; branches main) | verify-identity, verify-access, build, publish | verify-identity: needs none, ubuntu-24.04, 5m; verify-access: needs none, ubuntu-24.04, 5m; build: needs none, ubuntu-24.04, 30m; publish: needs build, ubuntu-24.04, 15m | 64 (19–107); 0.60 (3 samples) |
| `jems-visual-review.yml` | pull_request; workflow_dispatch | screenshots, brand-contract, studio-journey, joy-contract, gem-factory | screenshots: needs none, ubuntu-24.04, repository default; brand-contract: needs none, ubuntu-24.04, 10m; studio-journey: needs none, ubuntu-24.04, 10m; joy-contract: needs none, ubuntu-24.04, 5m; gem-factory: needs none, ubuntu-24.04, 10m | 253 (241–282); 8.00 (3 samples) |
| `mind-your-jems-screenshots.yml` | pull_request (paths); workflow_dispatch | screenshots | screenshots: needs none, ubuntu-24.04, 12m | 358 (342–449); 5.83 (3 samples) |
| `pages.yml` | workflow_dispatch | build, regressions, deploy | build: needs none, ubuntu-24.04, 10m; regressions: needs none, ubuntu-24.04, 25m; deploy: needs ['build', 'regressions'], ubuntu-24.04, repository default | 515 (506–525); 34.85 (3 samples) |
| `parent-reporting.yml` | pull_request; push (branches main,feature/jems-parent-progress-*) | parent-dashboard | parent-dashboard: needs none, ubuntu-24.04, 15m | 64 (61–82); 0.98 (3 samples) |
| `release-regression-contracts.yml` | push (paths); pull_request (paths) | contracts | contracts: needs none, ubuntu-24.04, 5m | 15 (13–22); 0.18 (3 samples) |
| `sandbox-publish.yml` | workflow_dispatch | publish-reviewed-sandbox | publish-reviewed-sandbox: needs none, ubuntu-24.04, 35m | 340 (340–340); 1.37 (1 samples) |
| `service-image-contracts.yml` | push (paths); pull_request (paths) | service-images | service-images: needs none, ubuntu-24.04, 15m | 36 (33–79); 0.48 (3 samples) |
| `studio-quality-review.yml` | push (branches feature/game-quality-v1); workflow_dispatch | studio-quality | studio-quality: needs none, ubuntu-24.04, 30m | 160 (157–178); 2.60 (3 samples) |
| `test.yml` | push; pull_request | notifications, private-coach-image **required**, browser **required**, learning **required**, creative **required** | notifications: needs none, ubuntu-24.04, repository default; private-coach-image: needs none, ubuntu-24.04, repository default; browser: needs none, ubuntu-24.04, repository default; learning: needs none, ubuntu-24.04, repository default; creative: needs none, ubuntu-24.04, repository default | 1345 (1289–1540); 37.93 (3 samples) |
| `trusted-device-security.yml` | push; pull_request | auth-contract | auth-contract: needs none, ubuntu-24.04, 10m | 50 (46–59); 0.77 (3 samples) |

Required checks read from active repository ruleset **27785865**: `Jems operations policy`, `Documentation references`, `browser`, `learning`, `creative`, `private-coach-image`, all bound to GitHub Actions integration 15368; strict up-to-date source policy; pull requests and resolved review threads; deletion/non-fast-forward blocks; no bypass actors. Classic branch-protection and runner inventory endpoints return 403. The ruleset is readable; no permission expansion is required or requested for this audit. Account concurrency/billing plan limits remain unknown.

Ownership follows source: feature authors own their feature suites, delivery maintainers own release/operations/workflow policy, documentation authors own review records. The advisory .github/CODEOWNERS assigns @jzwyrzyk to workflows, operations, deployment helpers, Dockerfiles, .dockerignore and package-lock.json; named code-owner approval is not required by the observed ruleset. A workflow that runs is not necessarily a named required check. Production workflows have additional guarded dependencies and fixed identities beyond branch status rules.

#### Representative Arcade measurements



| Run | Event | First attempt | Elapsed min | Runner min (all attempts) | Artifacts MiB |
| --- | --- | --- | ---: | ---: | ---: |
| [45243576623](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576623) | pull_request | success | 21.68 | 37.63 | 204.42 |
| [45295903384](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45295903384) | pull_request | success | 25.37 | 40.57 | 204.5 |
| [45295823128](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45295823128) | push | success | 25.58 | 41.38 | 204.6 |
| [45311336552](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336552) | push | success | 22.42 | 37.93 | 204.43 |
| [45312136139](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136139) | pull_request | success | 21.48 | 36.98 | 204.56 |
| [45312028151](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312028151) | push | success | 25.67 | 42 | 204.52 |
| [45250456124](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45250456124) | push | success | 25.12 | 41.85 | 204.68 |

First-attempt pass rate: 100% of 7 completed decisive runs; 0 cancellations and 0 other outcomes reported separately. 0 retried runs; 0 jobs passed after earlier failure.

| Slowest step | Samples | Median sec | Min–max sec |
| --- | ---: | ---: | ---: |
| Arcade journeys / creative / Studio journeys | 7 | 685 | 585–717 |
| Arcade journeys / creative / Child journey and recovery | 7 | 180 | 152–187 |
| Arcade journeys / creative / Physical and generated games | 7 | 177 | 170–185 |
| Arcade journeys / browser / Restored games | 7 | 139 | 136–172 |
| Arcade journeys / creative / Creation desktop and touch journeys | 7 | 114 | 98–117 |
| Arcade journeys / browser / Build actions | 7 | 103 | 101–114 |
| Arcade journeys / learning / Learning integration | 7 | 91 | 90–92 |
| Arcade journeys / browser / Live remix journey | 7 | 90 | 84–98 |
| Arcade journeys / creative / Illustrated gem journey | 7 | 59 | 51–60 |
| Arcade journeys / creative / Rewards layout, earning and persistence journeys | 7 | 56 | 51–56 |
| Arcade journeys / browser / Independent intent gameplay browser tests | 7 | 55 | 54–59 |
| Arcade journeys / creative / Art library, physical drawings and portable scenes | 7 | 51 | 42–54 |
| Arcade journeys / browser / Arcade journey | 7 | 46 | 45–48 |
| Arcade journeys / browser / Actual normal-motion review captures and input receipts | 7 | 45 | 44–46 |
| Arcade journeys / learning / Language subject integration | 7 | 44 | 43–47 |
| Arcade journeys / creative / Companion collection and playable creation journeys | 7 | 38 | 33–40 |
| Arcade journeys / creative / Saved collections and default navigation continuity | 7 | 36 | 26–38 |
| Arcade journeys / browser / Repair and retest in existing sandbox worker | 7 | 34 | 33–36 |
| Arcade journeys / creative / Design coach checks | 7 | 30 | 22–32 |
| Arcade journeys / browser / Builder journey | 7 | 21 | 20–22 |

- Read-only measurements are not a pass/fail gate or reusable release attestation.
- Workflow elapsed includes scheduling and dependency waits; job window is observed critical-path elapsed, not reconstructed DAG CPU time.
- Job queue includes dependency scheduling; jobs with missing timestamps remain unmeasured.
- Rounded job minutes estimate per-job rounding only. Hosted plan allowances, OS multipliers, runner sizes and actual charges are unknown.
- A failed attempt followed by a successful retry is reported separately; it does not establish the cause or a test-level flake rate.
- Artifacts describe those still listed by GitHub at observation time; deletion and retention affect historical size comparisons.
- Selection receipts are reported as supplied and confer no authority to skip required checks.


#### Source and workflow overlap

- `test:studio` hides Mining and Factory inside a sequential npm chain. Its 585–717 second observed span dominates Creative. Other Creative work is additive; median child/recovery 180 sec, physical/generated 177 sec, creation 114 sec. A single coarse Studio shard would leave the bottleneck largely intact.
- `test.yml` builds the same source four times (notifications, browser, learning, creative); the private-coach container build is separate and required. Baseline Creative checkout+setup+install+browser+build costs approximately31 seconds; its suite execution dominates. Shared immutable bundle distribution is useful but cannot alone produce a 50–70% speedup.
- Every pull request also invokes visual review: five more setup/builds. Brand, Studio, delight and Factory repeat functional tests already nested under Creative; screenshots are distinct visual evidence. Parent reporting repeats parent unit contracts included in learning; security repeats full unit contracts included in browser. Deduplication requires preserving the named security/release gates and evidence semantics.
- Both push source-head and pull-request prospective-merge Arcade runs execute. This duplication currently supports exact-head protection and merge-tree validation. November23 source already fixed cross-event cancellation by including event_name in concurrency; moving branch feedback to PR merge-tree checks can remove duplicate branch-push work, provided required context names remain, main pushes still establish exact-main release evidence, and hosted protection behavior is verified before activation.
- Pages production uses the existing eight-shard complete npm-test partition in scripts/deployment/regressions.py, with exact-source checkout and coverage partition checking. The current matrix has no explicit max-parallel cap. Deployment requires !cancelled() plus successful build and regressions dependencies; it does not use always(). Studio remains a coarse shard there. The worker carries a trusted copy for pinned old application sources. Reuse the manifest approach; do not repin the worker or change production workflow authority as a CI optimization.
- Feature browser scripts create their own isolated application server and contexts. npm groups are sequential; independent runner jobs remove port/filesystem collision risk. Same-runner concurrency requires explicit independent output/server state.
- tests/mind-your-jems-browser.cjs retains real-time normal-motion recording plus deterministic functional cases; its few explicit waits belong to recording observations. tests/gem-factory-browser.cjs includes fixed waits for motion/input cancellation and captures; not every wait is wasted time. Preserve normal-motion/input lifecycle assertions while optimizing functional progression separately.
- Most tests use local HTTP fixtures, generated source fixtures and mocked coach/build statuses; image start/refusal tests make no paid provider call. Private generation workflow is live execution infrastructure and outside this redesign. CI passing does not establish live models, physical devices, observed children or visual approval.

#### Artifacts and reliability

- Baseline Creative archive187,351,289 bytes (178.67MiB), total Arcade214,351,519 bytes (204.42MiB). The browser suites produce screenshots and generated evidence. Normal-motion Mining video is enabled by its separate visual-review mode and is not automatically present in routine Arcade. The archive member inventory could not be read: direct GitHub artifact storage and the connector download reference both returned403 to the workspace; content-level size attribution remains unknown. Six-second Creative upload is small beside1298-second execution; its storage burden is more significant than critical-path impact. Routine retention can shrink without removing release or visual evidence.
- Existing parent and many visual workflows explicitly retain7 days; Arcade upload steps inherit repository retention. Missing files are often ignore/warn, which cannot establish evidence completeness. A new aggregate should validate required shard receipts separately from screenshot collection.
- Most recent50 Arcade runs at observation:36 success,2 failure,12 cancelled; all run_attempt1. Decisive first-attempt rate36/38=94.7%, cancellation24%; branch/source mix and intentional supersession prevent treating this as an unbiased reliability SLO. Both failures were on old PR141 head0e5cf90; successor8bbc981 succeeded after fixture repairs. This is a repair signal, not proof of harmless flakiness.
- Latest30 visual runs:29 success,1 cancelled. Seven selected successful Arcade benchmark runs are100% first-attempt passes by selection; do not use that selected subset as the global pass rate.
- Runner-minute figures sum actual job elapsed; rounded-job estimates cannot establish billed cost. Public repository allowances, billing plan, runner class/account concurrency ceilings were not visible. No new paid execution or infrastructure was requested.

#### Associated repository

- Read-only GitHub main for family-game-factory-lab/family-game-factory-worker: dddf53dbc76796be19782c1bb5bbb99b86e99909. Its five current workflow entries are offline Python security tests, DEV offline contracts, private execution, private sandbox smoke and unauthorized-runner canary. Private execution and its trust/isolation controls are preserved.
- Local attached worker checkout52729ad is stale; it is not used as current production evidence. Production source pin and worker image/trust are independent identities. Do not alter them to transport new test orchestration.

#### Measurement method and gaps

Use node scripts/ci/report-performance.mjs --repository jzwyrzyk/family-game-factory --runs RUN_ID[,RUN_ID] --out report.json --summary summary.md. Add --baseline previous-report.json for deltas and --selection plan.json for the classifier/reuse explanation. The CLI paginates all attempts/jobs/artifacts and preserves failures, cancellations, queue observations and first-attempt results. It uses read-only gh APIs, needs no new database or cloud identity, and rejects malformed/incomplete API pagination. Step timings are available from existing Actions metadata; per-leaf suite timings come from shard receipts.

The linked runs and reporter command make the metadata audit reproducible. Keep raw logs and private provider inputs out of published reports. Account limits, actual billing and exact runtime-attribution inside old npm chains remain unknown. New runs must establish realized before/after gains; extrapolated shard sums are estimates.

#### Discoverable test command inventory

All 51 npm test entry points on source28fe331 are listed below. Commands are executable ownership/coverage references; npm test and test:browser/test:studio/test:coach are composite suites, so their test counts must not be summed as independent coverage. Setup/build/typecheck/docs and operational owner commands remain in package.json and their workflow steps.

| npm script | Command / child suite dependencies |
| --- | --- |
| `test:unit` | `node --import tsx tests/unit.ts` |
| `test:learning-ui` | `node --import tsx --test tests/learning-activity.test.ts` |
| `test:learning-integration` | `node --import tsx tests/learning-integration.ts && node --import tsx tests/parent-insights.test.ts && npm run test:parent-dashboard && npm run test:learning-profile-browser` |
| `test:browser` | `npm run test:quality && node tests/journeys.cjs && node tests/live-remix.cjs && node --import tsx tests/builder-browser.ts && node --import tsx tests/actions-e2e.ts && node --import tsx tests/generated-worker-security.ts && node tests/restored-games.cjs && node tests/learning-repair.cjs && node tests/offline-shell.cjs && node tests/construction-touch.cjs && node tests/private-drawings.cjs && npm run test:intent-playtest && npm run test:intent-repair-browser && npm run test:generated-art && npm run test:quality-capture` |
| `test` | `npm run build && npm run test:unit && npm run test:learning-ui && npm run test:learning-integration && npm run test:parent-dashboard-browser && npm run test:language-ui && npm run test:language-integration && npm run test:deployment && npm run test:browser && npm run test:art && npm run test:art-browser && npm run test:creation && npm run test:creation-browser && npm run test:problem-solving && npm run test:problem-solving-browser && npm run test:studio && npm run test:studio-notifications && npm run test:coach && npm run test:child-journey && npm run test:gem-progress && npm run test:gem-journey && npm run test:navigation-continuity && npm run test:rewards && npm run test:rewards-browser && npm run test:real-agent && npm run test:pals && npm run test:pals-browser` |
| `test:child-journey` | `npm run test:guided-creation && npm run test:first-creation && node tests/child-journey.cjs && node tests/build-continuity.cjs` |
| `test:navigation-continuity` | `npm run test:navigation-shell && node tests/navigation-continuity.cjs` |
| `test:real-agent` | `node tests/real-agent-status.cjs` |
| `test:sandbox` | `node --import tsx tests/generated-sandbox.ts` |
| `test:deployment` | `python3 -m unittest discover -s scripts/deployment -p "test_*.py" -v && npm run test:ops` |
| `test:quality` | `node tests/quality-browser.cjs && node tests/sticker-builder-browser.cjs` |
| `test:studio` | `npm run test:play-view && npm run test:brand-assets && node --import tsx tests/studio-unit.ts && node tests/homepage-entry.cjs && node tests/brand-browser.cjs && node tests/jems-delight-browser.cjs && node tests/mind-your-jems-browser.cjs && node tests/studio-journey.cjs && node tests/favorites-browser.cjs && node tests/retained-games-browser.cjs && node tests/parent-privacy-browser.cjs && node tests/adult-profile-browser.cjs && npm run test:gem-factory` |
| `test:coach` | `npm run test:read-aloud && node --import tsx --test tests/coach-receipt-recovery.test.ts && node --import tsx tests/design-coach-unit.ts && node --import tsx tests/design-coach-http.ts && node --import tsx tests/issue-28-private-coach.test.ts && node --import tsx --test tests/coach-creation-wire.test.ts tests/coach-creation-wire-http.test.ts && node --import tsx tests/issue-28-evaluation.test.ts && node --import tsx tests/studio-experience.test.ts && node --import tsx tests/studio-voice-unit.ts && node tests/design-coach-browser.cjs && node tests/studio-experience-browser.cjs && node --import tsx tests/issue-28-speech.test.ts && node --import tsx tests/private-speech-unit.ts && node tests/private-speech-browser.cjs` |
| `test:language-ui` | `node --import tsx --test tests/language-activity.test.ts` |
| `test:language-integration` | `node --import tsx tests/language-integration.ts && npm run test:learning-readability` |
| `test:intent-playtest` | `node --import tsx tests/intent-playtest-browser.ts` |
| `test:intent-repair-browser` | `node --import tsx tests/intent-repair-browser.ts` |
| `test:adult-pilot` | `node --import tsx --test tests/adult-profile-auth.test.ts tests/adult-api.test.ts tests/adult-workspace.test.ts tests/adult-pilot.test.ts tests/adult-profile-client.test.ts && node tests/adult-profile-browser.cjs` |
| `test:docs` | `node --test scripts/tests/check-docs.test.mjs` |
| `test:gem-factory` | `node tests/gem-factory-browser.cjs` |
| `test:generated-art` | `node --import tsx tests/generated-art-browser.ts` |
| `test:quality-capture` | `node --import tsx tests/quality-capture-browser.ts` |
| `test:creation` | `node --import tsx --test tests/creation-engine.test.ts tests/creation-challenges.test.ts tests/creation-storage.test.ts tests/creation-generated.test.ts tests/creation-generation-budget.test.ts tests/creation-learner-controls.test.ts` |
| `test:creation-browser` | `node tests/creation-browser.cjs && node tests/creation-recovery-browser.cjs && npm run test:creation-learner` |
| `test:gem-progress` | `node --import tsx tests/gem-progress.test.ts` |
| `test:gem-journey` | `node --import tsx tests/gem-journey-browser.cjs` |
| `test:brand-assets` | `node scripts/verify-brand-assets.mjs` |
| `test:parent-dashboard` | `node --import tsx --test tests/parent-dashboard.test.ts` |
| `test:parent-dashboard-browser` | `node --import tsx tests/parent-dashboard-browser.ts` |
| `test:rewards` | `node --import tsx --test tests/rewards.test.ts tests/rewards-integration.test.ts tests/rewards-backup.test.ts` |
| `test:rewards-browser` | `node tests/rewards-ui-browser.cjs && node tests/rewards-browser.cjs` |
| `test:problem-solving` | `node --import tsx --test tests/problem-solving-evidence.test.ts tests/problem-solving-storage.test.ts tests/problem-solving-practice.test.ts tests/problem-solving-adapters.test.ts` |
| `test:problem-solving-browser` | `node tests/problem-solving-browser.cjs` |
| `test:art` | `node --import tsx --test tests/drawing-engine.test.ts tests/drawing-bindings.test.ts tests/creation-private-art.test.ts` |
| `test:art-browser` | `node tests/art-entry-readiness.cjs && node tests/art-storage-browser.cjs && node tests/art-studio-browser.cjs && node tests/picture-tools-browser.cjs && node tests/drawing-engine-browser.cjs && node tests/creation-private-art-browser.cjs` |
| `test:first-creation` | `node --import tsx --test tests/studio-guidance.test.ts && node tests/first-creation-journey.cjs` |
| `test:pals` | `node --import tsx --test tests/pals.test.ts tests/pals-service.test.ts tests/pals-controller.test.ts tests/pals-backup.test.ts tests/pals-creation.test.ts tests/pal-scene-image.test.ts && npm run test:pals-expressions && npm run test:pals-assets` |
| `test:pals-browser` | `node tests/pals-ui-browser.cjs && node tests/pals-browser.cjs && npm run test:pals-expressions-browser` |
| `test:navigation-shell` | `node tests/navigation-shell.cjs` |
| `test:pals-assets` | `node scripts/verify-pal-assets.mjs && node --test scripts/tests/verify-pal-assets.test.mjs && node scripts/generate-pal-catalog.mjs --check` |
| `test:pals-expressions` | `node --import tsx --test tests/pals-expressions.test.ts` |
| `test:pals-expressions-browser` | `node tests/pals-expressions-browser.cjs` |
| `test:read-aloud` | `node --import tsx --test tests/friendly-narrator.test.ts tests/natural-narration.test.ts tests/natural-narration-http.test.ts tests/metadata-token.test.ts tests/private-narration-client.test.ts` |
| `test:learning-readability` | `node tests/learning-surface-contrast.cjs && node tests/learning-readability-browser.cjs` |
| `test:guided-creation` | `node --import tsx --test tests/guided-planning.test.ts tests/creation-readiness.test.ts tests/conversation-view.test.ts && node tests/build-handoff-browser.cjs && node tests/guided-creation-browser.cjs && node tests/guided-request-drafts.cjs && node tests/build-recovery-browser.cjs && node tests/build-submission-recovery-browser.cjs` |
| `test:ops` | `python3 -m unittest discover -s scripts/ops -p "test_*.py" -v` |
| `test:learning-profile-browser` | `node tests/learning-profile-browser.cjs` |
| `test:play-view` | `node tests/play-view-browser.cjs` |
| `test:studio-notifications` | `node --import tsx --test tests/studio-notifications.test.ts && node tests/studio-notifications-browser.cjs` |
| `test:creation-learner` | `node tests/creation-learner-browser.cjs` |
| `test:bubble-gum` | `node --import tsx --test tests/bubble-gum-rules.test.ts tests/bubble-gum-journey.test.ts && node tests/bubble-gum-builder-browser.cjs` |

#### Inventory sampling links

Each current-source workflow table sample uses up to three latest successful runs available at observation. An absent sample does not imply success. Historical runs for manual/deployment workflows are contextual, not freshly dispatched benchmarks.

- `archetype-research.yml`: [45112545049](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45112545049), [45110114411](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45110114411), [45108887455](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45108887455).
- `bubble-gum-builder.yml`: [45243576570](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576570), [45201101954](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45201101954), [45123458145](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45123458145).
- `creation-learner.yml`: [45243576552](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576552), [45236729697](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45236729697), [45201101588](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45201101588).
- `documentation.yml`: [45312136413](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136413), [45311336423](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336423), [45311110626](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311110626).
- `factory-agent.yml`: no successful run available.
- `game-intelligence-contracts.yml`: [45201101959](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45201101959), [45198414134](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45198414134), [45197548397](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45197548397).
- `jems-cloud-run-release.yml`: [45316092264](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45316092264), [45311550910](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311550910), [45311336437](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336437).
- `jems-operations-contracts.yml`: [45312136132](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136132), [45311336589](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336589), [45311110610](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311110610).
- `jems-service-images.yml`: [45256616279](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45256616279), [45254911632](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45254911632), [45254906773](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45254906773).
- `jems-visual-review.yml`: [45312136136](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136136), [45308110399](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45308110399), [45308028489](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45308028489).
- `mind-your-jems-screenshots.yml`: [45308110371](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45308110371), [45308028320](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45308028320), [45243576558](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576558).
- `pages.yml`: [44932334132](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44932334132), [44923270613](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44923270613), [44906553925](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44906553925).
- `parent-reporting.yml`: [45312136263](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136263), [45311336389](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336389), [45311110594](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311110594).
- `release-regression-contracts.yml`: [45250456464](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45250456464), [45243576487](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576487), [45236729944](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45236729944).
- `sandbox-publish.yml`: [44844870974](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44844870974).
- `service-image-contracts.yml`: [45250456262](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45250456262), [45243576445](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45243576445), [45236730332](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45236730332).
- `studio-quality-review.yml`: [43823359188](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43823359188), [43822685530](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43822685530), [43821900112](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43821900112).
- `test.yml`: [45312136139](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136139), [45312028151](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312028151), [45311336552](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336552).
- `trusted-device-security.yml`: [45312136157](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312136157), [45312028085](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45312028085), [45311336488](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336488).

GitHub retains 11 additional workflow registry entries whose files are not present on audited main. These historical/deleted entries are not current required execution architecture: `coach-apply-reviewed`, `coach-integrity`, `dev-environments`, `dev-preview-artifact`, `edit-intelligence`, `jems-integration-snapshot`, `jems-release-contracts`, `pal-decode-diagnostic`, `studio-source-review`, `create_codespaces_prebuilds`, `pages-build-deployment`.

Additional direct API checks: failed PR141 run45236729834 failed Creative / Child journey and recovery; branch push45236640533 failed that same step and Browser / Build actions. Other job outcomes were success. These were actual failing gates before the later repair, not skipped tests or a confirmed harmless flake. Maximum observed initial job queue was3–4 seconds in six sampled runs and30 seconds in PR148's PR run. Per-job rounded minute totals were40,42,44,41,40,44,45 respectively for the seven baseline table rows; these remain estimates, not billed charges.

## November 20, 2026 — manual GHCR publication run 44837433067

[Run 44837433067](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44837433067) used the correct public-source pin and successfully validated the packaged Docker image's entrypoint/source/quality code hashes. Its pre-publication wire test **did not actually execute gameplay**: a CommonJS TypeScript fixture caused `import {hopper}` to fail, and the container subsequently rejected empty stdin. The publish step was skipped and **no replacement image was pushed**. Follow-up adds a real Node `tsx` fixture-import regression and validates the synthetic envelope before Docker execution; passing that offline test is not evidence of production gVisor acceptance.


## November 20, 2026 — failed production sandbox image smoke

[Private run 44830655674](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44830655674) ran the configured GHCR image on an actual isolated gVisor runner. Host/full readiness, image pull, and explicit network egress denial passed. `npm run test:sandbox` then failed on the first generated-game fixture with `PLAYTEST_FAILED:GENERATED_ARTIFACT_REJECTED`; later browser and hostile-source checks did not complete. The owner reported `CLEANUP_STATUS=VERIFIED` and `SMOKE_AUTH_STATUS=VERIFIED`, but **`FINAL_STATUS=FAILED`**. The image was published from older source `31f8c463…`, whose bare-game stdin contract is incompatible with current worker-approved `b472c224…` (`{game,...}` envelope). A new [manual source-pinned GHCR publisher](../assignment-006/SANDBOX-PUBLISH.md) adds pre-publication package/source hash and envelope smoke gates. No new image or real passing production acceptance is claimed by this code PR.

## November 20, 2026 — adult AI continuity regression boundaries

[Issue #93](https://github.com/jzwyrzyk/family-game-factory/issues/93) follows a real operator complaint that each Jems update appeared to require reactivating AI. The new `scripts/deployment/test_continuity.py` exercises strict current-state classification, fail-closed policy/worker/WIF drift, secret-version inspection and sanitized read-only commands. The deployment tests additionally ensure an already-existing inactive or active Jems Cloud Run release is never silently republished with `FACTORY_ACTIONS_APPROVED=false` by the first-time bootstrap. These are deterministic **offline fixtures**; they do not prove model entitlement, production gVisor cleanup, a durable adult permit or actual in-place cloud upgrade. See [continuity contract](../assignment-006/RELEASE-CONTINUITY.md).

## Current Art Studio review

The refreshed drawing PR has its own [source-scoped evidence](../drawings/EVIDENCE.md), [feature contract](../drawings/ART_STUDIO.md) and production-browser captures. Those tests cover reusable private art, movement versions, native game/scene integration and recovery. The older Live Remix results below retain their original scope and counts.

## Earlier Live Remix evidence

Screenshots are captured by `tests/live-remix.cjs` using default pseudonymous profiles and synthetic “Donut Splash” game names. They contain no real child identities or uploaded artwork.

- [Desktop Live Remix](live-remix-desktop.png), Chromium, 1280×900 viewport
- [Mobile Live Remix](live-remix-mobile.png), Chromium touch context, 375×812 viewport
- [Desktop mocked builder](builder-desktop.png) and [mobile mocked builder](builder-mobile.png)
- [Mobile isolated star-catching preview](builder-preview-mobile.png)

## Local validation

Baseline: original v0.3 browser journeys passed before extraction on charter commit `518a68b`.

After implementation, `npm ci` and `npm test` pass:

```text
TypeScript strict check: passed
Vite production build: passed (relative assets served under /arcade/)
Unit and backend-contract tests: 19 passed, 0 failed
PASS: creation, remix, all games, math, parents, persistence, profiles, failed saves, mobile
PASS desktop: five real mutations, outcomes/coach, compare, undo/DAG, fork/reload, profile/math isolation, rejected edits, quota safety
PASS mobile: five real mutations, outcomes/coach, compare, undo/DAG, fork/reload, profile/math isolation, rejected edits, quota safety
PASS builder desktop: real mocked novel mechanic, browser-gated artifact, sandbox isolation, failure preservation, retry, keep/undo, cancellation, reload and authorization
PASS builder mobile: real mocked novel mechanic, browser-gated artifact, sandbox isolation, failure preservation, retry, keep/undo, cancellation, reload and authorization
SKIP real-agent smoke: no verified, funded production integration. No credentials read and no external agent request made.
```

The browser tests also verify combined parent JSON export/restore, old progress-only backup compatibility, v1 remix migration, and real builder/dragon parameter effects. They use actual controls and completed bucket rounds, not injected outcome callbacks. Unit tests separately use a fake plugin only to exercise lifecycle behavior (duplicate completion and disposal).

CI reproduces the same commands on Node 22 / Ubuntu 24.04 and uploads `test-results/` as `browser-evidence`. This evidence is for the implemented local configuration system. It does not claim arbitrary AI generation, production cloud security, full original-game fidelity, physical mobile-device/Safari validation or deployment.

The mocked builder tests also exercise compare and save-as-new, then verify private family authorization and scan the production JavaScript assets for server secrets and mock-agent implementation. The mock is explicitly labeled in the parent UI, including when reopening saved versions.

CI diagnosis: the runner had unpinned Chromium 157 installed at the system path, while Playwright 1.56.1 downloaded Chromium 141. The mocked browser gate timed out on that system engine. CI now explicitly uses Playwright’s pinned engine; a complete local Node 22 + Chromium 141 run passed without changing assertions.

## November 20, 2026 — Pal reduced-motion notification test gate

After merging Gem Pal expression assets and the learning-surface fixes, the exact-main Arcade `creative` job reproduced an intermittent assertion in `tests/pals-expressions-browser.cjs`: Playwright changed `prefers-reduced-motion` but the test checked Web Animations **before** Chromium's asynchronous `matchMedia` change event had reached the Pal controller. The production portrait already listens for that event and cancels its transition.

[PR #92](https://github.com/jzwyrzyk/family-game-factory/pull/92) now waits up to three seconds for the controller's observed reduced-motion state and its completed visual reset before asserting zero remaining animations. This retains the behavioral assertion and changes no game, artwork, stylesheet, approval or runtime animation policy. Source-only tests, even when green, do not validate physical-device motion or authorize deployment.
