# Creation Studio acceptance evidence

**Development date:** November 19, 2026 (America/New_York).

**Base:** `079978f3034e007e8bbad1f43571aaa7867b5098`, verified remote `main` when the isolated feature branch was created.

**Branch:** `feature/jems-creation-lab-20261119`.

**Disposition:** development for a new draft PR; no merge, deployment, provider activation, or private-worker source change.

The [feature contract](README.md) describes source behavior. [ADR0006](../decisions/0006-creation-and-rebuild-practice.md) records the owner direction. The final implementation candidate is `b7e8ec0302b5fdfc89917c97282e5f5823e2a7af`. Build, the 61 creation tests, both creation browser suites, 296 existing unit tests, 31 Studio unit tests, existing Studio browser journeys and the exact-base/head documentation check passed on that candidate. The later evidence commit changes only documentation, screenshots and review metadata. The learning integration suite passed during development before that final candidate; it is recorded separately from exact-candidate evidence. Remote CI belongs to the actual PR head.

## Local checks and evidence

| Claim | Check | Observed result and limit |
| --- | --- | --- |
| Strict data model and actual bounded execution | `npm run test:creation` | 61 tests passed: 14 engine, 25 behavioral challenge, 16 storage/observation, 6 generated companion. These are software checks, not learning validation. |
| Existing generation, identity, revisions and product contracts | `npm run test:unit` | 296 tests passed, with no live model calls. |
| Existing Studio ownership and supported edits | `node --import tsx tests/studio-unit.ts` | 31 tests passed. |
| Integrated scene creation | `npm run test:creation-browser` | Production bundle passed at 1440×1080 desktop and 820×1180 touch-emulated tablet. No page errors or paid requests observed. Actual tablets and children were not tested. |
| Family backup and support recovery | `node tests/creation-recovery-browser.cjs` | Seven grouped browser checks passed: actual export, invalid input refusal, corrupt raw preservation, rollback after a write fault, valid recovery, legacy replacement and retired-goal reopening. No page errors or paid requests observed. |
| Existing Studio journey | `node tests/studio-journey.cjs` | Desktop/mobile and remote transport fixture passed: experiments, explicit Keep, source state, undo/fork, profile isolation and failed-change preservation. Remote fixture is not a live provider. |
| Existing trusted learning behavior | `npm run test:learning-integration` | Desktop/mobile native and generated preview checkpoints, pause/resume, pacing, persistence/recovery and parent insights passed. |
| Production compilation | `npm run build` | TypeScript and Vite production build passed. Vite retains a large-bundle advisory; no claim of performance on a physical device. |
| Shared validator image dependencies | Bundle gateway and preview from their Docker COPY source inputs, with installed packages external | Both entrypoints resolved all local dependencies. This is a source-dependency check, not an actual container launch or deployed image test. |

The system Chromium binary could not launch in the command sandbox because its profile singleton socket was denied. The automatic approval policy rejected an outside-sandbox retry. The installed Playwright headless shell ran successfully in the normal sandbox using the existing `CHROMIUM_PATH` test override. No environment policy was changed.

## What the scene browser journey actually does

The browser test edits through the public controls; the `FG.creation` inspection helpers only read results. It verifies:

- Existing Dragon game → Animate & code → source-pinned scene → original game. The original game workspace remains unchanged, and repeating the entrance resumes the same scene.
- Start a blank scene; add/edit movement and speech, reorder actions, undo, build a nested repeat, play, pause, step, keep, reload and reopen the authored version.
- Download the actual editable JSON and a finalized canvas video. The inspected sample video is VP9, 800×450, approximately one second. Recordings are silent; speech bubbles remain visual text.
- Switch players, inspect the absence of the other player's content, and return. The responsive profile menu stays inside the tablet viewport.
- Watch a target without replacing the editable scene. Build a three-bounce solution using blocks; verify success, then change it to two bounces and verify specific feedback.
- Author tap behavior and both branches of a variable condition. Check both successful and incorrect boundary behavior.
- Open a hint, reload, and verify its support flag remains recorded. Observe specific saved checks in the current profile's My Powers panel.
- Open a real host learning checkpoint and verify Play, Step and other scene actions cannot dismiss or bypass it. Leaving uses the existing interruption policy.

Tests deliberately satisfy the ordinary pacing budget for unrelated editing/history steps, then exercise real host checkpoint guards separately. The challenge evaluator tests multiple distinct input cases rather than only the target replay timing.

Screenshots and machine-readable results are generated under `test-results/creation-*`; the existing CI artifact step collects them. Screenshots contain synthetic fixtures and bundled game artwork. They do not contain private child conversations or signed preview capabilities.

## Recovery and compatibility acceptance

The creation store rejects malformed/future schemas, preserves original bytes, prevents stale version writes, and leaves saved revisions intact on write failure. Family backups include the validated creation workspace. A damaged workspace can still be exported as a clearly identified recovery string; it cannot masquerade as a valid restore. Restoring a valid backup can replace damaged scene data, with the original bytes available for rollback. An older family backup with no scene field restores an empty scene workspace rather than attaching unrelated prior scenes to reused profile IDs.

Old generated games continue to validate without a companion manifest. The authenticated companion endpoint returns `null` when one is absent. New manifests have no executable payload or external asset URL, preserve the published value, and are marked assisted. Tests cover foreign-family/adult access denial, revocation and stale browser responses; they do not establish live provider output quality.

## Remaining acceptance boundaries

- This is a first editable creation system, not full Scratch compatibility or arbitrary JavaScript-to-block conversion. Curated adapters preserve supported assets/settings; generated companions are explicit optional data.
- Editing a scene does not rewrite its source game's code, physics or saved revision. Conversation-to-block editing and broader shared game semantics remain future work.
- No actual child study, validated critical-thinking/computational-thinking scale, general mastery score, or educational-growth result is claimed.
- Physical tablet/browser accessibility and usability review, including prolonged sessions and recording support, remain release acceptance work. Touch emulation is scoped software evidence.
- No live model request, deployment or private-worker pin update occurred. Shipping the generation path would require the normal coordinated frontend/gateway/preview/worker release process.

## Final candidate record

Final build and creation checks: **PASS**, implementation `b7e8ec0302b5fdfc89917c97282e5f5823e2a7af`. The browser journey also verifies that a direct tap on a completed scene opens a newly due host checkpoint, and subsequent Play, Step and target controls preserve that same activity.

- [Creation browser result](evidence/creation-browser-results.json) — desktop and touch-emulated tablet, zero page errors and paid requests.
- [Recovery browser result](evidence/creation-recovery-browser-results.json) — seven grouped recovery checks.
- [Dragon source scene, desktop](evidence/dragon-scene-desktop.png).
- [Rebuilt challenge, desktop](evidence/rebuild-challenge-desktop.png).
- [Conditional scene, touch tablet](evidence/condition-tablet.png).

CI results should be read at the exact PR head; earlier local or historical records do not replace failing current checks. No actual-device, live-provider, merge or deployment claim follows from this record.
