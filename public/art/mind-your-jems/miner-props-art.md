# Mind Your Jems — miner and prop art

Production art created with the built-in image-generation tool from the approved **Mind Your Jems! Game UI Storyboard** as the style and character reference. These are illustrated game assets, not screenshots of the running game. The existing `jems-logo.svg` remains the authoritative brand asset; no generated brand mark is used in these sprites.

## Assets and coordinates

- `miner-poses.webp`: transparent square 2×2 atlas. Reading order: idle/climbing, mining strike, holding/grabbing, celebration. Use `background-size: 200% 200%`; positions `0% 0%`, `100% 0%`, `0% 100%`, `100% 100%`. The character faces right.
- `props-atlas.webp`: transparent 4×2 atlas. Reading order: cyan gem, pink gem, violet gem, gold gem, mint gem, coral gem, purple/gold cart on a grassy floating rock platform, wooden ladder. Use `background-size: 400% 200%`; column positions `0%`, `33.333333%`, `66.666667%`, `100%`; row positions `0%`, `100%`. Each display cell is square.
- `cart-empty.webp`: standalone transparent square sprite of the matching purple/gold cart and grassy rock ledge. The cart is completely empty, with a plain front panel. The renderer uses this asset with a live gem pile and the official Jems logo; the atlas’s originally full cart is not used for gameplay feedback.

## Generation brief

Miner: polished dimensional storybook/toy-like cartoon child, golden headlamp helmet, tousled brown hair, blue outfit, warm brown boots and gloves, purple backpack. Four consistent full-body poses in equal cells, true transparent alpha, no scenery or text. Match the approved reference’s cheerful expression, soft material detail, warm light, rounded proportions, and art quality. All body parts stay within the pose cell. A targeted second edit removed the initially generated backpack emblem and preserved the other artwork.

Props: eight isolated assets in a four-column/two-row equal-cell texture atlas. Glossy faceted candy-color collectible crystals, a purple minecart with a gold rim and a small gem pile on a grassy floating rock ledge, and a dimensional honey-colored wooden ladder. Match the miner and reference lighting/materials. True transparent background; no UI, labels, text, invented logos, or grid lines.

Empty cart follow-up: use the atlas cart as reference, produce one full standalone sprite with the same purple body, golden rim and rivets, round wheels, grassy lip, pink flowers and floating lilac rock platform. Remove every gem and all cart contents, showing the hollow purple interior. Preserve material style and warm lighting; no logos, symbols, text, other atlas objects, or background. All wheels and the platform remain inside the transparent square.

## Delivery

PNG masters are retained in the task’s `art-masters` directory, outside the application’s public bundle. Shipped textures are WebP converted with Sharp at quality 94 and alpha quality 100. Artwork colors, cells, and alpha were preserved during format conversion. CSS framing selects atlas cells; no production-art replacement was drawn in SVG or CSS.
