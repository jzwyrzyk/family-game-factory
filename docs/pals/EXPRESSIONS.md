# Approved Gem Pal expressions

**Contract recorded:** November 20, 2026. **Decision:** [versioned expressions and a bounded motion pilot](../decisions/2026-11-20-pal-expression-runtime.md). This document describes the approved asset set, implemented presentation components and their acceptance boundaries. [Delivery state](../../DELIVERY-STATE.md) records actual integration checks, merge and deployment separately.

## Scope and exact artwork

The original **23 profiles** have **184 approved images**: 46 neutral masters and 138 expressions. Each profile has Base and Grown, with the following four presentation states in each form. The [existing character index](art/character-references.json) remains the source for selected art, original identities, approval scope and retained history; the [art reference entry point](art/README.md) provides the current visual crosswalk.

| State key | Panel label | Artwork |
| --- | --- | --- |
| `neutral` | Ready | That form's approved neutral master |
| `celebrate` | Celebrate | Approved Celebrate expression |
| `thinking` | Think | Approved Thinking expression |
| `encouraging_retry` | Try again | Approved Encouraging retry expression |

The runtime form keys remain `base` and `mature`; **Grown** is the display name of `mature`. Source-kit `initial` maps to `base` and `growth` maps to `mature`. An expression is temporary presentation, not another growth form or an inference about a child's feelings or ability.

The active manifest preserves 21 established `characterKey` values and existing nullable `speciesId` values. It does not map names or slugs onto the saved `glim`, `kip` or `riff` collection identities. F1 Navi and F2 Mote remain separate profiles. Brio is outside this manifest: his two neutral masters are approved, while his six expressions still have their separate review status. Adding him requires a separately complete expression scope and explicit asset-version update, not an alias to another character.

## Lossless exports and manifest binding

[`public/jems-pals/manifest.json`](../../public/jems-pals/manifest.json) has `schemaVersion: 1`, `assetVersion: "core-2026-11-20"` and scope `active-core-21`. Its SHA-256 is `5687280e359074dcf5d665ac27822dcefb63478cae8ee393a83d53a22d796e64`. Source artwork is selected package 2.9; the runtime asset version and individual art revisions are separate identifiers.

| Historical original-23 export | Bytes |
| --- | ---: |
| Original 184 PNG sources | 312,373,555 |
| 184 lossless WebP images | 207,077,748 |
| Image bytes saved | 105,295,807 |
| Manifest | 144,160 |
| WebP images plus manifest | 207,221,908 |

The WebP images reduce source image bytes by **33.7083%**; that percentage excludes the manifest. The [exporter](../../scripts/export-pal-assets.py) preserves the complete native dimensions and decoded RGBA pixels, including RGB beneath fully transparent pixels. It uses lossless WebP with `exact=True` and compares the source and exported pixel buffers before registering an image. It does not crop, resize, repaint, composite or remove the approved background. The byte-reproducible encoder pins are Pillow 13.0.0 and libwebp 1.6.0; other encoder versions can produce different encoded bytes.

Each asset records its form, expression, source PNG SHA-256, exported WebP SHA-256, native width and height, alpha flag, decoded RGBA SHA-256, pixel-parity result and byte counts. URLs are bundled relative paths of the form `jems-pals/<slug>/<base|mature>/<state>-<source-hash-prefix>.webp`; the filename uses the first 12 source-hash characters and the manifest retains the full hash. The filename spelling for `encouraging_retry` is `encouraging-retry`.

[`artwork.ts`](../../src/pals/artwork.ts) validates the expected version, declared counts, unique identities/slugs/URLs, two forms, recognized states, required neutral references and form/state/path consistency before creating an immutable resolver. Unknown characters, invalid forms or states, ambiguous keys and incompatible versions fail closed. The shipped-manifest verifier additionally enforces the active-core-21 identity allowlist and all 168 slots.

Hash-shaped declarations and filename bindings are checked at runtime; [the asset verifier](../../scripts/verify-pal-assets.mjs) checks the actual committed image bytes and lossless WebP containers. The browser does not re-hash every downloaded image. Public manifest fields are allowlisted; source-account identifiers, private approval text and workspace paths do not belong in the runtime bundle.

## Loading, selection and fallback

[`approved-artwork.ts`](../../src/pals/approved-artwork.ts) loads manifest metadata on demand, using the application's base URI and the plain allowlisted `jems-pals/manifest.json` path. The resolver validates the asset version inside the file; no query-string exception is needed for offline lookup. An eight-second timeout bounds the manifest request. A successful validated resolver is shared in memory, while an unsuccessful request can be retried explicitly. Loading the manifest does not preload the 184 pictures.

[`artwork-view.ts`](../../src/pals/artwork-view.ts) loads and decodes only selected images. Its per-view prepared-image cache holds at most four states and clears with the character/form/owner context or hidden frame. Pictures retain full framing through `object-fit: contain`. Display scaling is separate from the unchanged native export pixels.

