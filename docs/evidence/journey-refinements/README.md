# My Journey and secondary page comparisons

Each cell opens the rendered application at its original CSS viewport size. Each row uses one fresh, synthetic child profile. The comparisons show the default Journey, both free starters, the rewards collection and optional Powers practice. On phones the global navigation moves above the Powers activity to leave its answer controls accessible.

| Viewport | My Journey dashboard | Choose your Pal | Gems & achievements | My Powers |
| --- | --- | --- | --- | --- |
| Desktop · 1440 × 1000 | [Dashboard](desktop-journey.webp) | [Pals](desktop-pals.webp) | [Gems](desktop-rewards.webp) | [Powers](desktop-powers.webp) |
| Tablet landscape · 1180 × 820 | [Dashboard](landscape-journey.webp) | [Pals](landscape-pals.webp) | [Gems](landscape-rewards.webp) | [Powers](landscape-powers.webp) |
| Tablet portrait · 820 × 1180 | [Dashboard](portrait-journey.webp) | [Pals](portrait-pals.webp) | [Gems](portrait-rewards.webp) | [Powers](portrait-powers.webp) |
| Phone · 390 × 844 | [Dashboard](phone-journey.webp) | [Pals](phone-pals.webp) | [Gems](phone-rewards.webp) | [Powers](phone-powers.webp) |

The browser suite checks the rendered title, back action, title-to-navigation spacing, keyboard focus, modal dismissal, starter artwork and dashboard alignment. The same suite also exercises the self-contained review HTML at these dimensions. The Standalone UI review workflow retains full-resolution PNGs from both surfaces. Local Chromium used the inline review harness. [Regression suite](../../../tests/secondary-page-headers.cjs) · [Sandbox build and download](../../ui-review/README.md)

Application source for these captures is `13e39c3df9c9d1c938990bf8d86ec2ea1c59aa43`. Screenshots use Chromium with reduced motion and device-pixel ratio 1. Committed WebPs retain the measured viewport dimensions.
