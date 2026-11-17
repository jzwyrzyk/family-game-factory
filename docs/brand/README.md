# jems — web identity and product implementation
The selected public-facing brand is **jems** (lowercase), with a faceted **gem and central wrench** mark. The brand is intended for children who invent, reason, solve, make and play; parents should see confident STEM/creative problem-solving, not an AI toy that designs everything for the child.

## Approved color system
| Token | Hex | Function |
|---|---|---|
| Ink | `#0B1D4D` | headlines, body text, dark UI |
| Gem Blue | `#2D7BFF` | primary action, navigation emphasis |
| Spark Purple | `#8A4DFF` | imagination, active details |
| Build Mint | `#34D7B3` | building, successful progress |
| Idea Gold | `#FFC828` | idea sparks, rewarding emphasis |
| Play Coral | `#FF6B7A` | playful accents, not alone for errors |
| Cloud | `#FFF7EE` | warm surfaces |
| Soft Lilac | `#E6D8FF` | surfaces, secondary emphasis |

Avoid using pastel colors as small text on white. Maintain readable navy text on mint, gold, coral, and cloud. The brand's guidance calls the display family “Jems Round”, but the supplied portfolio did not include an installable licensed font. The **logo wordmark is outlined from the approved reference**; ordinary headings use a rounded system fallback rather than downloading unlicensed fonts. Interface text uses an Inter-like system stack.

## Logo
`public/jems-mark.svg` and `public/jems-logo.svg` are scalable SVG implementations of the *approved* faceted-gem/wrench layout. The approved brand portfolio is raster artwork, so the mark is an independently reconstructed faceted SVG with an **open-ended white wrench** (not a keyhole) and the lowercase wordmark is an SVG vector trace of the approved board. Logo, standalone wordmark and inverse variants are scalable; visual owner approval is still required before certification as final production masters. Never stretch, skew, recolor or apply shadows to the logo.

## Cross-surface implementation
- Homepage, returning-player strip, six Factory Favorites, game workspace, chat composer and version shelf.
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
The brand extends well beyond the header. All artwork below is an original, locally served SVG, without CDNs, font trackers, or external network dependencies:
- `jems-logo.svg` — approved-style gem + outlined lowercase wordmark lockup; `jems-wordmark.svg` is the isolated vector signature
- `jems-mark.svg`, `jems-mark-monochrome.svg`, `jems-mark-inverse.svg`, `jems-app-icon.svg` — colored mark, single-color, reversed and installed-app variants
- `jems-sparks.svg` — restrained gold/purple idea accents; `jems-blocks.svg` — modular makers' building pieces
- `jems-clouds.svg` — lilac ambient shapes for welcoming/empty states
- `jems-facets-pattern.svg` — optional colorful geometric facet motif (don't wallpaper the learning surface)
- `arcade-icon.svg` stays an alias for legacy references while using the same approved mark; the HTML explicitly declares `jems-mark.svg` as favicon and the PWA manifest prefers the dedicated square `jems-app-icon.svg` as its installable icon

Use **Ink** for readable copy, **Cloud/white** for most surfaces, **Soft Lilac** for softly selected sections, **Gem Blue/Purple** as accent identity, **Mint** for building/progress and **Gold** for limited sparks. Coral is a playful accent and must not serve as the only indicator of an error.

**Accessibility note:** Raw `#2D7BFF` with white small text is ~3.9:1, not the inaccurate 8.9:1 shown in a concept board. The *palette remains unchanged*; the semantic `--jems-action-blue: #195FD0` is used for small white button text (~5.85:1) and `--jems-action-purple: #7136C9` is an accessible darker purple. Do not use light pastels as text on white.

### Where the identity is applied
| Experience | Brand expression | Intensity |
|---|---|---|
| Navigation and header | Exact mark/outlined lowercase wordmark, Ink, lilac selected pills | Low |
| Studio homepage | Cloud/lilac atmosphere, faint cloud/blocks/spark graphics, accessible blue→purple creation action | Medium |
| Six Factory Favorites | Distinct game art, quiet white frames, lilac hover/focus, readable Ink metadata | Low |
| Saved projects, versions, background builds | Mint continuity border, gentle facets, Ink build shelf, accessible statuses | Low |
| Conversation/voice | Faceted helper badge, subtle lilac child bubbles and mint reflections; separate Send and Speak | Low |
| Math/Language Arts/My Powers | Blue or mint frame accents; purple selected controls; do not decorate the question text | Minimal |
| Grown-up controls, backups, privacy | Calm cream/white panels and clear focus/contrast, no cartoon takeover | Minimal |
| Legacy Arcade, favicon/PWA/offline | Same tokens, identity and mark with legacy behavior unchanged | Low |

**Non-negotiable restraint:** Graphics never obscure text, hijack input focus, displace playable game media, degrade 390px mobile first-action visibility, or animate while reduced-motion is requested. Branding must never claim educational mastery or model availability not supported by the product.
