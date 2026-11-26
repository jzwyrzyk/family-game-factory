# Creative Asset & World Design Standard

Accepted November 26, 2026, for My Art, Creative Studio, movement design and new 2D games. This standard defines the product contract. Each feature PR records the surfaces and versions it actually implements.

## The drawing is finished art

Keep every accepted source byte for byte. Preserve its SHA-256, owner and a recoverable original representation. Keep editable strokes when the drawing tool supplies them. Drawings made on paper, photographs and flattened imports can be finished art without editable strokes. Give each saved edit a distinct revision and bind it to its source. Keep render previews and lossless or bounded compressed sprites separate from the original.

The prohibition on generative alteration is permanent. Private art, partial cutouts and captures containing private art must stay out of generative image, coaching, repair and visual-review inputs. Never redraw, beautify, reinterpret, match an environment's style, synthesize missing parts or offer a stock replacement under the child's name. A hand-drawn rock belongs in an illustrated workshop with all its original lines.

Let the child explicitly crop, turn, scale, flip, remove paper or edit a component mask. Conservative deterministic smoothing requires a separate, initially off control, a preview, a way to undo and a new derivative on save. Record provenance of Jems-supplied scenery independently of child-authored artwork.

## Identity, versions and use

| Question | Authority and rule |
| --- | --- |
| Whose rock is it? | Resolve within the active profile and family origin. The source drawing and its validated ancestry define owner-local identity. Possession of an ID or digest grants no access. |
| What is it called? | The child can give the asset a display name such as “My moon rock”, a semantic name such as “rock”, and an optional broad category. Imaginative and unnamed drawings work immediately. |
| Which artwork was chosen? | A scene pins the selected image ID and SHA-256, or the selected rig ID and validated assembly digest. A rig pins its source image revision and digest. Verify references at use and restoration. |
| How is it used here? | The scene owns each placement, actor program, backdrop and decoration. A game owns the explicit obstacle, collectible or vehicle contract. Naming a rock never assigns a collider, gravity or points. |
| What if I change it later? | Archive preserves historical uses. A new picture or motion is a separate version. Updating a use requires explicit selection and a new scene or game revision. A missing version offers recovery. |

The existing private drawings database, scene workspace, generated companion and native saved-game authorities own their respective records. Extend their existing storage, reference remapping, backup, capacity and deletion checks. Concurrent saves and restores must preserve profile isolation and immutable history. Any incompatible new field needs a forward and rollback reader plan before release. A cached catalog and a thumbnail can be rebuilt. Read drafts, revisions and retained projects before erasure. An empty usage index cannot establish that deletion is safe. Inspect derivative ancestry and rig dependencies under the existing writer lock.

## Drawing, movement and continuation

A child can go from saving or importing a drawing to seeing it move, choose the action and pause it. Whole-image animation translates or rotates the drawing as one sprite. Coded movement runs an editable actor program in the scene interpreter. Articulated motion needs independently selected pixels, pivots, joints and an applicable simulator. Give these modes distinct names in the interface. A moving sprite is insufficient evidence of working wheels, flapping wings or a usable physical game adapter.

Offer manual parts, masks and placement corrections when a guess misses. Show initial simple actions, reveal advanced geometry on request and keep the original available throughout. A saved design can return to My Art, enter Creative Studio or enter a specifically compatible game. Preserve the selected profile, version, world and existing save/learning guards on these transitions.

Give the canvas and its palette priority on the drawing surface. Preserve a failed Keep for retry and honor pointer cancellation on mouse, pen and touch. Reopening a flattened picture must never invent editable marks.

For young children, begin with visible movement choices and a single playback action. Use the current Jems label sizes, focus order, contrast and touch targets. Provide keyboard alternatives to path and part placement. A cancelled pointer must discard the unfinished gesture. Pause, reduced motion, profile change and dismissal must stop unsolicited playback. Use the existing grade and parent supervision policies. Scratchpad marks from Math or English remain transient unless a future, separately designed explicit Keep journey is accepted. [Child interface](../brand/CHILD_INTERFACE.md)

## Worlds and 2D mechanics

