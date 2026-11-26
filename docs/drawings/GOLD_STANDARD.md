# Drawing-to-Playable Engine — Gold Standard

The [Creative Asset & World Design Standard](CREATIVE_ASSET_AND_WORLD_STANDARD.md) governs permanent fidelity, source bytes, authoring and cross-activity reuse in new development.

**Current integration:** the refreshed PR23 [Art Studio contract](ART_STUDIO.md) supersedes the earlier branch UI/storage limits below where specified. It adds the dedicated branded library, crop/turn/flip tools, recoverable drafts and Undo/Redo, immutable per-game bindings, private local scene artwork, and art/scene portability. The physical and recognition principles remain unchanged.

**North star:** A child draws something, explains what it should do, and can immediately see *their actual artwork* doing it in a physically meaningful game. The software removes implementation difficulty, not authorship. A missed detection must be easy to correct without asking an adult or redrawing the object.

The image itself is never sufficient to prove an object's physical function. We separate **pixels**, **named components**, **physical constraints**, and **behavior/game intent**. The child can override all ordinary assumptions.

## Product acceptance (every supported object)

1. **Fidelity to the child:** The original photograph or drawing remains unchanged, always recoverable, and visually recognizable. Transparent cutouts are derived assets; a fallback stock object may not be passed off as a successful decomposition.
2. **Truthful recognition:** Automatically inferred parts are suggestions, not facts. The UI says when a result is guessed. A child can mark, move, resize, rename, reassign, and remove incorrectly inferred parts. Ambiguous mechanical intent gets one consequential question at a time.
3. **Real motion:** Moving or resizing a wheel changes the real collider/axle in the physics simulation. A wing/limb's joint attaches at the reviewed pivot. A decoration follows its body without pretending to be separately simulated. Audio/graphics must respond to actual outcomes, not canned success.
4. **Control and safety:** Tap/drag and keyboard/mouse are supported, pointer cancellation releases controls, and pausing preserves a meaningful still image. Simulations are fixed-step, resource bounded, network free, and stoppable.
5. **Recoverability:** Saving a new experiment never destroys the source drawing or a previous saved rig. Returning to the design restores an editable plan rather than a flattened animation. The child explicitly chooses which rig becomes the active car.
6. **Profile privacy:** Every asset belongs to a child profile. Source and derivative data are local by default; switching profiles closes old editing surfaces and excludes old artwork from the new child's preview.
7. **Engagement:** After one successful action, the child should have a meaningful next choice: try again, move a part, change what it does, save a variant, or stop. No forced review form, lengthy jargon, or constant AI questions.

## First implementation, as built on this branch

- Existing local PNG/JPEG library, including photo capture and a direct touch/mouse sketch canvas.
- Bounded offline foreground and circular-contrast wheel proposals. These are *not* a general object-recognition model.
- Guided tablet editor with labels, shape outlines, component parenting, moves/resizes, cutout preview, and a save/test shelf.
- Separate transparent image layers rebuilt from the original without re-upload; connected-paper removal plus wheel cutouts. Photo lighting, overlapping pastel shapes and hidden anatomy remain known challenges.
- Car body and wheel outlines produce geometry used in the **real** Planck vehicle simulation, with independent wheel bodies, suspensions, collisions, braking and terrain. The cropped original art follows those physical bodies.
- Other drawing types instantiate bounded Planck multi-part bodies and role-derived joints in an interactive playground; full semantic game authoring is not complete.
- Studio exposes My Drawings; the owner explicitly approves a saved car rig for Rally.
- Tests: pure schema/physics checks and desktop/tablet end-to-end synthetic drawing journeys. Tests do not establish real child enjoyment, model recognition quality, or battery performance.

## Whole-picture animation

After drawing or importing a picture, choose **Make it move**. Tap Jump, Bounce, Spin, Dance, Left, Right, Float or Shake to play that movement immediately on the selected artwork. Each choice pairs a static movement cue with its label. Opening the editor, focusing a control or changing the pace while stopped keeps the drawing still, including when the device requests reduced motion. Path accepts a drawn stroke, individual taps or keyboard-operated spot buttons. A canceled stroke restores the previous path. Undo removes the most recent path change. Pace and World change the preview. Pause holds the current pose and Resume continues from it. **Bring its parts to life** opens the separate parts editor.

**Save animation** adds an immutable movement version to that picture. The version records the selected movement, duration, illustrated world, original or cutout representation and up to 32 path points. A second save links back to the selected parent. The same version travels with an art-library export and a scene-and-art export. A scene can change its own world, timing and blocks independently. The archived original remains available to earlier scenes.

The trusted scene engine and the animation editor sample the same position and rotation function. Whole-picture translation and rotation preserve the image proportions and alpha. Settings and path coordinates never rewrite the artwork. The editor opens the representation named in the shelf’s Movement version selector. Its preview uses an owner-checked, hash-verified local decode.

