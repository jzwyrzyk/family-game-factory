# Illustrated worlds, collection 1

These are original Jems product illustrations made for the four Creative Studio environments. The reference review included the actual Gem Factory workshop, Mind Your Jems! sky painting, the homepage workshop cover, the My Art landing composition, an approved Pal and Nova's maker atlas. The generation briefs contained descriptions of public product art direction. Each scene and prop sheet was commissioned through the available ImageGen workflow. Exact briefs for the four settings, source digests, supported uses, dimensions, layer and scale, runtime digests and approval status are in the [art manifest](world-art-manifest.json).

| World | Activity surface | Reusable objects |
| --- | --- | --- |
| Enchanted Gem Forest | Sunlit clearing beneath interlocking branches, with a brook and footbridge in the distance | Tree, rock, flowers, mushrooms, crystals, log, bridge and chest |
| Inventor’s Workshop | Diagonal window light falling across a polished floor between two work areas | Workbench, crate, gear, polisher, button, wrench, pipe and spring |
| Cloud Kingdom | Grassy island terrace under a rainbow, with a distant castle and waterfalls | Cloud platform, floating island, balloon, star, rainbow, tower, gem and stairs |
| Moon Adventure | Open lunar dust between crystal formations, with a ringed planet on the horizon | Rock, rocket, satellite, crater, station, crystal, meteorite, rover and the shared golden star |

Each environment has a 1280 × 720 opaque plate, two aligned transparent overlays and a 384 × 216 preview of the composite. Props have individual alpha channels and padding. The initial cloud prop sheet had a mist across the negative space. The replacement sheet preserved the clear exterior needed for a cutout. Inspect the transparent props against both light and dark backgrounds. The stage uses the versioned files for artwork; the selector uses the smaller previews. New versions must retain the older catalogue IDs and files for kept scenes.

Source art review found four distinct compositions and a clear central play area. Exact retained approval rests with the product owner after inspecting actors in the running stage. The local captures and actual render tests are recorded with the implementation. The collection has no external runtime dependency. [Product standard](../creative-universe/STANDARD.md)


## Stage integration

The four starter buttons use the four preview images and pin the selected world edition. The stage resolves its aligned background, middle and foreground files from [the catalogue](../../src/creation/illustrated-art.ts). The large stage never stretches a preview into a backdrop. **World** lets the child toggle middle and front scenery, choose a prop collection, and place a prop from any collection in another world. New placements have no behavior. The same actor and program execute against each visible world. **My art** supplies private, exact-revision pixels at the host; the product art catalogue carries only bundled Jems files.

[The catalogue test](../../tests/creative-world-art.test.ts) verifies 48 file hashes. [The browser journey](../../tests/creative-worlds-browser.cjs) opens all four painted worlds, observes a canvas change when the foreground is toggled, imports a synthetic drawing, checks its hash in a kept scene bundle and reopens an independent arrangement. Owner sign-off on the illustrated composites is pending.
