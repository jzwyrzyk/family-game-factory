# jems — web identity and product implementation

> **Current visual contract: owner-approved library v1.2.** Use [the library integration contract](LIBRARY_V1_2.md) and [ADR0009](../decisions/0009-approved-brand-library-v1-2.md) for the current identity, maker rank portraits and licensed fonts. PR33/PR34 notes below preserve earlier provenance. [Delivery state](../../DELIVERY-STATE.md) records application integration and validation separately; owner acceptance does not recertify the original traced SVG as a native vector master.

The selected public-facing brand is **jems** (lowercase), with a faceted **gem and central wrench** mark. The brand is intended for children who invent, reason, solve, make and play; parents should see confident STEM/creative problem-solving, not an AI toy that designs everything for the child.

## Approved color system
| Token | Hex | Function |
|---|---|---|
| Ink | `#0B1E3B` | headlines, body text, dark UI |
| Gem Blue | `#2E6BFF` | primary action, navigation emphasis |
| Spark Purple | `#8B5CF6` | imagination, active details |
| Build Mint | `#22D3A6` | building, successful progress |
| Idea Gold | `#FFC24D` | idea sparks, rewarding emphasis |
| Play Coral | `#FF5E7A` | playful accents, not alone for errors |
| Cloud | `#FFF7EE` | warm surfaces |
| Soft Lilac | `#E6D8FF` | surfaces, secondary emphasis |

Avoid using pastel colors as small text on white. Maintain readable navy text on mint, gold, coral, and Cloud. The approved v1.2 interface uses locally bundled, licensed **Nunito** for rounded headings and **Inter** for body/interface text, with system fallbacks and retained OFL notices. The logo remains its supplied outlined artwork and is never typeset in either font. The earlier guide's “Poppins Rounded” label did not supply an installable font; it is not the current interface font contract.

## Logo
`public/jems-mark.svg` and `public/jems-logo.svg` retain the supplied faceted gem/wrench layout and traced lowercase wordmark. The current approved revision removes only the specific three short rays above the gem; the single four-point wordmark sparkle, open-ended white wrench, facets, tagline and palette remain intact. Copy the current supplied variants exactly at their existing URLs, with the [identity lineage](art-library/identity/revision-manifest.json). These SVGs originated as reconstructed/traced implementations of raster references; the controlled edit does not change that provenance. Never regenerate, typeset, stretch, skew, recolor, filter or add shadows to the logo.

## Cross-surface implementation
- Homepage, returning-player strip, six Factory Favorites, game workspace, chat composer and version shelf.
- The [illustrated making journey](GEM_PROGRESS.md), cosmetic character picker and saved-progress popups; source and release status remain scoped to [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57).
- Parent Controls, My Powers, Math/Language Arts checkpoints, error/success notices, profile controls and optional offline update notification.
- PWA manifest, icon, document title/metadata and original legacy Arcade escape route.
- The shared approved SVG sprite supplies functional icons across existing host and game controls, with text labels, keyboard focus and dynamic states preserved. All five Gem companion poses and saved/build/reconnect spots follow the real state map in the library contract.
- Product messaging: **Create. Solve. Build. Play. Grow.** Child creates/decides; jems is a helper. **Send to jems** sends a typed message; **Speak** is the microphone action.
- CSS lives in `src/brand/jems.css`; existing physics and learning logic, isolation, storage keys and privacy gates remain unchanged.

## Release gates
1. Review the exact candidate against the owner-approved v1.2 art: current ray-free logo and retained sparkle, companion family, preserved factory artwork and original chosen-maker rank portraits. Keep historical source-board provenance distinct from current approval.
2. Desktop/mobile UI checks, keyboard/screen-reader, zoom and reduced motion.
3. All current Math, Language Arts, game, Studio, wait and safety regression suites must pass on the exact head.
4. Branding **does not** grant approval to publish the website, enable AI services, process private child data, or launch a public family service. Preserve existing P0/owner gates and a manual Pages deployment.

