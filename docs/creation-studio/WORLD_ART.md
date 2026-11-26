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

In **Scene settings → World**, choose one of the four paintings. The live stage draws the plate and middle layer, then visible actors, the foreground layer, and finally speech and counters. Playback and video preparation wait for the same versioned resources. **Character** offers the chosen world’s props alongside the existing cast. A prop carries its own asset ID when placed and stays in the scene if the world changes. Kept scenes with the earlier Gem Factory, Waterfall islands, Garden terrace, classic, or private backgrounds continue to use their saved selection.

The local Chromium journey selected all four settings, compared the rendered stage with independently composited plate pixels, placed the Moon rover, kept the scene, reopened it, and played it at 390 CSS pixels wide. These are captures of the running synthetic activity. [Forest](evidence/painted-worlds/creative-painted-forest.png) · [Workshop](evidence/painted-worlds/creative-painted-workshop.png) · [Cloud](evidence/painted-worlds/creative-painted-cloud.png) · [Moon](evidence/painted-worlds/creative-painted-moon.png) · [Phone playback with rover](evidence/painted-worlds/creative-painted-moon-phone.png)