The [versioned offline shell](../../tools/offline-build.ts) precaches the small manifest, but excludes every Gem Pal WebP from installation downloads. All 168 active image paths and four historical scene neutrals remain in its same-origin allowlist and are cached only when requested successfully. Previously viewed images can then be reused from that cache offline; unseen images are not promised offline availability. A cold image failure follows the same own-form neutral fallback or unavailable-state rules. The application still opens the explorer intentionally; offline metadata preparation does not preload its pictures or select a character.

The resolver and [expression controller](../../src/pals/expressions.ts) keep fallback within the **same character and same form**:

1. A recognized expression omitted from an otherwise valid manifest resolves to that form's required neutral. The shipped active-core-21 manifest has all four states; this fallback also supports a bounded partial-state contract.
2. If a requested expression fails to load or decode, or reaches its load timeout, the controller tries that form's exact neutral once.
3. If the neutral also fails, the state becomes `unavailable`. The view clears the image and shows **Picture unavailable** with an explicit loading retry in the panel. It never borrows another character, the other form or a previous owner's picture.

The default image load/decode timeout is five seconds per attempt, including a separate neutral-fallback attempt when needed. Configured timeouts are bounded to 100–15,000 ms. The state retains the requested expression and fallback/failure reason even when the displayed result is neutral.

## Transient state and trusted events

The controller context is a host-supplied `scope`, exact `characterKey` and form. The host must capture the current owner/namespace and update or dispose the context when that ownership boundary changes; the art component does not discover profiles itself.

Each request invalidates older work with an epoch and abort signal. A late load or decode cannot publish into a newer character, form or scope, even if its loader ignores cancellation. Hiding, resetting or disposing cancels pending loads and reaction timers. Returning from hidden presentation starts at neutral; it does not replay a hidden reaction. A passive refresh with the same context preserves a manually selected expression.

| API or trigger | Result | Current integration |
| --- | --- | --- |
| `preview(state)` | Selects the requested approved state until another explicit selection/reset/context change | Used by Ready, Celebrate, Think and Try again controls |
| `explicit-celebrate`, `explicit-think`, `explicit-retry` | Bounded Celebrate, Thinking or Encouraging retry reaction | Allowed controller API for trusted UI callers |
| `saved-success` | Bounded Celebrate reaction after an eligible durable save | Trusted-host contract; exercised with a synthetic component trigger, not wired to earned collection events |
| `growth` | Bounded Celebrate reaction for a new eligible growth transition | Trusted-host contract; automatic application dispatch remains separate |

`react()` defaults to a 1,600 ms hold, bounded to 250–5,000 ms. The hold starts after successful image decode; expiry requests neutral. A manual preview cancels an earlier reaction's expiry. Unknown triggers are rejected. Preview selections have no automatic reaction timer.

Future saved-success or growth callers must use existing trusted, durably saved host outcomes and the current owner scope. They must respect visibility/encouragement settings and existing receipt rules. Refresh, restore or an already-grown record must not manufacture a new growth reaction. No generated-game message gains reaction, ownership or reward authority through this API.

These modules do not persist mood or preview selections, change collection ownership, equip a Pal, grant gems, alter learning evidence, mutate a scene or contact a model provider. Expressions and reduced-motion preferences change presentation only.

## Current My Pals entry point

The [approved-collection decision](../decisions/2026-11-21-approved-pal-collection.md) supersedes the separate top-level roster preview. [`createPalsPage`](../../src/pals/ui.ts) now shows real starter and collection portraits using the small generated lookup. The selected owned Pal has optional **Try expressions** controls, bound to its exact character and earned Base/Grown form. These controls cannot choose a different creature, preview an unearned form, equip, collect, award or save a scene.

Collection portraits load native approved images on demand, retain complete framing, and fall back only to the same character's same-form neutral if a reaction fails. A missing neutral shows **Picture unavailable** with an explicit retry on the detail surface. Brio uses his two separately approved neutral masters; no unreviewed expression is introduced. Profile changes clear the transient selection and reaction, hiding/disposal cancels reaction timers, and ordinary reactions neither take focus nor play audio. A temporary visual response must never be evidence for a receipt or growth.

The My Pals page retains each current portrait by owner, gallery/detail surface, Pal and Base/Grown form. An ordinary saving, progress or collection refresh that still requests the same URL reuses that image and its current loading, ready or unavailable state; it does not assign the source again. The page retains only the current render's 24 gallery portraits and optional detail, with distinct lazy gallery and eager detail images. A selection/form change retires only the portraits it replaces; an unavailable owner/profile view or disposal retires all of them. Retirement clears load handlers and deadlines and invalidates later callbacks. It cannot cancel a native decode that has already begun. The home widget, cameo and transient notices are outside this page-local reuse scope.

