# Art Studio: draw it, develop it, reuse it

The crayon editor uses the same stateless CSS-to-canvas coordinate helper as Learning Workspace PR #203. My Art applies its own stored stroke precision after coordinate mapping. The learning paper remains transient and owns its own tools and undo.

## Connected creative asset picker

My Art accepts an optional **What is it?** description. A child can enter “rock” or an invented word, leave the field empty, and change it later. The shelf and picker search the description and artwork names. Updating the description from any picture updates the related pictures in one owner-scoped transaction. Pinned image bytes and movement versions retain their original hashes.

The trusted picker joins private picture metadata with saved movement versions in the existing local art database. A picture's oldest verified ancestor supplies its stable logical identity. Each picker result identifies the exact selected picture and optional saved movement. Parent IDs and fingerprints preserve the path back to the original. Portable copies remap those links into the importing profile. Restore uses the existing exact-ID and content checks. No database upgrade or rewriting of legacy pictures is required.

Creative Studio can insert the original, an edited picture, or any retained cutout version. Search and collection filters work with touch or a keyboard. Archive hides a picture and its cutouts from new selections. An earlier scene still resolves the exact version it used. **Choose another version** in a private actor’s scene settings offers its related pictures and cuts while preserving the actor’s blocks and position. In scene settings the child can assign an optional role to their private actor. “Decoration”, “obstacle” and “collectible” describe its part in that scene. Blocks and the host's explicit mechanics control what it does.

Downloading a scene with artwork includes its placed pictures, selected movement versions and their required ancestors. Unfinished drafts and unrelated movement versions stay on the device. Downloading the whole My Art library still includes those drafts and versions for recovery.

[Shared catalog](../../src/assets/creative-catalog.ts) · [Picker](../../src/assets/creative-picker.ts) · [Portable art](../../src/drawing/transfer.ts)

## My Art navigation and preserved visual reference — November 25, 2026

**My Art** is the canonical destination in Home and Menu → Make. The original **You drew it. Now let’s play.** heading, gem illustration, gradient panel, Upload a drawing / Take a photo / Draw here arrangement and collection remain the visual reference. Readability is improved without replacing the composition or assets. Optional picture controls in a game/scene open the same library and offer an owner-bound return to that activity. Scene links use **Creative Studio**. Original pixels, derivatives, exact references, camera/upload and private storage contracts below are unchanged. See the [modernization decision](../decisions/2026-11-25-child-experience-modernization.md). Earlier placement descriptions below are historical where they differ.

**Source scope:** Art Studio from merged [PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23), November 19, 2026 (America/New_York). This contract describes source behavior, not production deployment. The accepted direction is recorded in [the Art Studio decision](../decisions/2026-11-19-private-art-studio.md). [Delivery state](../../DELIVERY-STATE.md) records its merge receipt and keeps the subsequent first-creation integration acceptance separate.

## The experience

Art Studio is an owned creation space in the current Jems shell. Enter from **Menu → Make → Art Studio**, **My Games → Art Studio** beside **Invent a game**, an idea's **Use my picture** action, **Create & code → Art Studio**, the legacy saved collection, or `?art=1`. These are subdestinations of creation in the compact My Games / Create / Menu shell, with the existing saved-draft, learning and ownership guards. Grown-ups can open the selected player's art from the existing backup settings.

**Entry correction, November 20, 2026:** the home action appears before the game catalogue. In the [guided chat creation flow](../decisions/2026-11-20-guided-chat-creation.md), the new idea's **More choices → Use my picture** action opens the same guarded Art Studio route; that same control appears in the existing game’s **More → Use my picture** tools during dedicated play. Exiting play restores its ordinary placement. The disclosure starts closed so optional picture tools do not crowd the child's current question. This supersedes the earlier always-visible composer placement while keeping a discoverable, tested path. Local Art Studio and Create & code install before the background builder-configuration request; a delayed or unavailable workshop cannot hold their routes behind a network response. The configuration request has a 10-second bound and can update readiness without replaying the initial route, replacing the current owner or submitting a build.

