# Pre-K and kindergarten verification

Use Node 22, the repository lockfile and its Chromium installation. Run `npm ci`, `npx playwright install chromium`, then `npm run test:early-preview`. An installed system Chromium can be selected with `CHROMIUM_PATH`. The command builds a separate synthetic distribution under `test-results/early-build`. The hosted job uses a read-only repository token and uploads the viewport PNGs. Ordinary builds use their own offline manifest and cache.

## Scope

| Surface | Observable evidence |
| --- | --- |
| Parent level selector | Six explicit persisted grades, a denied parent request, a delayed save across a profile switch, and an unchanged sibling |
| Play and learning | Tap before instruction delivery, declared adult reading, host scoring, disabled game input and an actual resumed game action |
| Native game matrix | Gem Factory, Mind Your Jems (Gem Mining), Dragon Island Rescue, Splash or Pass, Junkyard Rally, Moon Donut Dash, Robot Route Lab and both the current Bubble Gum Builders assembly workshop and its retained construction game |
| Isolated game | Reviewed star-catching fixture, opaque sandbox, host-owned learning, acknowledged round completion and replay |
| Creation Studio | Add a direction command, inspect the saved project, predict its first movement and check a working program |
| AI creation | Illustrated handoff, local scene creation and restricted creation mutations on the early profile |
| Device speech | A simulated local voice completes and replays the instruction. The decoding stimulus remains silent. A separate no-voice journey requires declared grown-up reading before scoring |
| Viewports | 768 × 1024, 1024 × 768, 1366 × 768, 390 × 844 and 844 × 390 CSS pixels |

Splash or Pass reaches a natural round-end checkpoint. The other native matrix cases send the existing checkpoint event after entering play or performing a game action. The legacy regression suites also exercise elapsed-play and round-end triggers. Generated game checks use a local reviewed fixture. The gateway responses, speech lifecycle and learner profiles are synthetic. No person supplied a voice recording. The device matrix establishes browser rendering and pointer behavior. Educational efficacy, physical-device ergonomics and acoustic quality require their own evidence.

## Verification receipts

The seven PNGs below come from a clean build of `757a2c197fcceb4aa746970ddb7615c65edadf5a`. The preview manifest reported that SHA and `dirty: false`. The synthetic journey completed all 25 browser checks with Google Chrome for Testing 141.0.7390.37 on Linux. These include the displayed group for zero, the first spoken action in the assembly game and an actual input after each checkpoint.

| Additional local checks | Result |
| --- | --- |
| Existing application unit suite | 597 passed |
| CI orchestration contract suite | 118 passed |
| Selected creation, challenge, budget, reward, backup, parent-report, authorization and grade tests | 132 passed, with overlap with the application suite |
| Deployment and operations fixture suites | 83 and 239 passed |
| First-learner coding layout | Eight viewports passed, including the 320 CSS pixel phone, plus a 150% Chromium zoom check |


The curriculum contains 17 Pre-K math skills and 23 kindergarten math skills. The deterministic engine suite samples 60 seeds for each of those 40 skills and checks every possible subset for the new four-, six- and eight-picture sorting boards. The reviewed language catalog has 11 Pre-K skills with 206 tier entries and 16 kindergarten skills with 294 tier entries. Entries reused across difficulty tiers count once per tier. The 48 legacy Language Arts skill units retain their version-1 content.

The small-phone acceptance suite also runs at 320 × 667 with a challenge open. It tests a real pointer hit on every first-step action and checks 150% Chromium zoom. The isolated version-1 input regression uses a loopback-routed HTML host and independently sandboxed game response. This gives Playwright's clock a real navigation boundary and preserves the existing score, frame and held-input assertions.

A local merge-tree rehearsal against family beta and storage rehearsal #181 at `8e6be75` produced conflicts in the local profile store, Studio UI and styles, package scripts, the architecture and delivery records, the documentation registry and the parent-consent document. Integration must preserve both sets of profile, recovery and consent changes. #181 is a rehearsal branch. Its beta audit dependency #180 and the separately verified family host precede any external early-learner beta.

## Captured journeys

| Screenshot | Viewport |
| --- | --- |
| [Pre-K mathematics](tablet-portrait-math.png) | Tablet portrait |
| [Kindergarten literacy](tablet-landscape-language.png) | Tablet landscape |
| [Graphical commands in a scene](desktop-coding.png) | Desktop |
| [Grown-up creation handoff](phone-handoff.png) | Narrow phone |
| [Coding workspace](short-landscape-coding.png) | Short landscape |
| [Game before the checkpoint](game-before.png) and [game after the answer](game-after.png) | Tablet portrait |

## Release conditions

1. The layout repair #175 has merged at 912fd31. Obtain product-owner review and required branch checks for #176, #177, #178, #179 and #183 in order. Recheck the diff and regression evidence on each new base.
2. Review the local illustrated assets and the early curriculum with the product owner and a qualified early-learning reviewer. Confirm the spoken directions, listening items and independent reading evidence on target device voices.
3. Reconcile the separate beta audit #180 and rehearsal #181, then integrate the family beta #170–174 entitlement shell and verified family learner identity. Keep parent-guided paid creation disabled until a server-bound child workflow enforces consent, provider approval and budgets. Preserve the independent Adult Private budget and data boundary.
4. Use authorized adults and synthetic profiles on representative physical hardware in approved DEV/TEST. Real child participation and production release require separate permission and release evidence.

The unchanged study and release requirements also apply to visual assessments, privacy retention, profile migration and recovery. No release authorization is implied by this branch.