Native `image.decode()` remains required before a newly loaded portrait becomes ready. Retained failures do not automatically retry during refresh or hide/show: **Retry picture** on an owned detail uses the existing loader, and a full document reload starts fresh gallery images. Retrying a detail does not silently retry its separate gallery image. A hidden, still-current portrait may finish decoding without taking focus; reopening resets optional expression play. Retry controls are recreated with each detail, reflect an already-unavailable retained portrait immediately, and preserve a focused in-progress retry across ordinary renders. No longer deadline, cross-owner reuse, replacement artwork or success inferred from natural dimensions is introduced.

The original resolver/controller/view and standalone explorer remain reusable isolated presentation components with their active 21-profile/168-image contract and dedicated fixture tests. The main collection uses generated manifest-derived bindings for synchronous cards and scene asset registration. `scripts/generate-pal-catalog.mjs --check` verifies those bindings against the approved records and supplemental Brio bytes.

## Wink Base motion pilot

The first pilot is opt-in and restricted to **Wink Base**, `first-round-2026-11-19/R` plus `base`. When changing between successfully decoded images, the view can fade the incoming unchanged illustration over **180 ms** with `ease-out`. Initial load and every other character/form use direct image presentation.

This is a finite opacity transition. It does not deform a face or gem, move a joint, generate intermediate artwork, establish pose registration or provide an articulated rig. Context changes, hiding and disposal clear transition layers. A live change to `prefers-reduced-motion: reduce` cancels the pilot immediately; subsequent selections still show the requested expression without animation. If the animation API is unavailable, the image changes directly.

## Source constraints retained

- Navi Base uses the corrected **R2** neutral with one faceless floating violet focus gem and its three R2 expressions. The gemless source is superseded. The runtime test binds the corrected neutral SHA rather than inferring identity from the name.
- Mote Base's neutral remains **125×145** pixels. Higher-resolution expression art does not recover a higher-resolution neutral or verify missing fine-facet detail. Its approvals remain settled; larger display treatment is a production-quality issue.
- Tumble Base expressions remain the approved **R4** transparent corrections. Existing opaque scenes and alpha cutouts retain their selected treatment.
- Full-frame image containment preserves props and silhouettes; it does not guarantee common contact anchors or subject alignment between independently approved illustrations. Broader motion needs its own production and acceptance work.

## Validation and acceptance

| Command | Scope |
| --- | --- |
| `npm run test:pals-assets` | Active core schema/identity allowlist, all 168 files and hashes, lossless container/dimension/alpha checks, privacy-field rejection and invalid-reference cases |
| `npm run test:pals-expressions` | Resolver selection, own-form fallback, immutable snapshots, stale-request cancellation, timeout/retry, owner-scope changes, reaction expiry, visibility and disposal |
| `npm run test:pals-expressions-browser` | Real manifest and decoded production images in a component fixture; base-path/lazy loading, controls, failures, late requests, reduced motion, focus, complete framing and 320/390/768 px layouts |
| `npm run test:pals` and `npm run test:pals-browser` | Existing companion regressions plus the registered expression checks |
| `node tests/offline-shell.cjs` after a production build | Built service-worker allowlists, no Gem Pal images in installation precache, plain manifest availability and exact-byte offline reuse of an already viewed image |

The component browser fixture uses synthetic selections and host triggers. It does not establish actual earning, a merged full-roster gallery, physical-device/child acceptance or a live deployment. The My Pals mount requires its own application journey evidence in [delivery state](../../DELIVERY-STATE.md), including intentional opening, owner changes, hide/reopen, loading failures and preservation of existing collection behavior.

Default asset verification checks committed bytes, lossless headers and recorded pixel digests. For a fresh decode against the recorded pixel hashes, run `node scripts/verify-pal-assets.mjs --pixels`. With the approved source kit available, `node scripts/verify-pal-assets.mjs --source-kit "$PAL_SOURCE_KIT"` also compares all original PNGs directly. `PAL_ASSET_PYTHON` can select the Python/Pillow runtime. Detailed source audits stay outside `public/`.

Keep art approval, byte/pixel verification, component behavior, application acceptance, merge and deployment as separate recorded results. The [two-form compatibility decision](../decisions/0013-two-form-pals-and-current-main.md) continues to govern earned progress and saved history.


Portrait decode now includes the same [Pal alpha preparation](../creation-studio/PAL_SCENE_RENDERING.md)
as the scene renderer before a state becomes ready. The exact approved asset,
same-form neutral fallback, owner/context cancellation and bounded cache remain
authoritative. Missing/unreadable preparation uses Picture unavailable and the
existing explicit retry; an opaque original is not shown as a successful fallback.

The learning workspace subscribes to the Pal host for the current owner's selected portrait. Neutral, thinking, encouraging retry and celebration reuse the existing expression resolver and earned form. The host observes the companion and encouragement preferences. Its hint action uses the subject's existing assistance pathway.