The [first-creation entry](../child-journey/FIRST-CREATION.md) recognizes saved private art as existing creative work even before a game or scene exists. Its presence check respects the active owner and keeps the ordinary home available when art storage cannot be read; it creates no progress or guidance records.

1. **Bring in an idea.** Upload a PNG/JPEG, use the camera file picker, or draw on a local canvas. Every picture has its own original bytes, hash, name and profile owner.
2. **Keep an art collection.** Search by name, filter Characters/Vehicles/Things/Worlds, rename and categorize. Thumbnails show real saved art. Archived art is hidden from the ordinary shelf but still resolves in existing adventures.
3. **Prepare the picture.** Crop, turn, flip and optionally remove connected white border paper. Undo/Redo operates on the edit. Saving creates a new PNG derivative linked to the original; no original image is rewritten. The working copy is bounded to 1600 pixels on its longest side; the original retains its full bytes.
4. **Give it movement.** Correct the local suggestions, add/remove/move/resize parts, choose roles, and test real motion. Advanced controls expose outlines, parenting, hinge placement, brush-mask erase/restore and numeric geometry. Touch, pointer and keyboard controls work on the same model. Suggestions are disclosed as guesses. The editor and runtime use the decoded source image's width/height and one physical scale, preserving rectangular-image proportions; designs outside the bounded physics range receive an explicit correction message.
5. **Save and reuse.** Each saved movement design has an immutable ID and parent revision. Draft recovery is separate from choosing a saved version. Open the selected original or movement design in a new Create & code scene, or create a saved Junkyard Rally game from a car design.

After an upload/photo import, local drawing save or edited-picture save, the newly selected artwork receives focus. Narrow screens scroll its details into view. Drawing and picture dialogs finish closing before focus moves; owner, page and selected-art checks prevent a stale save callback from moving focus in another player's work.

## Later web-journey and menu integration

The owner requested these corrections first and the broader navigation integration later. The compact menu provides **Make → Art Studio**. Preserve the corrected entry module and the optional **More choices** placement when integrating later branches. `src/studio/art-entry.ts` retains the existing `studioArt`, `studioArtShortcut`, `studioUseDrawing`, `creationArtStudio` and `collectionArtStudio` IDs and uses the host's existing guarded Art Studio callback. `?art=1` and `FG.artStudio.open` remain compatible; no upload handler or art store is duplicated.

When combining the menu branch, connect its **Art Studio** action to the same guarded route and mark that menu destination current while the art page is open. Preserve the separate child-interface text/typography changes and selected-maker imagery; these corrections do not replace that work. Recheck menu open/close and focus, first-visit entry, return to the original game/scene, owner changes, required-learning and failed-save guards on the combined source. A prepared branch does not establish that this combined menu is deployed.

The source [gold standard](GOLD_STANDARD.md) still requires visible artwork fidelity, inspectable assumptions, purposeful real movement and recoverability. This branch does not claim universal drawing recognition, broad photo segmentation accuracy or observed child enjoyment.

## What the integrations actually do

| Destination | Binding and behavior |
| --- | --- |
| Movement playground | Part outlines, masks, roles, parenting and pivots drive bounded local physics. Car wheel/chassis geometry determines actual colliders and suspension; non-car roles create real joints and controlled movement. |
| Junkyard Rally | A new saved game revision contains `drawingRigId`. Runtime context carries the exact ID. Mechanic edits, history and copies retain it. The physical adapter accepts one body, two attached wheels and fixed body decorations; extra independent parts require a supported design before Rally can run. The original pixels and transparency of overlapping fixed decorations remain intact. A missing design blocks driving and asks for its art to be restored; it cannot silently use a stock car or the newest global selection. |
| Create & code | A trusted private-art reference pins either original picture identity/hash or rig identity/assembly hash. The renderer resolves it only for the scene's active owner. A rig becomes a transparent composite actor controlled by the existing motion/story/event blocks. Separate limb physics remains in the movement playground and Rally. |
| Existing scenes and imported generated companions | The local editor can add private art after the scene is opened. Generated scene manifests remain restricted to the reviewed bundled catalogue. The private IDs and image bytes do not become model inputs or assets readable by untrusted generated code. |
| Learning, rewards and parent reports | Native games and scene playback retain their existing trusted learning gates. Uploads, drawing edits and saves introduce no new learning score or reward category. Existing scene challenge results keep their original provenance and assistance rules. |

