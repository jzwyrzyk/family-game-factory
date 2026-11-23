# Legacy and Astra High game comparison

**Actual-model comparison pending.** Seven authored prompts are available in matched legacy and premium lanes. The offline runs below exercised the real adapter with a synthetic transport and the sandbox worker with one authored game. Human scores, changes in game quality, real generation latency, paid token usage and actual spend remain unmeasured.

## Run locally

Use the repository's Node version and installed dependencies from the repository root. These commands have no paid transport. The manifest includes the literal synthetic prompts, case-specific checks, 25 rubric anchors and request/criteria hashes.

```sh
mkdir -p test-results
npm run --silent benchmark:premium > test-results/premium-manifest.json
npm run --silent benchmark:premium -- --mock
npm run test:premium-benchmark
npm run --silent benchmark:premium -- --fixture test-results/premium-benchmark
```

The fixture accepts the repository's Playwright Chromium or `CHROMIUM_PATH`. Only the built-in authored module can be executed locally. Test actual generated code through the existing credential-free isolated worker. The importer and review sheet never execute supplied game code.

| Concept | What ordinary play must show |
|---|---|
| Fox and leaves | A cute cartoon Pokémon-like fox running sideways in a happy, silly forest. Show separate successful jumps and ducks against low and high leaves, a cost for mistiming, increasing challenge, play continuing at 99, the 100th avoidance, and the fox's animated celebration and replay. |
| Lantern climber | A paper cat moves in both directions, lands jumps, rings the level bell, lands on moving lanterns and recovers after a fall in level two. |
| Echo garden | Enter the displayed flower sequence, deliberately make a mistake, see the same sequence repeat, then solve it and get a longer sequence. |
| Balancing bridge | Construct a span, see it tip under a cart's weight, change a support and carry the same cart across. |
| Star map | Drive a robot into a blocked direction, backtrack, choose another route and reach a star. |
| Coral studio | Choose colors, stamp shells, move a shell without moving its neighbor, and keep developing a second composition in free play. |
| Moon parade | The gong cannot launch the parade before three wings are attached. Afterwards the dragon awakens, unfurls its wings and flies as stars visibly dance. |

The comparison uses the [canonical synthetic inputs and criteria](../../../tools/premium-benchmark-cases.ts). Both lanes receive exactly the case request. The independently authored checks and human rubric stay outside the prompt. Changing any check or scoring anchor changes the criteria hash.

## Available offline evidence

The mock run sent all seven literal prompts separately through legacy and premium planning and construction, for 14 adapter invocations. It supplied a constant authored output and verified the plan version, request digest, selected model and reasoning setting. The benchmark deliberately leaves code quality and resource metrics empty for this transport.

The star-map run exercised the worker with an independent, replayed six-checkpoint probe on desktop and touch. It verified the robot's initial wall, horizontal move, blocked downward move, return, route across the wall and arrival at the star. Both normal-motion capture sessions recorded six ordinary inputs and visible outcomes. Initial, interaction and outcome PNGs and the full action trace are checked in. This particular run took **24.041 seconds** of local worker wall time with system Chromium 156.0.8078.79. Fresh runs may differ in frame timing or PNG bytes. The recorded worker ran as a local child process. Production isolation, live provider performance and human ratings require different evidence. [Worker receipt](authored-star-map/receipts.json) · [Desktop interaction](authored-star-map/desktop-interaction-1.png) · [Tablet outcome](authored-star-map/tablet-outcome-2.png)

## Run a future authorized comparison

1. Preregister all seven prompts, replicate numbers and shared conditions before seeing any outputs. Use the same Adult Private synthetic test conditions, fresh base, allowance ceiling, separately approved image setting, available asset set, sandbox/runtime build, browser profiles and completion window. Record the conditions and both lane configuration fingerprints in one private file and hash its exact bytes into `sharedSetupHash`. Pin a source revision for each lane. The pipeline's policy, stage budgets and evidence coverage may differ by design. Record those differences. Use multiple matched replicates where the approved allowance permits and alternate lane order.
2. Submit the synthetic requests via the existing authorized build route under its configured legacy or premium policy. Record every admission result, failure and repair, including jobs without playable output. A budget denial still occupies its preregistered slot. An uncertain paid request stays interrupted. Do not rerun it for a cleaner sample.
3. Use the private coordinator/worker, existing measured-usage receipts, immutable artifact and its sandbox evidence and review. Prepare the file described below within approved private access and existing retention. Build the review sheet while the evidence is available. Do not copy live captures, prompts, source, family identifiers or provider receipts into this repository. The importer cannot recreate evidence already cleared from a completed job.
4. Give an adult reviewer only the private A/B sheet. Calibrate both lanes against the same anchors and native reference experiences. Review the exact intent, ordinary input trace, desktop and tablet captures, progression, recovery and payoff. Changed pixels or a terminal flag alone cannot show the fox ducked or the dragon unfolded its wings. Mark a criterion unobserved when the allowed capture window missed it. Keep both lanes' pipeline verdicts and their independent human judgments.
5. Record the human observations and scores keyed to the sheet's evidence hashes. Then summarize **all** preregistered jobs. A missing pair is visible in the report. Publish only permitted aggregate counts, scoped observations and verified cost results.

```sh
npm run --silent benchmark:premium -- --sheet private/legacy.json private/premium.json > private/blind-review.html
npm run --silent benchmark:premium -- --summarize private/jobs/*.json > private/comparison.json
```

