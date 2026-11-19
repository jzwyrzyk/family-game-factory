# jems — web identity and product implementation

> **Brand contract with historical review notes.** PR #33/#34 draft, merge and release wording below records those reviews. Use [DELIVERY-STATE.md](../../DELIVERY-STATE.md) for current integration and deployment evidence. Preserve the documented visual identity and asset-certification limits; code merge is not proof of final master-art approval.

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

Avoid using pastel colors as small text on white. Maintain readable navy text on mint, gold, coral, and cloud. The approved style guide calls the display family “Poppins Rounded (Bold)”, but the supplied portfolio did not include an installable licensed font. The **logo wordmark is outlined from the approved reference**; ordinary headings use a rounded system fallback rather than downloading unlicensed fonts. Interface text uses an Inter-like system stack.

## Logo
`public/jems-mark.svg` and `public/jems-logo.svg` are scalable SVG implementations of the *approved* faceted-gem/wrench layout. The approved brand portfolio is raster artwork, so the mark is an independently reconstructed faceted SVG with an **open-ended white wrench** (not a keyhole) and the lowercase wordmark is an SVG vector trace of the approved board. Logo, standalone wordmark and inverse variants are scalable; visual owner approval is still required before certification as final production masters. Never stretch, skew, recolor or apply shadows to the logo.

## Cross-surface implementation
- Homepage, returning-player strip, six Factory Favorites, game workspace, chat composer and version shelf.
- The [illustrated making journey](GEM_PROGRESS.md), cosmetic character picker and saved-progress popups; source and release status remain scoped to [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57).
- Parent Controls, My Powers, Math/Language Arts checkpoints, error/success notices, profile controls and optional offline update notification.
- PWA manifest, icon, document title/metadata and original legacy Arcade escape route.
- Product messaging: **Create. Solve. Build. Play. Grow.** Child creates/decides; jems is a helper. **Send to jems** sends a typed message; **Speak** is the microphone action.
- CSS lives in `src/brand/jems.css`; existing physics and learning logic, isolation, storage keys and privacy gates remain unchanged.

## Release gates
1. Visual parity review against the approved 9-image brand portfolio, especially final vector logo and custom wordmark typography.
2. Desktop/mobile UI checks, keyboard/screen-reader, zoom and reduced motion.
3. All current Math, Language Arts, game, Studio, wait and safety regression suites must pass on the exact head.
4. Branding **does not** grant approval to publish the website, enable AI services, process private child data, or launch a public family service. Preserve existing P0/owner gates and a manual Pages deployment.

## Supporting artwork & semantic tokens
The brand extends well beyond the header. The established marks and decorative assets in this list are locally served SVGs, without CDNs, font trackers, or external network dependencies. The newer making journey uses the separate [WebP artwork contract](achievement-art/README.md) and does not replace these identity assets:
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
| Conversation/voice | Faceted helper badge, subtle lilac child bubbles and mint reflections; separate Send and Speak | Low |
| Math/Language Arts/My Powers | Blue or mint frame accents; purple selected controls; do not decorate the question text | Minimal |
| Grown-up controls, backups, privacy | Calm cream/white panels and clear focus/contrast, no cartoon takeover | Minimal |
| Legacy Arcade, favicon/PWA/offline | Same tokens, identity and mark with legacy behavior unchanged | Low |

**Non-negotiable restraint:** Graphics never obscure text, hijack input focus, displace playable game media, degrade 390px mobile first-action visibility, or animate while reduced-motion is requested. Branding must never claim educational mastery or model availability not supported by the product.

The making journey's **Gem Master** label describes saved creation cycles, not educational mastery. Both Spark and Nova have the same progression and are presented without gender labels. See the [evidence and UI contract](GEM_PROGRESS.md), [decision rationale](../decisions/0005-cosmetic-making-journey.md), and [review artwork](achievement-art/README.md) before changing those surfaces. Ordinary Math/Language questions and grown-up controls retain the calm treatments above.

## Additional source-guide lockups — PR #34
- `public/jems-logo.svg`: traced lowercase gem/wrench lockup and **THE GAME FACTORY** subline.
- `public/jems-mark.svg` and `public/arcade-icon.svg`: faceted standalone gem with the open-ended white wrench and gold sparks.
- `public/jems-mono.svg`: dark silhouette with a **solid white** center wrench; not a transparent knockout.
- `public/jems-reversed.svg`: white-on-dark alternate logo.
- `public/jems-pattern.svg`: subtle gem/wrench/spark decoration, optional; do not cover controls or instructional text.

Exact source-guide palette: **Ink #0B1E3B, Jem Blue #2E6BFF, Spark #8B5CF6, Play #FF5E7A, Idea #FFC24D, Build #22D3A6**. The newer Jems 5 homepage, parent dashboard, subject navigation, saved projects, and Bubblegum v2 sticker game remain the baseline. The SVG assets are interpreted traces, **not yet certified master artwork**. Owner visual parity against the originally approved image board and a fresh exact-head browser test run remain mandatory before merge or publication.


### Legacy branding asset reconciliation (PR #34)
The original universal-brand rollout introduced useful supporting assets that must stay in use when this fidelity PR lands. The existing `jems-wordmark.svg`, `jems-facets-pattern.svg`, `jems-sparks.svg` and `jems-blocks.svg` now use the exact six-source-guide colors wherever those named swatches occur. The installable `jems-app-icon.svg` embeds the *same faceted gem and solid-white wrench* as the current `jems-mark.svg`, without external SVG/image dependencies. The compatibility `jems-mark-monochrome.svg` and `jems-mark-inverse.svg` retain their legacy URLs but now use a visible, opaque white center wrench rather than a transparent knockout. The PWA manifest and HTML theme-color use Ink `#0B1E3B`.

The retained Jems 5 homepage, saved games and parent-learning experiences and Bubblegum sticker game are the required integration baseline. These asset updates do **not** authorize activation of child-facing model services, user tracking, or a public rollout; visual master-art parity and final exact-head CI remain review gates.