Local Chromium checks cover synthetic artwork on phone and desktop viewports. They exercise preview, pause/resume, pointer cancellation, path undo, exact-version recovery, export and the original-byte hash. Physical-device and child acceptance remain separate. [Desktop capture](evidence/connected-animation-desktop.png) · [Phone capture](evidence/connected-animation-phone.png)

## Moving individual parts

**Bring its parts to life** starts with the selected drawing. For a new selected-parts rig, the original paper and alpha remain visible until the child prepares the picture or changes a mask. Each visible mark belongs to one moving layer. Later pieces are picked first where pieces overlap. Erasing a pixel from the wing mask makes that pixel available to the body beneath it. Older saved rigs retain their existing extraction behavior.

During a parts test, wings, limbs and propellers use Planck motors. Wheels use suspension. Fixed parts follow their parent, and the child can pause and resume the simulation. A scene uses a single composite sprite in the saved pose. Whole-picture motion can move that sprite around the scene. [Butterfly test capture](../creative-universe/evidence/c-articulated-butterfly.png) · [Motion recording](../creative-universe/evidence/c-articulated-butterfly.webm)

## Artwork authorship

Jems preserves the child's hand, including asymmetry, unfinished outlines, unusual colors and imagined objects. Crop, turn, flip, scale and explicitly chosen paper removal can prepare a separate representation. Keep the original bytes and every referenced edition recoverable. Private images never go to a generative model for alteration, and a saved scene or game always resolves the edition its author selected. Professional environment art and an unaltered child drawing can share the same frame.

## Fidelity ladder: when a drawing is hard

**A. Automatic inference where justified:** Detect high-contrast shapes, isolated parts, and simple geometry. Disclose confidence qualitatively and show every layer.

**B. Assisted correction (primary fallback):** The child taps and outlines a component, renames it, declares its role and sees a live result. Preserve the most recent working version.

**C. Partial animation:** If a creature cannot be fully segmented, use the verified torso/limb components and label the remaining areas as attached art; offer another opportunity to refine.

**D. Single physical piece:** If all else fails, explicitly offer a single movable/collidable sprite. Do not claim it has working wheels, hinges or limbs.

**E. Approved template overlay:** Only after the child explicitly chooses an existing rig/template, use it as a convenient shortcut. Never silently substitute a template for the intended decomposed mechanics.

## Evaluation fixtures (not training material)

Use clean synthetic examples for deterministic testing: two-wheel car, three-part robot, winged creature, propeller gadget, landscape, and cluttered drawing. These do not validate recognition accuracy.

Next assemble a parent-consented, private sample of **30–50 different children's drawings** varying age, color, materials, perspective, clutter, overlap, and paper lighting. Do not log names, profile IDs or image bytes in public CI.

Record:
- Time from import to first functioning movement;
- Number of unwanted component guesses and corrections;
- Whether the child recognizes their own drawing;
- Whether the child independently figures out how to correct mistakes;
- Number and severity of confusing inputs, glitches or dead ends;
- Whether a changing joint, part or role causes the expected physical effect;
- Sustained browser frame intervals, input response, heat, and memory on the intended tablet;
- Whether the child voluntarily retries, improves or stops.

**Proposed, not validated, initial UX gates:** For clear, isolated drawings, aim to reach playable movement in under two minutes without adult intervention; the child can correct one bad component in fewer than four interactions. The team must measure and revise these targets.

## Boundaries and nonclaims

This release does NOT include universal segmentation of arbitrary drawings; a paid vision model; accurate inference of imaginary object semantics; missing-art reconstruction; full skeletal animation/mesh skinning; asset registry injection into arbitrary generated JavaScript; or measured efficacy with real children. Local art/rig and combined scene transfers are now implemented by the Art Studio contract.

A passing unit or browser test proves the stated behavior under its synthetic inputs, not perceived enjoyment or broad recognition accuracy. Running physics with a hand-marked joint is still a real, useful intermediate achievement; calling it full general intelligence would be misleading.

## Source precedents to revisit when advancing the work

- Meta Animated Drawings (2023): detected/segmented humanlike drawings and editable estimated joints, rather than a universal motion engine.
- Adobe Character Animator and Spine: structured art layers, skeletons, attachments and animation states.
- Scratch and OctoStudio: rapid child agency, sketches as creative material, low-barrier iteration.
- SAM and interactive segmentation: specialist model-assisted masks, with careful consideration of model hosting, privacy and device costs.
- Existing Family Game Factory: [part and rig validators](../../src/quality/parts.ts), [physics](../../src/quality/physics.ts), [drawing editor](../../src/drawing/lab.ts), [private drawing store](../../src/assets/private-drawings.ts).