The HTML contains actual PNGs and safe ordinary input fields, has no script or remote dependency and sorts by opaque job digest for stable A/B order. A missing final artifact yields a blank rating opportunity. Keep the mapping and pipeline verdicts away from reviewers until scoring is complete. Additional reviewers can complete separate copies and adjudicate divergent observations before reporting. Adult judgments about fun potential do not establish children's enjoyment, engagement or educational efficacy.

## Private import contract

Each file holds one trusted operator export. See the [TypeScript contract, validation and aggregation](../../../tools/premium-quality-benchmark.ts). The tool validates content-addressed bindings and expected model receipts. Authenticity of provider invoices, operator attribution, complete sampling and the shared setup are the responsibility of the authorized operator. These JSON files are not signed attestations.

| Field | Source and units |
|---|---|
| `version`, `caseId`, `requestHash`, `criteriaHash` | Copy the exact synthetic case identity from the manifest. |
| `origin`, `lane`, `replicate` | Use `operator-provider-export` only for a real authorized run, or `offline-test` for synthetic records. Lane is `legacy` or `premium`. Replicates start at 1. |
| `jobHash`, `sharedSetupHash`, `sourceSha` | SHA-256 of an opaque trial job identity, SHA-256 of the preregistered common conditions and exact 40-hex source revision of the generator. Each cohort uses one source per lane. |
| `policyVersion`, `durationMs` | Confirmed `legacy` or `adult-astra-high-v1`. Measure elapsed time from admission attempt until the terminal result, including queueing and repairs. |
| `attempts[]` | Initial attempt followed by up to two actual repairs. Give each its own nonoverlapping worker `durationMs`, `outcome`, `calls`, `usageComplete`, `imageCostMicroUsd` and `packet`. Outcomes are `accepted`, `technical-failure`, `quality-failure`, `provider-failure`, `budget-denied` or `interrupted`. Use the recorded job decision and rejection stage. An intermediate repair follows only a technical or quality rejection. |
| `calls[]` | Copy measured text-stage receipts in execution order. Each includes `stage` (planning, construction, review or repair), `model`, `reasoningEffort`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens` and `costMicroUsd`. Premium coding and repair must identify Astra High. Premium rows must use catalog models, zero cached tokens and the exact stage charge calculated from measured input and output usage at the pinned catalog rates. For older legacy jobs without complete stage receipts, retain available reconciled calls and set `usageComplete: false`. |
| `usageComplete`, `imageCostMicroUsd` | `true` only when text receipts account for every call, including failed responses. Image cost is actual reconciled image spend in micro-USD, zero when no image charge was incurred, or null when unknown. A reservation, uncertain settlement and approved per-image ceiling cannot establish spend. |
| `packet` | For an accepted game include `{game, evidence, review, human}` from that attempt's exact compiled artifact, PNG-bearing sandbox evidence and bound independent quality review. A rejected game may have a packet too. Use null when no capture/review exists. Its absence cannot support acceptance. Initially set `human: null`. |
| `packet.human` | Bind to `review.evidenceHash`. Supply `scores` keyed by `clarity, polish, fidelity, feedback, funPotential` with integers 1–5. Supply `checks` keyed by every manifest check ID, each with `status` (observed, missing, unobserved), `captureIds[]` and `traces[]` containing device and action index. An observed/missing result needs at least one non-wait ordinary action with before/after captures on the same device. Leave scores pending when there is insufficient evidence. |

The summary counts jobs, attempts, terminal rejections, failure categories, total repairs and repaired acceptances. Cost per attempt divides **all** reconciled spend by **all** attempts. Cost per accepted game divides the same spend by **accepted jobs**, so failed attempts and rejected jobs remain in the numerator. Unknown amounts and zero denominators produce null. Input and output totals include their cached-input and reasoning components respectively. Per-job and attempt durations are retained alongside lane mean job duration. Per-case final human scores and premium-minus-legacy differences appear side by side only for matched, rated pairs. Read those alongside rejected and missing jobs to avoid survivor bias.

## Anchored human review (1–5)

| Axis | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Gameplay clarity | First action or objective unreadable. | Player must guess and retry is unclear. | Common actions, goal and feedback understandable through play. | First action and recovery immediately legible on both devices. | Consistent cues teach later actions and consequences on both devices. |
| Visual polish | Subjects or controls obscured. | Scale, contrast or placeholders interfere. | Coherent style and readable subjects and controls. | Deliberate hierarchy and layering through multiple phases. | Composition and motion sustain requested mood and readability through payoff on both devices. |
| Concept fidelity | Central action or purpose absent. | Theme present, multiple essentials missing or unobserved. | Core action visible, some requested variation, recovery, style or payoff unobserved. | Every case check observed, including action and payoff. | All checks form a distinctive, cohesive realization across desktop and touch. |
| Animation and feedback | No discernible consequence. | Change is visible but cause or timing unclear. | Most actions have prompt, distinct responses. | Anticipation, impact and recovery legible across inputs. | Distinct expressive poses and timing maintain clear cause throughout the payoff. |
| Fun potential | No visible reason to choose again. | Repetition with few meaningful differences. | One visible challenge, choice or expressive variation supports retry. | Different choices invite experimentation with clear tradeoffs. | Several meaningfully different approaches and satisfying responses persist over progression or free play. |

The runnable sheet contains the full fixed anchors. Preserve low and mixed scores. A high visual score does not override a missing mechanic, and a high fun-potential rating cannot turn a rejected job into Ready.
