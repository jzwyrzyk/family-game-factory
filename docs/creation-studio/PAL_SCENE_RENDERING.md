# Shared Pal picture rendering

The November 22, 2026 learner-interface request identifies the cream rectangles
around approved Pal pictures as a scene-rendering defect. The approved artwork
catalogue intentionally preserves its original backgrounds; a lossless export
does not turn every portrait into a transparent sprite.

## Rendering contract

The November 25 Android review extends this mechanism to every Pal presentation.
`src/pals/presentation-image.ts` owns the shared preparation used by `CreationStage`,
collection/Journey/host portraits, expression previews and Creative Studio choices.
The scene module retains compatibility exports only. The shared helper samples
pale, consistent border paper and removes
only connected paper regions. It does not tint the character to match a scene.
An explicit source-filename map opens visually checked enclosed negative spaces
in reviewed neutral and expression compositions, such as Tumble's tail loop and Whorl's gem ring. These inner
regions use a stricter threshold to protect pale hands and facial details. A
different artwork filename receives no inherited interior seeds. Already transparent
expressions may still have opaque paper inside a loop; only their exact reviewed
seeds open those holes. Pale eyes, gem facets, cheeks and ground stay intact.

The full approved composition and aspect ratio remain intact, including Luma's
beam and receiver, deliberate floating gems, water, foliage and other props.
Existing image alpha is retained. The original files, approved-source hashes,
catalogue paths, scene actor IDs, form keys and saved-scene references do not
change. Historical gem-token scenes, private child artwork and non-Pal scene
images bypass this renderer. DOM portraits retain the exact approved source URL
and use the prepared alpha as a contain-sized image mask; scenes draw the same
prepared canvas. This is alpha removal, not blend mode, background matching or
cropping. Image visibility waits for decode and mask preparation, preventing an
opaque first frame. Expression fallback remains the same character and form.

Preparation is bounded to a canvas with a maximum edge of 768 pixels. Prepared
images are cached only for active scene assets and are retired when the scene is
cleared or the asset is removed. Stale source callbacks cannot recreate a cleared
scene. If a canvas cannot be read, the existing picture-unavailable/retry path is used;
the renderer never exposes opaque source paper as a successful fallback and does
not substitute another character or lose the saved reference.

Playback and clip export await `CreationStage.prepare` before starting. The
method shares the renderer's cache and waits for every bundled image to load,
decode and prepare, including hidden actors that a later Show block can reveal.
A pending image has an eight-second timeout; failure names the affected asset
and asks the learner to reopen the scene. The settled cache does not retry every
frame. Clearing a scene cancels pending waits and retires callbacks; a current
scene/player check prevents an obsolete playback request from starting after a
load completes. Private artwork retains its separate owner-checked resolver.

## Evidence and limits

The historical November 22 scene-only inventory contained 48 neutral pictures: 46 from the original-23
manifest and two Brio neutrals. Forty-two are wholly opaque. Of the other six,
Navi Base is already isolated; the remaining five have partial alpha alongside
opaque paper. All 48 were exercised through the actual helper and visually
inspected on dark navy and meadow-green surfaces. Forty-seven received a
temporary composite; Navi Base retained its existing alpha. The reviewed
negative spaces no longer form large cream holes in their characters.

The [inventory result](evidence/learner-pals/inspection.json) and four rendered
comparison sheets retain the observed evidence: [Luma–Mote](evidence/learner-pals/pal-scene-composite-1.png),
[Sivo–Skiff](evidence/learner-pals/pal-scene-composite-2.png),
[Peep–Poff](evidence/learner-pals/pal-scene-composite-3.png), and
[Chimi–Brio](evidence/learner-pals/pal-scene-composite-4.png). These images run the
actual helper through a local Canvas-compatible renderer; they are not browser
screenshots. Recorded timings describe that local run only.

The inventory and rendered comparison are engineering and visual checks, not
physical-device or child-use acceptance. The source art's depicted ground,
contact shadows and props remain, and existing fine edge artifacts in the Navi
Base source are not redesigned. This conservative scene support does not claim
that every source has become a professionally rematted, portable sprite.

The [November 25 fidelity correction](../evidence/child-modernization/pal-fidelity/README.md)
records the broader DOM/offline audit separately from this earlier scene receipt.

Focused tests cover closed highlights, color preservation, props and beams,
partial/existing alpha, conservative border rejection, explicit interior seeds,
bounded preparation, fallback, cache reuse, stale callbacks and existing scene
identity/save/Keep compatibility. Playback readiness tests additionally cover
shared loads, hidden actors, decode failure, scene cancellation and the bounded
timeout. Final browser and combined-source evidence is recorded separately in
`DELIVERY-STATE.md`.