New development uses 2D sprites, layered environments and compatible physics. Artwork, light, shadows and parallax can supply depth. Preserve legacy readers, retained games and historical staging. Introduce no 3D asset conversion. Pin illustrated world editions so later scenery changes cannot silently redesign a saved adventure. Review the rendered activity with the actor visible at phone and tablet sizes. Use approved Jems environment art or new Jems-specific illustrations created independently of private work. Keep controls, text and interactive subjects readable against the actual plate. [Game presentation](../game-intelligence/PRESENTATION-QUALITY.md) · [Brand library](../brand/LIBRARY_V1_2.md)

## Generated games and privacy

1. The trusted host checks the active owner, exact chosen image or design, digest, consent and intended game use. Read only that version. Stop if the owner changes or the digest fails.
2. Generated content may request only reviewed bounded gameplay operations. Keep image records, owner IDs, unrestricted URLs, storage handles, bytes and host credentials out of generated code. Prefer a trusted renderer that composites a selected sprite after receiving validated positions.
3. Keep private art out of model calls, build payloads, gameplay-review captures, logs and worker artifacts. An offline review build can qualify a named adapter with synthetic marks. Scope any future grant to one game revision, slot and session. Bound its lifetime and revoke it on a profile or consent change. A generated companion customized in the trusted editor and an executable generated game are separate destinations.
4. General asset delivery stays closed until independent security review, isolation and revocation tests, exact-source hosted qualification and release approval. Exact reviewed-family PNG admission remains subject to the adult, operator, device and family gates. [Family privacy](../family-beta/PRIVACY.md) · [Premium pilot](../game-intelligence/premium-benchmark/ARTWORK-PILOT.md)

## Ownership and release evidence

| Work | Shared module owner | Required integration evidence |
| --- | --- | --- |
| A and D | My Art owns originals, editable source, logical identity, revisions, metadata projections and picker. Storage maintainer owns compatibility and recovery decisions with My Art. | Original hash after editing, archive, history, cross-profile denial and backup round trip. |
| B and F | Creative Studio owns versioned world art, scene settings, layered placement and scene reference enumeration. | Actual rendered worlds, older scene playback, pins for decorations and backgrounds, save/load and reference remapping. |
| C | Movement editor owns the design and pose evaluator. Scene interpreter owns fixed-clock playback. Drawing Lab owns segmentation, masks, constraints and supported real mechanics. | Immediate motion, scene continuation, pause/resume and cancel, manual correction, version selection, representative synthetic drawing playback. |
| E | Game host owns explicit adapters and trust checks. Security and release owners independently qualify any future change to general delivery. | A named playable example, preserved game behavior, an isolated generated realm, and confirmation of disabled production delivery. |

For each change record its PR and dependencies, exact head, reproducible tests, screenshots and motion capture where relevant. Record what passed locally, hosted checks and private preview identity, TEST acceptance, production state and external family activation separately. Use synthetic work in public artifacts. Existing parent reports, learning evidence, reward receipts, earned Pals and prior histories retain their own authorities. [Delivery governance](../development/DEV-TEST-PROD.md)

The owner of a new reference kind updates validators, renderers, authoritative usage checks, backup/restore, copy/remap and the destination matrix together. The storage maintainer reviews migrations and rollback compatibility. Integration review covers overlapping files and stacked PR heads before release.

## Acceptance and extension

Exercise a synthetic hand-drawn rock, a character, a vehicle and a world. Name and revise them, select exact versions across activities, change roles, archive, restore and switch profiles. Compare original bytes and hashes following recovery. Check visible pixels, editor return, keyboard and touch input, missing versions and failed writes. Inspect a live game outcome as well as its artwork. Keep local implementation, offline evidence, hosted qualification, production deployment and family activation separately evidenced.

Related contracts cover detailed [Art Studio behavior](../drawings/ART_STUDIO.md), [scene authoring](../creation-studio/README.md), [private family storage](../family-beta/ARCHITECTURE.md), [child interface](../brand/CHILD_INTERFACE.md), and [game generation](../game-intelligence/PREMIUM-BUILDER.md).

The first illustrated collection has four versioned stages with aligned overlays and individually selectable transparent objects. Every published revision retains its old catalogue ID and pixels. [Art briefs, manifest and approval status](../creation-studio/WORLD_ART.md)
