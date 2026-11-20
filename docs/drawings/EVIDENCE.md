# Art Studio integration evidence

**Review scope:** November 19, 2026 (America/New_York), the refreshed [drawing PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23). The [feature contract](ART_STUDIO.md) describes implemented behavior; this record describes observed verification. This is source integration, not deployment or physical-device acceptance.

## Source identity

The integration preserves original PR head `0f91b52bc162ad8d7fad1211515544f638934e21` and current main `df63bc2c7644a26a84a7c7e626b682e7c76c493d` as merge parents. Initial implementation checkpoint `252fbefe96af9150ba5144ad74e76f413b9b863c` includes the dedicated art page, shared storage, picture and movement tools, native and scene adapters, tests and feature documentation. Final application source `758239d420912d0c0c41bbe3cb017c4c6b88c885` adds faithful source-image proportions to physical play. Its tree is `9bd59c416c9543246f35759722b3df9d0359b113`. Capture source `27f62030809c0aba9fdf19c1c2230a9d4d704f7e` (tree `d436079c469911ed61b3602ef7d6ad8c57d4a2eb`) adds only singular/plural library labels to that application; the build and Art Studio journey were rerun. The unit/art and complete art-browser results are pinned to the functional source above. Subsequent publication changes are evidence and documentation only. Publication and hosted workflow results are recorded in [delivery state](../../DELIVERY-STATE.md) and the PR.

## Local contract and recovery checks

| Check | Observation and limit |
| --- | --- |
| Production build and strict TypeScript | Passed after the final geometry refinement and again after the label polish: `index-CjEWLUDv.js` and `index-CWNSmYoa.css` (earlier geometry build: `index-C7Ixev09.js`). Production assets are served below `/arcade/` in the browser checks. The existing large-bundle advisory remains; no physical-device performance claim follows from compilation. |
| Existing unit and service contracts | All **376** checks passed after the final geometry refinement. An earlier local run failed one trusted-device HTTP fixture with `ECONNRESET`; complete subsequent runs passed with no change to trusted-device source. This is fixture validation, not a live service acceptance. |
| Private-art source contracts | All **24** passed: 16 drawing/geometry checks, two native binding checks and six private-scene checks. Covers actual game revision inheritance, undo/fork, profile boundaries, remote-manifest rejection, immutable scene reuse, maximum-alpha composition, source-aspect physics and restored 100-character art identifiers. |
| Private storage | 44 checks passed using real IndexedDB and browser image codecs. Cases include original hashes, migration, conflicting restore, cross-owner access, quota races, atomic rejection, stale writer guards, derivative/scene/native-history deletion protection and exact-ID restoration. |
| Picture Tools | Four regression groups passed: extreme aspect ratios, committed-save callback failure without duplicate derivatives, view/decode cancellation and delayed encoding across a profile change. |
| Existing Creation contracts | All 77 engine, storage, challenge, generated-manifest and budget checks passed. Private asset references remain rejected at the generated-manifest boundary. |

## Production-browser journeys

The complete `npm run test:art-browser` command passed after the final geometry refinement. Its five suites use synthetic drawings and local pseudonymous profiles. Service configuration is explicitly unavailable; none of the new art journeys made a POST request or an AI request, and they reported zero unhandled page errors.

- **Art Studio:** default entry; upload; real library thumbnails; category/search; truthful refresh failure; save, close and recover an unfinished design when saved versions exist; notebook quota recovery without duplicate games; usage-index failure without hiding a saved game; exact Rally binding; picture derivatives without original mutation; scene entry; portable art download; invalid-image rejection; profile isolation; 390px and 320px reflow.
- **Drawing engine, desktop and emulated tablet:** drag-to-add, move/resize, keyboard controls, Undo/Redo, draft recovery, editable pixel masks, full wheel-outline separation, fixed-decoration transparency/rotation, real colliders/joints, saved rig versions, explicit missing-art blocking, local sketching and stale owner/view handling.
- **Create & code, desktop and emulated tablet:** saved-cutout playback; actual WebM recording; reuse of one exact asset in another scene; combined scene/art export; changed-hash rejection before writes; portable import as isolated copies; reload; failed scene save without orphan usage; deliberately delayed private-image decoding across a profile switch.
- **Existing application continuity:** restored collections and seven-route navigation passed on desktop and phone; legacy drawing upload/edit/export/delete passed; existing Creation authoring passed on desktop/tablet, including its learning guard, with all eight backup/recovery groups.

The full physical-quality command also passed stock construction, native Rally, touch orientation, generated-game controls/containment and the legacy sticker builder. Those broader checks preceded only the final bounded source-aspect refinement; all unit/art contracts and the complete art browser command were rerun afterward. Source-specific results are recorded in the final PR evidence rather than inferred from earlier PR23 CI.

## Visual review

The captures are actual application output. The library contains a synthetic car, creature and flower. The car's fallback wheel suggestions are corrected through the normal numeric outline controls before the demonstration is saved; they are not presented as automatic recognition success. No generated mockup, child photograph or private conversation is used.

Review checks include the current Jems identity and navigation, clear entry actions, readable card names, visible close controls, responsive wrapping, usable editing controls, original versus derivative identity, the drawn car in the native game and the art actor beside its real blocks. The scrollable movement editor retains its full tools and save controls. The final captures accompany this record:

- [Art Studio on desktop](evidence/studio-desktop.png) and [phone](evidence/studio-phone.png).
- [Movement editor](evidence/movement-editor.png), with the sample's wheel outlines corrected through visible controls.
- [The drawing in native Rally](evidence/rally-car.png).
- [Saved character in Create & code](evidence/scene-code-desktop.png).
- [Source, build and capture checksums](evidence/local-validation.json).

## Deliberate boundaries

The library is local to the browser and selected player. Portable files provide explicit transfer; the existing family progress JSON still needs the separately downloaded art library. A combined scene/art file is the single-file alternative for an individual scene. A block scene uses a rig as one composite actor; independently articulated physics belongs to the movement playground and supported Rally adapter. Generated game code does not receive private image bytes or permission to resolve these assets.

Browser emulation and fixture tests do not establish camera behavior on a physical iPad or Android device, Safari compatibility, battery performance, universal semantic segmentation, observed child enjoyment or educational benefit. Merge readiness, merge, website deployment and provider activation remain separate states.