## Supporting artwork & semantic tokens
The brand extends beyond the header. [Library v1.2](LIBRARY_V1_2.md) supplies the current exact SVG identity, locally served Gem companion and factory artwork, functional icons, fonts and shared interface states. The unchanged native human/gem atlases retain their separate [artwork contract](achievement-art/README.md). Existing asset URLs and compatibility aliases remain stable; the documented ray removal is the only authorized identity geometry change.
- `jems-logo.svg` — approved-style gem + outlined lowercase wordmark lockup; `jems-wordmark.svg` is the isolated vector signature
- `jems-mark.svg`, `jems-mark-monochrome.svg`, `jems-mark-inverse.svg`, `jems-app-icon.svg` — colored mark, single-color, reversed and installed-app variants
- `jems-sparks.svg` — restrained gold/purple idea accents; `jems-blocks.svg` — modular makers' building pieces
- `jems-clouds.svg` — lilac ambient shapes for welcoming/empty states
- `jems-facets-pattern.svg` — optional colorful geometric facet motif (don't wallpaper the learning surface)
- `arcade-icon.svg` stays an alias for legacy references while using the same approved mark; the HTML explicitly declares `jems-mark.svg` as favicon and the PWA manifest prefers the dedicated square `jems-app-icon.svg` as its installable icon

Use **Ink** for readable copy, **Cloud/white** for most surfaces, **Soft Lilac** for softly selected sections, **Gem Blue/Purple** as accent identity, **Mint** for building/progress and **Gold** for limited sparks. Coral is a playful accent and must not serve as the only indicator of an error.

**Accessibility note:** Raw `#2E6BFF` with white text is approximately 4.50:1, marginal for small type. Do not rely on this minimum through gradients or antialiasing. The *palette remains unchanged*; the semantic `--jems-action-blue: #195FD0` is used for small white button text (~5.85:1) and `--jems-action-purple: #7136C9` is an accessible darker purple. Do not use light pastels as text on white.

### Where the identity is applied
| Experience | Brand expression | Intensity |
|---|---|---|
| Navigation and header | Exact mark/outlined lowercase wordmark, Ink, lilac selected pills | Low |
| Studio homepage | Cloud/lilac atmosphere, faint cloud/blocks/spark graphics, accessible blue→purple creation action | Medium |
| Six Factory Favorites | Distinct game art, quiet white frames, lilac hover/focus, readable Ink metadata | Low |
| Saved projects, versions, background builds | Mint continuity border, gentle facets, Ink build shelf, accessible statuses | Low |
| Making journey and character choice | Bright white page, four evolving character/gem stages, short labels and truthful earned/preview states | Illustrated hero; restrained controls and popup |
| Conversation/voice | Quiet Gem companion states, subtle lilac child bubbles and mint reflections; separate Send and Speak | Low |
| Math/Language Arts/My Powers | Blue or mint frame accents; purple selected controls; do not decorate the question text | Minimal |
| Grown-up controls, backups, privacy | Calm cream/white panels and clear focus/contrast, no cartoon takeover | Minimal |
| Legacy Arcade, favicon/PWA/offline | Same tokens, identity and mark with legacy behavior unchanged | Low |

**Non-negotiable restraint:** Graphics never obscure text, hijack input focus, displace playable game media, degrade 390px mobile first-action visibility, or animate while reduced-motion is requested. Branding must never claim educational mastery or model availability not supported by the product.

The making journey's **Gem Master** label describes saved creation cycles, not educational mastery. Both Spark and Nova have the same progression and are presented without gender labels. See the [evidence and UI contract](GEM_PROGRESS.md), [decision rationale](../decisions/0008-cosmetic-making-journey.md), and [review artwork](achievement-art/README.md) before changing those surfaces. Ordinary Math/Language questions and grown-up controls retain the calm treatments above.

## Historical source-guide lockups — PR #34

This list records the earlier source-guide implementation. The v1.2 contract above supersedes the old three-ray ornament and interface font setup while retaining the underlying identity and URL lineage.
- `public/jems-logo.svg`: traced lowercase gem/wrench lockup and **THE GAME FACTORY** subline.
- `public/jems-mark.svg` and `public/arcade-icon.svg`: faceted standalone gem with the open-ended white wrench and gold sparks.
- `public/jems-mono.svg`: dark silhouette with a **solid white** center wrench; not a transparent knockout.
- `public/jems-reversed.svg`: white-on-dark alternate logo.
- `public/jems-pattern.svg`: subtle gem/wrench/spark decoration, optional; do not cover controls or instructional text.

Exact source-guide palette: **Ink #0B1E3B, Jem Blue #2E6BFF, Spark #8B5CF6, Play #FF5E7A, Idea #FFC24D, Build #22D3A6**. The newer Jems 5 homepage, parent dashboard, subject navigation, saved projects, and Bubblegum v2 sticker game remain the baseline. The SVG assets are interpreted traces, **not yet certified master artwork**. The current integration requires rendered review against approved v1.2 and a fresh exact-head browser test run; the earlier image board remains historical evidence for unchanged identity elements.


### Legacy branding asset reconciliation (PR #34)
The original universal-brand rollout introduced useful supporting assets that must stay in use when this fidelity PR lands. The existing `jems-wordmark.svg`, `jems-facets-pattern.svg`, `jems-sparks.svg` and `jems-blocks.svg` now use the exact six-source-guide colors wherever those named swatches occur. The installable `jems-app-icon.svg` embeds the *same faceted gem and solid-white wrench* as the current `jems-mark.svg`, without external SVG/image dependencies. The compatibility `jems-mark-monochrome.svg` and `jems-mark-inverse.svg` retain their legacy URLs but now use a visible, opaque white center wrench rather than a transparent knockout. The PWA manifest and HTML theme-color use Ink `#0B1E3B`.

The retained Jems 5 homepage, saved games and parent-learning experiences and Bubblegum sticker game are the required integration baseline. These asset updates do **not** authorize activation of child-facing model services, user tracking, or a public rollout; current approved-art rendering and final exact-head CI remain review gates.
