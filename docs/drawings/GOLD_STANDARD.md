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

## Finding and using the same artwork

The trusted host builds its picker from the current player's existing picture catalog and movement revisions. Every derived image traces to the root picture through an owner-checked parent ID and SHA-256. A maker can give the whole family of versions an optional subject such as “rock” or “moon pebble”. The maker can name and categorize individual pictures and search by name or subject.

The picker offers original pictures, edited pictures and each saved design. The selected ID and digest travel with the scene. In Scene settings under More tools, **Choose art version** changes that actor's artwork and preserves its blocks, position and role. Earlier saved revisions retain their existing selection. A role such as decoration, obstacle or collectible describes that particular actor. Its behavior comes from the scene program. Archiving a picture removes it from new selections and leaves saved references usable. Exact restore reconnects compatible references, while an explicit import makes a new owner-scoped copy.

## First implementation, as built on this branch

- Existing local PNG/JPEG library, including photo capture and a direct touch/mouse sketch canvas.
- Bounded offline foreground and circular-contrast wheel proposals. These are *not* a general object-recognition model.
- Guided tablet editor with labels, shape outlines, component parenting, moves/resizes, cutout preview, and a save/test shelf.
- Separate transparent image layers rebuilt from the original without re-upload; connected-paper removal plus wheel cutouts. Photo lighting, overlapping pastel shapes and hidden anatomy remain known challenges.
- Car body and wheel outlines produce geometry used in the **real** Planck vehicle simulation, with independent wheel bodies, suspensions, collisions, braking and terrain. The cropped original art follows those physical bodies.
- Other drawing types instantiate bounded Planck multi-part bodies and role-derived joints in an interactive playground; full semantic game authoring is not complete.
- Studio exposes My Drawings; the owner explicitly approves a saved car rig for Rally.
- Tests: pure schema/physics checks and desktop/tablet end-to-end synthetic drawing journeys. Tests do not establish real child enjoyment, model recognition quality, or battery performance.

## Draw a path

Choose a picture or a saved movement version in **My Art**, then **Draw a path**. Tap stops, drag a route, or aim with the arrow keys and press Enter. The child can undo, choose a speed and preview before saving. The editor accepts 2–16 stops. Whole pictures retain their original pixels, including paper and transparency. A selected cutout uses that exact version’s existing masks.

**Save path** adds an immutable movement revision to the same private art store. Its assembly hash covers the stops, timing, sprite choice and source-image fingerprint. A later path version links to its parent. A full art library backup retains drafts and all movement versions. A combined scene file includes the selected pictures and movement versions with their ancestors. Unused drafts and sibling versions stay in My Art. Complete adult-workspace transfer remaps the scene’s source-art history alongside its actor and world pins. My Art and the Creative Studio picker can explicitly select an older version.

Adding the path to a scene places the actor at the first stop and creates ordinary editable Move blocks for the remaining stops. Playback uses the existing scene engine. Changing the scene’s blocks affects that scene alone. Drawing a path on a picture assigns no physics body. Existing physical joints on an explicitly chosen rig remain available to the movement playground. Opening the saved design in the pieces editor allows a child to make a new cutout version. Whole-sprite path animation and the existing articulated physics playground have different controls. This flow records no learning result and needs no model service.

The selected-original reader verifies the stored bytes against their SHA-256 before a drawing opens in a scene, animation, or Rally. The catalog reads lightweight metadata. In the prepared storage preview, My Art counts uses from the active game and scene histories, including private backdrops. Production continues to use its existing local histories.

### Scene-local paths under review

The separate Creative Studio composer in PR #201 at `e1b67c17fa3c2ff103b221173cf476ac82d09206` writes a named Repeat group with up to 24 relative Move blocks and per-step durations. Its kept-scene chooser copies that group into an actor’s selected script. The scene engine in this branch executes those relative moves and repeats. Its validator rejects the additional `pathName` property. The PR #201 validators also predate the private rig’s `motion` field and the scene’s `world` field. A combined release needs a reviewed schema change and round-trip coverage for named groups, immutable art references and worlds. Stripping a path name would lose the child’s saved name and the source composer’s reuse eligibility. [PR #201](https://github.com/jzwyrzyk/family-game-factory/pull/201)

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
