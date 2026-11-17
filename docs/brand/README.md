# jems — web identity and product implementation
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

Avoid using pastel colors as small text on white. Maintain readable navy text on mint, gold, coral, and cloud. The approved style guide calls the display family “Poppins Rounded (Bold)”, but the supplied portfolio did not include an actual font file; this implementation uses a rounded system fallback instead of downloading unlicensed fonts. Interface text uses an Inter-like system stack.

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

## Verified guide alignment
The original approved style-guide board specifies **Ink #0B1E3B**, **Jem Blue #2E6BFF**, **Spark #8B5CF6**, **Play #FF5E7A**, **Idea #FFC24D**, and **Build #22D3A6**. Any earlier near-match values are superseded by these exact codes. Use the approved lower-case wordmark and the *white center of the wrench in the monochrome silhouette*; transparent knockouts that expose a dark background are not accepted. "Send to jems" submits a typed conversation turn; "Speak" is the distinct voice-input control when supported. Full interactive journey parity with the approved 16-screen UX prototype is a separate production feature acceptance, not established by the branding layer alone.

### Delivered vector lockups and patterns
- `public/jems-logo.svg`: gem + traced lower-case wordmark + tagline and sparkle, referencing the approved raster guide.
- `public/jems-mark.svg` / `public/arcade-icon.svg`: isolated faceted gem with open-ended white wrench and gold rays.
- `public/jems-mono.svg`: navy-on-light logo; central wrench **solid white** (never see-through).
- `public/jems-reversed.svg`: white-on-ink logo for dark surfaces.
- `public/jems-pattern.svg`: subtle decorative gem, wrench and spark pattern; no network dependency.

The original brand board remains the reference for pixel-level art direction; these code-native vectors are an interpretation, not a replacement for an independently supplied editable master. Future font substitution must use a properly licensed display font and must not bundle an unapproved font file.
