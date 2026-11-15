# Factory 2.0 audit and gaps (Issue #3)

Audit base: `518a68b` on `feature/factory-v2-foundation` (includes v0.3 and its passing CI fix). Baseline `npm test` passed before edits. No cloud resources were found or provisioned. The repository had one HTML file containing UI, storage, adaptive math, three game constructors and a parent-mediated idea/GitHub handoff; one Playwright regression script; no runtime/plugin contract, game revisions, live interpreter, design coach or backend.

## Implemented in this assignment

- Vite build with relative assets for project-path Pages hosting. Strict TypeScript runtime, mechanics manifests, local interpreter, revision store and coach. Existing store/math/bridge/orchestration and each game engine extracted into separate JavaScript modules behind typed adapters; their full internals have not been ported to TypeScript.
- Explicit start/next/retry/dispose/snapshot lifecycle; duplicate or disposed round events ignored. Generation tokens protect against delayed math feedback appearing in a later game. Each game receives only validated mechanics and its completion callback, not a math profile or credential.
- Actual editable mechanics: builder matching highlights/extra decoys, bucket count/safe clue/splash duration, dragon hearts/breath speed. Classic and original presets retain working v0.3 behavior. Game parameters cannot write math settings.
- End-to-end child-led Live Remix: supported natural language → explicit change preview → save validated private revision and play it → optional reflection/prediction → repeat → compare table/play previous → undo/restore → branch from previous revision → fork as a new named game → find and replay after reload. No adult, GitHub or manual transfer needed.
- Versioned local revision DAG, bounded immutable revisions, branch-preserving undo, fork provenance, play records, transactional local writes, pre-release workspace migration and parent backup integration. Rejected/unsupported changes do not alter the current game. Local profiles are a convenience boundary, not authentication on a shared device.
- A deterministic coach uses the actual completed round's outcome, duration, level and revision. It asks one optional question at a time; reflection and hypothesis can both be skipped. A saved prediction is displayed after the next test as one observation, not proof. It does not infer mastery, emotions or a child's preferences from telemetry.
- Pure, tested managed-service contracts and a disabled AI adapter, not a backend or a production security implementation.

## Explicitly pending original-game fidelity

**Bubble Gum Builders freeform construction remains pending.** The extracted game still matches fixed blueprint slots. There is no free placement, gum-joint connection graph, structural physics/scoring or randomized solvable freeform object-set generator. Extra decoys and glow are genuine parameter edits, not a freeform construction implementation.

**Dragon original fidelity remains pending.** The existing playable meatball/team combat, hero selection and progression remain. Shield-reflected attacks and the full intended dragon design are not implemented. Hearts and breath speed are real edits of this existing game.

**Three-bucket Splash or Pass original fidelity remains pending.** Classic still uses three buckets, and the original safe/random selection, slime/sauce, retry and progression behavior is preserved. The intended original game has not been independently reconstructed/validated against its source design. Changing bucket count is an explicit remix, not a claim that the original game's complete intended mechanics have been delivered.

## Remaining phases and release limits

- Arbitrary unfamiliar ideas cannot generate new playable mechanics yet. Only the documented local grammar changes manifest parameters. Unsupported/mixed requests fail honestly with an optional saved idea. No LLM is called; no mock AI response is shown as a real generation. A genuinely novel plugin build/test/repair loop is phase 5, not completed acceptance in this foundation slice.
- No Cloud Run service, Firestore/Storage implementation, authenticated family session, provider key, production quota enforcement, queue or isolated worker. Their interfaces and expected controls are in `server/`. Contract authorization tests do not prove IAM, Storage rules or network isolation in a real cloud account.
- No generated JavaScript is accepted or executed. A separately isolated build environment and separate-origin sandbox preview are mandatory before introducing generation. Actual hostile generated-module isolation and publish/rollback tests await that implementation.
- The local experiment preview is ephemeral until Try; Try writes a private device-local version. There is no released/public revision state or automatic release promotion. Tested release publishing and rollback are later service work. Manual Pages hosting is separate from child experiments.
- New workspace schema is v2. A documented pre-release v1 fixture migration is supported; the existing `family-game-factory-state-v1` math/profile key remains unchanged. Capacity is bounded at 50 projects, 500 revisions, 1000 round records; exceeding bounds rejects the write, rather than pruning history. Export a parent backup; deletion/retention UI is future work. Local data is not synchronized across devices.
- Original math engine retains fact-level evidence, hints, adaptive weak-fact weighting and parent focus. Its evidence is experimental, not certified mastery. A full spaced-review scheduler remains pending.
- Drawing upload/provenance, permissioned cutout/rigging, asset generation and offline HTML export remain pending. No child asset data is sent to GitHub.
- Pages needs the Vite `dist/` artifact, not raw TypeScript source. A main-only manually dispatched Pages workflow is included; the owner must choose GitHub Actions as the Pages source after review. It has not been dispatched. Existing live main/Pages content is unchanged by this PR. Installable/offline PWA caching remains pending.
- Automated browser evidence covers Chromium desktop and a 375px touch viewport; it is not a claim of real iOS/Safari testing. Full cross-browser/device and accessibility audits remain future validation.
