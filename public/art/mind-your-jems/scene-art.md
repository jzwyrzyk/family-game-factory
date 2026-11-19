# Mind Your Jems — scene artwork

Production artwork created with the built-in image-generation tool from the approved `Mind Your Jems! Game UI Storyboard.png` and `Mind Your Jems! Game UI Sheet.png` references. These files are game assets, not flattened interface mockups. The existing repository Jems logo remains authoritative and is not replaced by these illustrations.

## Visual contract

Dimensional storybook cartoon rendering, softly sculpted lavender/pink rock, voluminous pink and mint hair, glossy expressive purple eyes, warm light from the upper left, pastel blue/lilac atmosphere, lush greenery and floating-island waterfalls. Keep dynamic text, score, controls and hit targets in the real interface.

## Files

| File | Dimensions | Layout and use |
| --- | --- | --- |
| `scene-sky.webp` | 1672 × 941 | Opaque landscape background, richly illustrated islands and waterfalls near the edges, open central sky for the characters. |
| `rock-expressions.webp` | 1254 × 1254 | True-alpha 2 × 2 expression atlas; each cell is 627 × 627. Top-left idle, top-right warning, bottom-left celebration, bottom-right recovery. All expressions share the same silhouette and placement. |
| `scene-platform.webp` (optional study, not shipped) | 1774 × 887 | Optional separate true-alpha grassy floating rock platform; clear center top for a runtime cart. |

The rock's opaque silhouette within each cell is approximately x=12…613, y=62…589; the major body position is consistent across all four expressions. Align frame containers by the equal cell bounds, not independent per-expression trimming.

## Prompt summaries

- **Environment:** polished dimensional cartoon floating islands, turquoise waterfalls, bright green plants, rounded lilac stone, warm light, soft pink/violet clouds; broad clear center; no characters, cart, ladder, interface or text.
- **Rock atlas:** same front-facing friendly lilac rock head in four equally sized cells; thick pink and mint hair tufts, bare central crown for interactive crystals; idle/upward smile, anticipating/O mouth, happy closed-eye laugh, recovered broad smile; identical placement and scale; real transparency; no additional props or text.
- **Platform:** isolated wide floating lavender/pink stone ledge, flat clear upper surface, bright grass and small flowers at the rim, 3/4 front view, true transparency, no cart or characters.

## Export

PNG masters remain in the development workspace. Deployed WebP assets were encoded with sharp at quality 94 and alpha quality 100, without resizing or geometric edits. Character and platform alpha channels are preserved. Generated-art references must not substitute for browser captures when reviewing the implemented game.
