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

Avoid using pastel colors as small text on white. Maintain readable navy text on mint, gold, coral, and cloud. The brand's guidance calls the display family “Jems Round”, but the supplied portfolio did not include an actual font file; this implementation uses a rounded system fallback instead of downloading unlicensed fonts. Interface text uses an Inter-like system stack.

## Logo
`public/jems-mark.svg` and `public/jems-logo.svg` are scalable SVG implementations of the *approved* faceted-gem/wrench layout. Source art approved in the separate branding discussion is supplied as a raster presentation, not editable vector geometry. These SVG assets therefore need a pixel-fidelity review before certification as final production master assets. Never stretch, skew, recolor or apply shadows to the logo.

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