Changing a library picture's metadata or saving a later rig does not rewrite earlier game or scene references. A new use is explicit. The legacy `activeRig` pointer remains a picker convenience, never the authority for a saved Studio game.

## Keep drawing on a saved picture

**Draw here** starts with white paper. Children can choose a crayon, change its size, erase a mark, or select a clear background for a sprite. Undo restores marks removed by the eraser or Start over. Touch, mouse and keyboard work on the same canvas. **Keep my drawing** saves the picture on the active player's shelf. **Keep drawing** reopens its strokes. **Keep new version** pins the result to the selected parent picture and hash. The earlier picture and adventures remain recoverable.

Each new crayon PNG contains its finished raster plus a versioned private ancillary `jeMS` chunk holding the editable source. Both travel in the exact bytes already covered by the artwork hash, byte quota, export, restore and parent backup. The chunk records the paper choice, palette indices, brush widths and bounded coordinates on the 900 × 560 canvas. The limits are 160 strokes and 4,096 points per stroke. The PNG contains no profile or family identifier. Treat the entire file, including strokes covered by the eraser, as private artwork. **Download visible picture** renders a separate transparent-capable PNG containing the final pixels. **Download editable original** returns the exact file with its crayon and eraser steps.

On reopen the host checks the chunk checksum, bounds and decoded pixels against a local rendering of the stroke source. New saves use the v1 format from [#199](https://github.com/jzwyrzyk/family-game-factory/pull/199), with 1/64-pixel coordinates. If that replay differs, the reader checks the earlier 1/32-pixel candidate against the same saved pixels. The two candidate writers used the same version marker. When an erased image matches both interpretations, the reader uses the #199 coordinates and preserves the source bytes. A mismatch leaves the original available on the shelf. Re-encoding a PNG in another app can remove its source. Older raster-only drawings, photos and flattened picture-tool derivatives retain the existing picture and movement tools. Pending strokes live in the open editor until the child keeps or discards them. Learning-workspace scratch paper has a separate, temporary lifetime.

The offline phone and desktop journey uses a synthetic drawing, reopens saved strokes after reload, erases and restores real alpha, saves a pinned version, and opens its downloaded library in a fresh browser. [Phone capture](evidence/editable-drawing-phone.png) · [Desktop capture](evidence/editable-drawing-desktop.png) · [Browser regression](../../tests/art-entry-readiness.cjs)

## Storage and lifecycle

`family-private-drawings-v1` is upgraded in place to database version 3, with stores for originals, rigs, drafts, selected legacy rig, usage, migration metadata and the regenerable drawing catalog. Existing original records remain compatible. Metadata and previews page separately from original bytes, which are read when selected or explicitly backed up. While a prepared native or scene authority exists, physical deletion is blocked under the shared maintenance lock because the legacy usage index cannot prove all references; Archive remains available and preserves original bytes. The old draft PR's separate rig database is read once for compatible migration; it is not erased. When native database inventory is available, an absent legacy name is not opened merely to discover absence; inventory failures remain visible. Existing databases and browsers without that inventory API retain their validated legacy reader.

- PNG/JPEG headers, actual decode, maximum byte count and dimensions are checked. Originals retain their hash. Upload decoding is local.
- Profile identity and the shared source-writer guard are rechecked after asynchronous work and before mutation. The temporary adult profile uses its distinct owner identity. A late decode or save cannot insert art into a newly selected player's view.
- Quota, ownership, parent/source linkage and related writes share an IndexedDB transaction. A failed import does not leave partially added source/rig records.
- Drafts persist editable assemblies without promoting a version. Undo/Redo and pointer cancellation preserve meaningful history. Save and close handle pending draft writes; failed saves remain visible.
- Creating a Rally game stages its native revision and Studio notebook reference together. A synchronous notebook-save failure compensates the native write while it still belongs to that operation; the retry creates one linked game with the chosen immutable rig. Previously retained unlisted Rally games remain recoverable without replacing their IDs or drawing bindings. The supplementary art-usage index cannot hide a saved game. The PR166 branch adds a durable exact-image undo journal for this native/notebook operation under the shared writer lock, with startup reconciliation; the drawing database retains its separate IndexedDB transactions. See [storage recovery](../storage/README.md) for limits and source status.
- Archive preserves storage and all references. Permanent removal rejects retained dependencies, including derivative sources, usage records and saved scene/native-game history. A separate original remains exportable.
- Image previews and decoded private canvases are discarded on profile/view changes. Runtime resolution never fetches an arbitrary external URL.

Limits are explicit in `src/drawing/library.ts`: 5 MiB per image, 4096 pixels per dimension, 20 MiB of image/preview storage, 100 drawings per owner, 200 saved rigs per owner, bounded design storage and 64 MiB portable bundles. Archiving does not free the bytes; the UI says so when capacity is reached.

## Backups and transfers

The existing family progress JSON continues to contain learning, game and scene records. Art remains a separate compatible downloadable bundle. Parent complete recovery copies additionally capture original bytes, rigs, active prepared records and recovery metadata together, with integrity validation, preview and safety rollback. The legacy progress file alone is not a complete image backup. Separately approved cloud recovery stays disabled by default.

| Action | Result |
| --- | --- |
| Download my art library | Exact originals, derivative lineage, movement revisions and drafts for this player. No credential or shared cloud URL. |
| Open an art library | Validates the entire bundle, then creates additive copies with new local IDs and the selected owner. Existing work remains untouched. |
| Restore art for saved games | Validates the entire bundle and restores its original IDs for the selected player. An existing ID must already be byte/geometry-identical and belong to this owner; conflicts reject the transaction. Existing metadata and newer drafts are not overwritten. |
| Download scene & artwork | One portable file containing the scene and the exact original/rig assets it needs. Import validates scene and art, remaps both together and creates a new scene. A later scene-save failure reports that imported art remains available rather than claiming that the scene saved. |

To move family progress and its art: download progress and each relevant player's art library; restore progress on the destination; select the matching player; use **Restore art for saved games**. To move a standalone scene, use its combined scene/art file. Backups contain private artwork and should remain private.

## Source map and acceptance

| Area | Source / meaningful checks |
| --- | --- |
| Entrances and offline startup | `src/studio/art-entry.ts`, `art-entry.css`, `ui.ts`; `tests/art-entry-readiness.cjs` checks the phone home/composer entrances, pending/rejected configuration, actual upload/drawing save, late readiness and profile isolation |
| Dedicated library and picture tools | `src/drawing/studio.ts`, `studio.css`, `picture.ts`; `tests/art-studio-browser.cjs`, `tests/picture-tools-browser.cjs` |
| Original storage, rigs, drafts, transfers | `src/assets/private-drawings.ts`, `src/drawing/library.ts`, `store.ts`, `transfer.ts`; `tests/art-storage-browser.cjs` |
| Parts, segmentation and physics | `src/drawing/model.ts`, `segmentation.ts`, `playground.ts`, `rally.ts`, `src/quality/physics.ts`; `tests/drawing-engine.test.ts`, `tests/drawing-engine-browser.cjs` |
| Exact native revision bindings | `src/factory/workspace.ts`, `src/studio/adapter.ts`, `src/runtime/`; `tests/drawing-bindings.test.ts` |
| Local scene integration and portability | `src/creation/private-art.ts`, `projects.ts`, `stage.ts`, `ui.ts`; `tests/creation-private-art.test.ts`, `tests/creation-private-art-browser.cjs` |

Acceptance uses synthetic pictures in the real production browser bundle. It checks original preservation, real alpha-mask/geometry consequences, private storage, profile changes, version reuse, corrupt/oversized imports, camera/drawing entry points, missing-asset recovery, game/scene playback, portability, mobile reflow and zero image POSTs. See the [scoped evidence record](EVIDENCE.md). Synthetic fixture tests and emulated touch do not establish real iPad/Android camera behavior, battery performance, universal segmentation or learning efficacy. See [the staged program](PROGRAM.md) for the still-separate research work.
