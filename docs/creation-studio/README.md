# Creation Studio: make scenes and rebuild behavior

**Status:** merged in [PR62](https://github.com/jzwyrzyk/family-game-factory/pull/62) as [`c4ce21be410e7fccb16922c4711f4c4172edbc7e`](https://github.com/jzwyrzyk/family-game-factory/commit/c4ce21be410e7fccb16922c4711f4c4172edbc7e), November 19, 2026. This document describes source behavior and its acceptance contract; the merge does not establish deployment, real-device acceptance, or educational efficacy.

**Decision:** [ADR0007 — One creation experience with free scenes and rebuild practice](../decisions/0007-creation-and-rebuild-practice.md). The owner expanded the earlier discussion into an explicit development request during the November 18–19, 2026 session: keep one Jems experience, reuse the child's game characters and ideas, offer editable scenes/actions, and provide a separate practice entrance where children rebuild demonstrated behavior.

**Art Studio support:** merged [PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23) adds private original drawings and exact saved cutout versions to local scenes. The section below describes that source behavior; the [acceptance record](ACCEPTANCE.md) and [delivery state](../../DELIVERY-STATE.md) retain its development checks and subsequent merge receipt separately from the earlier PR62 merge. First-creation guidance is now combined with this merged source; delivery evidence distinguishes that integration's local and hosted checks from the earlier receipts.

## Product purpose and boundaries

The child can create a moving scene, give characters dialogue, and make an interaction respond to taps or messages. **Make your own** and **Rebuild a scene** use the same project language, editor, renderer, and interpreter. Practice therefore teaches actions that remain useful when the child returns to their own creation.

The scene is an owned, recoverable project. A checked challenge is an observation about a particular scene under specified inputs. It is not a general computational-thinking score, critical-thinking score, grade placement, or independent assessment. The [child-owned coaching standard](../design-coach/GOLD_STANDARD.md) still governs meaningful choice, optional reflection, and the difference between an AI suggestion and the child's original idea.

Checks run when the child chooses **Check my scene**. Stored attempts contain the project/revision/challenge identity, pass result, hint use and timestamp; detailed subchecks and runtime traces provide immediate feedback but are not stored as a learner model. Editing, playing and ordinary conversation do not automatically create challenge-assessment records. The five challenges are selected by the child; there is no adaptive computational-thinking scheduler or combined Math/English/Creation problem-solving estimate. The parent and My Powers panels show recent specific checks, not a general ability score.

The separate [formative problem-solving feature](../problem-solving/README.md) observes newly saved checks through trusted-host adapters and can retain short check context in its own owner-scoped ledger. This does not change the original Creation attempt schema or promote scene success, absent hints or block provenance into an APS competence result. The new feature's authored reasoning practice supplies its own structured opportunities; the five Creation challenges remain child-selected, finite behavior checks.

The first source adapters cover the existing Dragon, Buckets, and Robot games. They create a **new editable scene pinned to the selected source game revision**. Dragon artwork comes from the bundled original images; bucket and robot actors use reviewed local vector representations of those games' characters. Selected known source settings inform initial scene behavior. This adapter does not import combat, physics, every game rule, arbitrary generated JavaScript, or a complete original game engine. Returning to the source game preserves it; editing the scene does not silently rewrite it. Other native games, including Gem Factory, retain their own play experience and do not acquire an adapter merely by appearing in the game shelf. An unsupported Animate & code action reports its limitation in the visible Studio; the separate free-creation entrance remains available.

## Source map

| File | Responsibility |
| --- | --- |
| [model.ts](../../src/creation/model.ts) | Versioned scene schema, block types, references, provenance, and strict structural validation |
| [engine.ts](../../src/creation/engine.ts) | Deterministic data interpreter, actor state, inputs, timing, execution budgets, and trace |
| [projects.ts](../../src/creation/projects.ts) | Trusted asset catalogue, strict opaque private-art reference format, starter scenes, source-revision adapters, and bundled-only generated-manifest import boundary |
| [stage.ts](../../src/creation/stage.ts) | Canvas rendering and pointer hit testing for bundled artwork and owner-checked private pixels; explicit unavailable-art placeholders |
| [private-art.ts](../../src/creation/private-art.ts) | Owner/hash-checked image and saved-cutout resolution, bounded view cache, and portable scene-with-art export/import |
| [ui.ts](../../src/creation/ui.ts) | Free creation and challenge entrances, actor/script/block editing, playback, local history, learning-host integration, and supported video capture |
| [storage.ts](../../src/creation/storage.ts) | Owner-scoped projects, immutable revisions, kept pointer, draft recovery, copies, and local practice attempts |
| [progress.ts](../../src/creation/progress.ts) | Current-profile recent checks in My Powers and Parent Controls, with support history and checked-version identity |
| [challenges.ts](../../src/creation/challenges.ts) | Public practice targets, separate starter scenes, declared test inputs, and behavioral checks |

These are trusted application modules. They do not give generated code authority over parent-selected learning, profile ownership, remote credentials, the worker, or private previews. The [current architecture](../../ARCHITECTURE-CURRENT.md) retains those existing boundaries.

## The editable project

`jems.creation.v1` stores a title, stage dimensions/background, characters, programs, numeric variables, and optional source provenance. A character has a stable ID, name, asset reference, initial position, size, and visibility. Each program belongs to a character and begins on **Play**, a **tap on that character**, or a **named signal**.

Blocks contain data rather than executable source:

| Family | Supported behavior |
| --- | --- |
| Movement | Move to an x/y destination or by a relative distance; jump with a visible arc; dance with a rotation animation |
| Story | Say text in a speech bubble, wait, show, or hide |
| Control | Repeat a bounded group; choose an if/otherwise branch |
| State | Set or change a declared numeric variable |
| Events | Send a named signal to matching handlers |
| Conditions | Compare a variable, compare the current character's x/y position, or test contact with another visible character |

There is one matching handler per character/trigger combination. Actors may reuse the same asset ID without sharing position or program state. Block IDs are unique throughout a project, so an execution trace can identify the block the editor highlights.

Validation rejects unknown fields, missing actor or variable references, duplicate IDs, ambiguous absolute/relative moves, nonfinite values, unsupported triggers/actions, excessive nesting, and oversized programs. Local scenes accept the bundled catalogue or the strict opaque private-art references described below. A separate trusted resolver checks actual ownership, source bytes and version hashes before showing private pixels. The generated-manifest entry point remains bundled-only. Saved scenes cannot introduce source code, a remote asset URL, a signed capability, or an arbitrary HTML payload.

Provenance can retain `sourceKind`, `sourceProjectId`, `sourceRevisionId`, `sourceSessionId`, and `sourceGameId`, with the project's creation origin. Blocks can record `child`, `starter`, or `assisted` origin. This is transparent local history, not independently authenticated authorship. Importing a file or adopting a helper's content must not turn it into evidence of unaided child performance.

## Your art in moving scenes

**Art Studio → Make a scene** creates a new editable scene with the selected original drawing or saved cutout design. The visible starter hop and tap-to-hop blocks are marked as starter actions. The child can change them, add dialogue, create rules, keep an edition, and record the resulting canvas video through the existing controls. **Characters & things → Add → My art** adds artwork to an existing scene; the same saved art version can appear in multiple scenes. **Art Studio** links appear in the picker, the scene's source row, and the scene shelf.

Adding private artwork to a game-derived scene preserves both source relationships. The source row shows the exact-art-version label and **Art Studio** action alongside **Back to my game**. Scene changes remain in the scene, and the return action opens its original game without rewriting that game's saved source.

The asset reference is `art:image:<drawingId>:<sourceSha256>` for an original or `art:rig:<rigId>:<assemblySha256>` for a saved cutout. This exact namespace supports source IDs up to 100 characters, matching identity-preserving art restoration; ordinary project, actor, block and variable IDs retain their existing 160-character limit. The latter reference hashes the validated assembly, including its original drawing identity and fingerprint. Saving another drawing design does not update existing scene references. Scene editions, copies and drafts retain their chosen reference. Archiving artwork preserves these uses; hard deletion checks retained sources rather than trusting a potentially stale usage index.

The browser resolves references only against the active profile. It checks the immutable version and recomputes the original byte fingerprint before decoding. Decoding is bounded to the supported image dimensions and a 512-pixel display surface; the original bytes remain untouched. The cache is limited to 32 images and cleared on view/profile changes. Late image results cannot create a scene or fill another profile's thumbnail. No private-art URL, image bytes, family identifier, provider request or upload is added to generated-game manifests.

A saved rig supplies its **composited cutout artwork as one scene actor**. Overlapping masks use the maximum alpha capped by the original alpha, with RGB taken from the original pixels, so duplicate translucent layers do not darken the artwork. Scene blocks move, rotate, show, hide or speak for that actor. Independently simulated wheel rotation, hinge motion and suspension continue in Drawing Lab and the supported physical game adapter. Moving the scene actor does not claim to reproduce the rig's independent physics or import the complete source game.

Missing, changed or foreign art is visibly unavailable. Jems does not replace it with a stock gem and call that a successful import. Play and video preparation wait for the selected private artwork; the editable scene remains available for recovery. Existing learning checkpoints, challenge rules, assistance history and reward policy remain in the trusted host. Uploading art, saving a design or adding a character does not by itself mint gems or establish learning proficiency.

### Portable scenes with their artwork

**Download editable scene** exports ordinary bundled-art scenes as the existing JSON format. A scene that uses private artwork instead exports `jems.scene-art.v1`: its editable scene plus a private art bundle containing the required originals and exact saved rig lineage. The download includes the image bytes the user explicitly chose to export; it is a private file, not a publication.

**Open a scene file** validates the whole scene and art bundle, including each reference hash, before importing art. The art store adds all imported originals and rig versions in one transaction, assigning new IDs in the selected profile. The scene importer remaps its references and recomputes rig hashes for those new source identities, then saves a separate scene with assisted import provenance. Other profiles and existing scenes are unchanged. If the subsequent scene save fails, the imported artwork remains available in Art Studio and the message explains that the scene was not saved. Invalid, incomplete or mismatched bundles make no art writes.

Scene files with art use the shared 64 MiB transfer limit; ordinary scene-only JSON retains its 500 KB input limit. Family progress backups retain scene references separately from private image storage. Use the explicit art backup/restore or a scene-with-art download to move private pixels; a progress JSON alone does not promise a complete art transfer.

## Interpreter contract

The interpreter does not use `eval`, random values, browser timers, network requests, or arbitrary game source. It advances on a fixed **10 ms logical tick**; elapsed real time is accumulated so splitting an advance into different browser frame sizes does not change the simulation. A duration that is not a tick multiple completes on the next tick. An omitted move duration is 500 ms.

- `start()` resets the scene to its saved initial state, dispatches start handlers, and processes immediate actions at time zero.
- `advance(ms)` advances playback while unpaused. Explicit advances continue the clock after all scripts finish; this lets a practice probe schedule a later tap.
- `pause()` stops playback time. Taps during a pause are not queued for replay when the scene resumes.
- `step(ms)` deliberately advances a paused scene while retaining its paused state.
- `tap(actorId)` dispatches that visible character's handler. A completed scene can respond to another tap.
- `reset()` clears transient effects, variables, trace, and execution counters back to the saved beginning.

Actors execute concurrently. A new trigger for a character replaces that character's current program, clearing its temporary speech/jump/dance effect; it does not create competing motion writers. Named signals are broadcast to matching programs in authored order. Events are handled before the sender proceeds to its next instruction.

Snapshots provide character positions, visibility, speech, rotation in degrees, jump offset, variables, active block IDs, logical time, status, counters, and a bounded trace. **A jump offset is negative upward; the rendered position is `y + jumpOffset`.** The trace includes action starts/completions, inputs, events, interruption, and limit stops. It is an engineering/observation trace, not a learning score.

The current limits are 16 characters, 48 programs, 300 blocks, nesting depth 6, 24 variables, and a repeat count up to 50. Each timed action is at most 10 seconds; a run is bounded by 120 seconds, 4,000 executed instructions, and 256 dispatched events. Repeating messages and deeply repeated zero-duration instructions therefore stop with an explicit reason. A limit stop is a runtime outcome, not evidence of a child's poor reasoning.

## Free creation and practice

Free creation offers Dragon, Buckets, Robot, and blank starters, actor placement, backgrounds, scripts, nested block groups, variables, preview, pause, step, and reset. Blocks can be inserted with a tap and reordered with buttons; drag reordering is an additional input method. Children can keep versions or continue an experiment without promoting it.

The home entrance follows the Ready to Play game shelf so a complete playable choice remains in the first mobile viewport. The global **Create & code** navigation remains directly available.

**My scenes** appears below both **Make your own** and **Rebuild a scene**, so stories and saved challenge attempts remain reachable without remembering the mode that created them. A challenge card opens the current player's most recently active scene for that challenge; saved edits, recoverable drafts and recorded checks determine recency. **Start a new scene** is a separate action that preserves earlier attempts. Returning to a challenge or changing tabs does not create a duplicate or grant a reward. The trusted host can call `FG.creation.openChallenges()` to enter the challenge shelf through the same learning and navigation guards as the main entrance.

**Open a scene file** is available directly on the shelf as well as in the editor's **More scene tools** menu. It validates the scene and available bundled or private artwork, then creates one new owner-scoped project with assisted import provenance; no throwaway project is required. Private scene-with-art packages follow the portable flow above. Importing from an editor saves a pending ordinary revision without choosing Keep. Unresolved recovery still requires **Resume my draft** or **Use saved version** first, and a late file read cannot open after the player or visible Creation view changes.

The target preview is a separate project. Watching it does not insert its program into the child's editable scene. Practice deliberately exposes the goal and optional hint; these are public learning activities, not protected assessment items.

### Owned Pal playgrounds and free-scene insertion

The [My Pals extension](../pals/README.md) in this change adds owned-companion starter cards and **Add your Pal** to free creation; its integration status is separate from the original Creation Studio release above. A Pal starter is a real editable scene: its start greeting and tap-triggered jump, dance and joke run in the existing interpreter. The tap script is selected for editing; Play and Keep remain explicit. [The Pal scene adapter](../../src/pals/creation.ts) supplies `starter` provenance rather than independent coding credit, and uses the existing approved blue, mint and coral gem artwork while final character art is developed separately.

Adding a Pal gives it an independent actor/script identity and preserves the scene's existing actors, programs, pinned source-game references and private-art image/rig/hash bindings. A mixed scene retains Art Studio and Back to my game. Passive Pal progress refreshes do not dismiss an active actor/art choice. Draft recovery, source-writing guards, local capacity limits and owner checks remain in force. The UI offers only the current profile's owned Pals, rechecking ownership when used. Pal tools are absent from rebuild challenges, and the insertion handler rejects a challenge; children can add a Pal to the free **Make it my own** copy after completing the exercise.

The public scene asset IDs are `pal-glim`, `pal-kip` and `pal-riff`; these remain the original token assets. Later selected creature artwork needs explicit form/version bindings rather than silently replacing art in a saved scene. A validated imported scene can retain these assets without owning the associated collectible. Scene JSON and creative backups never grant collection ownership, adventures or gems. Starting or editing a Pal scene makes no provider request, starts no automatic build and awards no progress merely for inserting or playing the supplied blocks. This is local playable-scene use, not automatic insertion into every native/generated game's mechanics. [Pal creation tests](../../tests/pals-creation.test.ts) cover behavior, preservation and this creative-content boundary.

### Exact current behavioral probes

The evaluator creates fresh bounded engine runs and samples snapshots every **50 ms**. Position checks generally allow **14 stage units**. Required original actors/assets and starting positions must remain present, and other scene landmarks must stay visible in place during the observation. The route, bounce, and cheer programs must finish within their windows; a correct prefix followed by unfinished instructions is insufficient. A final pose alone does not establish the demonstrated route or event response.

| Challenge | Inputs and observation window | What the evaluator checks |
| --- | --- | --- |
| Robot's gem route | No taps; 6,000 ms | Travel from `(150,320)` to `(150,120)`, then `(600,120)`, then `(600,320)` in order. Each segment must have visible intermediate motion and the robot must finish at the bucket. |
| Three dragon bounces | No taps; 5,000 ms | Three visible upward excursions in place, each rising at least 32 units; ground returns and a short rest between excursions; finish on the ground. Both repeated groups and separately written equivalent motion can satisfy the behavior. |
| One tap, one step | Three runs of 4,600 ms: no taps; taps at 800/2,400 ms; taps at 1,400/3,200 ms | Stay still before taps, move 120 units right per tap with visible motion, finish each response within 750 ms, and avoid extra automatic movement. |
| Fix the early cheer | No taps; 5,000 ms | Visible travel to the bucket, followed by “Hooray!” at the destination across at least four samples. Feedback asks for 200 ms of visible speech. An early cheer or only the correct final position does not pass. |
| Ready for three gems | Eight 2,200 ms runs: a no-tap run and a tapped run for each injected `gems` value 0, 2, 3, 5; taps at 700 ms for 0/3 and 1,200 ms for 2/5 | No answer without a tap. Say “More” for 0/2 and “Ready” for 3/5 across at least four samples within 750 ms of the tap; feedback asks for 200 ms of visible speech. Preserve the injected gem count in all runs. |

These probes compare behavior, not a secret exact block sequence, program text, or number of loops. Their finite cases and tolerances are explicit: passing does not prove equivalence for every conceivable input. They support feedback on the stated exercise. They do not establish normed proficiency, transfer to new contexts, or causation of a learning gain.

The result reports `kind: formative`, `source: bounded-scene-runs`, `independentAssessment: false`, and `generalThinkingScore: null`. General assistance is not inferred. The local attempt record stores the checked revision, challenge, outcome, and whether this interface's hint was used; a false hint flag does not establish that no adult, AI, or external help occurred.

## Learning, ownership, and recovery

The [first-creation guidance](../child-journey/FIRST-CREATION.md) adds optional inline scene and practice tips through callbacks supplied by Studio. Dismissals are saved in the current player's existing Studio notebook; they do not mark the challenge's assessed hint as used or create learning evidence. Unresolved recovery takes priority over tips, and tip controls cannot move focus out of an active required learning activity. The persistent source label explains that changes stay in the scene, alongside the existing **Back to my game** action. A scene copied from saved scene work is described as such instead of being mislabeled as a game conversion.

After a successful challenge check, the already-authored extension is displayed beside **Make it my own**. That action retains its existing copy-to-free-scene behavior and provenance; the guidance does not write changes back into the source game or introduce a new challenge/evaluator.

The existing Math/Language learning host retains subject, grade, checkpoint selection, answer handling, and progress. Scene playback and instructional interactions must honor an active host activity; the interpreter cannot mark the activity correct or dismiss it. [Math integration](../adaptive-math/integration.md) and [Language integration](../adaptive-language/integration.md) remain the relevant learning contracts.

The separate local key is `family-game-factory-creation-v1`, schema `jems.creation.workspace.v1`. Storage keeps owner-scoped project entries, immutable revisions, a separately selected kept revision, recoverable drafts, and bounded attempt records. An autosave protects an experiment; it does not choose a favorite. Editing uses an expected base revision to reject stale writes. A saved source reference cannot be rewritten through an ordinary edit.

The [shared Rewards extension](../rewards/README.md) adds an optional `rewardOutbox` to this same schema. A durably saved passing challenge check queues 8 engagement gems once per owner/challenge ID; hints do not reduce the reward. Rechecking, copying or using another revision cannot earn the same challenge grant twice. The record remains a specific formative observation, with no new mastery score. The source write and pending fact commit together; ledger projection and acknowledgement recover independently. Reading/restoring earlier attempts does not backfill rewards. The origin-wide source-writing guard prevents concurrent tabs from overwriting the synchronous source document.

When an unfinished draft is recovered, the child must choose **Resume my draft** or **Use saved version** before editing, keeping, copying, checking, playing, importing, or selecting history. Pending recovery never silently replaces the draft with edits to the older saved scene. Navigation and family backup export preserve the unresolved draft.

Profile changes must stop playback, discard active input/capture callbacks, and prevent a late result from entering another profile. Adult development uses the existing dynamic profile storage namespace. This is local ownership separation, not an encryption or cloud-sync claim. Storage failures and unsupported backups must retain the last valid data and report the problem. Existing family backup/reset integration must include this key explicitly; adding a scene store does not make the original drawings or remote games automatically synchronized.

Supported browsers can record the scene canvas for up to 15 seconds and download a video. This is a local recording of rendered frames, with speech bubbles and no recorded audio. Codec/container support is detected; a fallback editable JSON scene remains available. This is not a promise of offline rendering, audio synthesis, MP4 support on every device, or an identical recording on every browser. Leaving, switching profiles, or cancelling a recording must stop its stream and suppress stale download callbacks.

## Generated-game companion manifests

`createProjectFromStudio(session, revision, manifest)` has an explicit manifest import path. A supplied scene is validated against the same language and bundled asset allowlist, receives a fresh scene identity, and retains source references. Without a valid manifest, an unsupported/generated game must explain that it has no editable scene rather than pretending its JavaScript was translated.

For native games without a scene adapter, the game toolbar offers **Start a separate scene** and opens the free-creation shelf. It does not create a scene or modify the source game before the child selects a starter. Dragon, Buckets and Robot retain **Animate & code** and their source-linked scenes. A generated game is checked for its actual companion manifest; an absent manifest opens the separate-scene shelf with an explicit explanation.

A generator's optional companion scene is a separate data artifact, not executable authority and not proof that its actions reproduce the source game. The branch implements this transport through the existing private generator and accepted revision path:

- [generated.ts](../../server/agent/generated.ts) accepts optional `GeneratedGame.creationManifest`; a null/absent value remains compatible with older games. Its validator strips invented source provenance and attributes the whole supplied program to assisted creation, then enforces a **32,000-byte UTF-8 limit on the normalized scene**. An accepted manifest can be validated repeatedly without attribution making it exceed the limit. Test publication must retain the same reviewed manifest rather than replacing or dropping it.
- [creation-schema.ts](../../server/agent/creation-schema.ts) provides a closed provider schema and the companion instructions used by [openai.ts](../../server/agent/openai.ts). The provider may return null. Its initial subset uses the bundled asset catalogue, an 800×450 stage, and `score`/`counter` variables; local editing supports the broader validated language. Before reading the key or contacting the provider for **source generation**, the adapter selects a request without optional companion data if companion overhead would exceed the existing input or remaining-spend cap. Both modes preserve the full game source, child intent, preflight, presentation brief, approved-art metadata, playthrough contract and bounded repair feedback. Repair also retains the required desktop/tablet capture evidence. Both modes count schema bytes; fallback makes no extra request and never reuses a stale companion on the changed game. If the game-only request still exceeds a cap, it fails closed. The separately required planning, approved-art and quality-review stages from [the merged quality contract](../game-intelligence/PRESENTATION-QUALITY.md) remain intact; this is not a one-call claim for the whole build.
- [DockerArtifactGate](../../server/sandbox/docker-gate.ts) holds the normalized companion in trusted host state. The validated executable game, approved assets, production plan, suggested playthrough, separately authored intent plan and capture-quality option reach the sandbox under the existing quality contract. The companion does not enter sandbox stdin. After validating the source/compiled/runtime/art/plan/playthrough attestations, the gate reattaches the original companion and validates requested quality evidence; sandbox output cannot supply a replacement scene. This preserves the merged quality runtime and resource limits without making scene metadata consume the executable test payload.
- `GET /v1/revisions/:id/creation` in [the existing pipeline handler](../../server/pipeline/http.ts) returns `{revisionId, projectId, manifest}` with `manifest: null` for legacy/noncompanion revisions. It reuses `service.revision` family/device/adult-audience checks and the API's no-store response policy. It does not return source, compiled code, or preview capabilities.
- [BuilderClient.creationManifest](../../src/builder/client.ts) checks the requested revision, validates the data again, and rejects a late result after disconnection/profile change. The UI must retain its own current-session check before opening the new scene.

The gateway and preview container builds include the trusted scene validators and catalogue dependencies. This does not update an immutable generated-game runtime archive or change the worker's selected application source by itself. No new provider call, browser model key, alternative build route, arbitrary asset URL, or live worker deployment is implied. [Generated-companion tests](../../tests/creation-generated.test.ts) exercise synthetic transport, publication, authorized retrieval, and stale-callback cases; they do not establish that a live provider reliably authors useful companion scenes.

## Verification and future work

Focused validation lives in [engine tests](../../tests/creation-engine.test.ts), [storage tests](../../tests/creation-storage.test.ts), [challenge tests](../../tests/creation-challenges.test.ts), [private-art contracts](../../tests/creation-private-art.test.ts), [private-art browser journeys](../../tests/creation-private-art-browser.cjs), [generated-companion tests](../../tests/creation-generated.test.ts), and [generation-budget tests](../../tests/creation-generation-budget.test.ts). The engine cases exercise actual trajectories and timing, event loops and execution bounds, pauses and interruption, reference validation, and immutable snapshots. Challenge cases must include successful alternatives and misleading final-state/order/input cases. Storage cases must include cross-owner denial, stale edits, failed writes, damaged imports, source pins, explicit Keep, and draft recovery. Private-art checks exercise exact original/rig references, reuse, real scene playback/video, portable import, corrupt-reference rejection, profile isolation and late-decode cancellation. Generation cases cover normalized byte limits, companion-free sandbox transport with unchanged art/quality contracts, unchanged trusted companion publication, optional-overhead fallback, and pre-key source-generation input/spending denial without additional provider calls.

Run `npm run build`, `npm run test:creation`, `npm run test:creation-browser`, and `npm run docs:check` for a release candidate. The browser command includes both the authoring journey and family recovery checks; [acceptance evidence](ACCEPTANCE.md) distinguishes their observations from release acceptance. Record the exact candidate and results in the normal delivery evidence. Source tests do not establish actual tablet reliability, a real child's enjoyment, secure live provider operation, or educational validity.

The accepted longer-term direction is a more continuous project model across games, scenes, conversation, and visual rules. This implementation does not include arbitrary code-to-block conversion, two-way editing of every generated game, a multitrack film editor, independent rig joints inside the block interpreter, a full Scratch-compatible environment, or independent computational-thinking/active-problem-solving assessment. Private art is available to the trusted local scene renderer; this does not install a private-upload registry in arbitrary generated games. New scene actions and adapters should extend meaningful child control while preserving existing games and source provenance.

## Reference principles

- [Jems child-owned design coaching](../design-coach/GOLD_STANDARD.md): meaningful child decisions, optional reflection, recoverable experiments, and honest learning claims.
- [Harvard Creative Computing](https://creativecomputing.gse.harvard.edu/guide/): creative projects and computational practices; this reference does not validate the Jems exercises.
- [Blockly custom blocks](https://docs.blockly.com/guides/create-custom-blocks/overview/), [serialization](https://docs.blockly.com/guides/configure/serialization/), and [execution scope](https://docs.blockly.com/guides/app-integration/run-code/): background for future editor-library decisions. V1 uses Jems action cards and its own bounded interpreter, not Blockly or a Scratch fork.
- [Scratch editor repository](https://github.com/scratchfoundation/scratch-editor): an example of separate editor, runtime, rendering, and asset components. Do not assume that integrating a visual editor also supplies a Jems game runtime or measurement system.

## Branding and creator navigation integration (PR57)

The main destinations include both Create and Create & code alongside My journey. Leaving a visible scene for the chat creator saves a pending scene version without choosing Keep, then uses the normal page transition to stop scene playback, recording and the checkpoint clock. An active learning checkpoint blocks this navigation before a blank chat project can be created. Scene ownership, saved versions and backup records remain unchanged. The production-browser suite covers running scene → Create → My journey, stopped simulation, scene reopening, draft preservation, direct shelf import, shared saved-scene discovery, explicit challenge continuation/new attempts and profile isolation.
