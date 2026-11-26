# Creative Studio world qualification

The reconciled implementation is based on PR #207 at `4be7c6dd70b588cfbd288cc8d7a68fe94d9ae37c`. The catalogue, crayon source and authored-path format are inherited from that branch. The world picker extends its owner-scoped private art dialog. The visual baseline is protected application commit `bc602f1ede502f398308ad56f973c4bf7997ff08`. The before images show its blank starter. The after images show actual selected scenes in the same viewport sizes. Each world tile creates a project that can be edited, played, kept, copied and reopened.

| Local Chromium viewport | Protected baseline | Integrated activity | World picker |
| --- | --- | --- | --- |
| Desktop, 1440 × 960 | [Before](before-desktop.jpg) | [Enchanted Gem Forest](after-desktop.jpg) | [Desktop tiles](world-picker-desktop.jpg) |
| Tablet, 820 × 1180 | [Before](before-tablet.jpg) | [Inventor’s Workshop](after-tablet.jpg) | [Tablet tiles](world-picker-tablet.jpg) |
| Phone, 390 × 844 | [Before](before-phone.jpg) | [Moon Adventure](after-phone.jpg) | [Phone tiles](world-picker-phone.jpg) |

The four world views show the live canvas and a selectable, transparent, versioned object in each setting. The assembled layers share the original scene dimensions and center crop. The gallery thumbnail renders the kept placements and layer visibility. [Forest](stage-forest-desktop.jpg) · [Workshop](stage-workshop-desktop.jpg) · [Cloud Kingdom](stage-cloud-desktop.jpg) · [Moon](stage-moon-desktop.jpg) · [Expanded view](forest-expanded.jpg) · [Saved scene thumbnail](kept-world-preview.jpg)

The mixed-art scene uses the approved Nook base image and a synthetic hand-drawn-style pebble streamed from the local owner’s private drawing store. The pebble was created solely for this browser test. Its exact image was selected and dragged alongside Nook using the ordinary editor controls. [Play capture](cloud-nook-and-child-style-pebble.jpg)

## Reproduction and scope

Build the ordinary application with `npm run build` and run `node tests/creation-worlds.cjs`. Set `CHROMIUM_PATH` to a local Chromium executable if Playwright's browser is unavailable. The test writes captures to `test-results/creation-worlds`. It drives the same public entry points for scene selection, settings, editing, Play, Keep, copy, full screen, asset selection and file export as the application. Synthetic data setup uses the existing verified drawing store and a reviewed bundled Pal scene fixture. The code evaluates scope and hashes through the existing storage and scene interfaces.

The desktop check also imports each of the four classic backgrounds and compares representative sky and ground pixels with samples taken from protected main. The browser compares scene pixels against the selected image layers at a grid of points outside actors. It requires at least 500 sampled locations and 99.5% agreement within two RGB units per channel. The comparison runs on all four worlds, on tablet and phone stages, with a foreground hidden and in full screen. It checks the exact backdrop version in exported scene-and-art data, a kept source after a copy is edited, and zero uncaught page errors on all three layouts. On desktop it waits for the service worker, disconnects Chromium, reloads the application, reopens that kept scene, plays it and compares the resulting project with its original pinned actors, world and layers.

The local capture build's application JS has SHA-256 `8e7bfeca7048b65d30851202588f53e0285de0611f50c8fb2d21a9d0262dd971`, and its CSS has SHA-256 `877424a0604a58f82561aa38bad4b9bb170d9cc6c88cb4d6c048f05cecefeda2`. These digests identify the built files exercised on the reconciled branch. The integration PR records the review head.

The existing production-dist Creation browser journeys also exercised desktop and touch-emulated tablet block editing, source game continuity, tap actions, challenge reconstruction, mandatory learning guards and actual canvas video downloads. Eight recovery journeys covered import failure, rollback, backup and saved-draft recovery. Local browser review found a settings panel that could cover its dismissal, a select without an unambiguous spoken label, undersized scenery switches and a closed inspector that still occupied layout in Chromium. The current UI has a Done button, an explicit World label, 44-pixel checkbox targets and a closed inspector removed from layout.

Physical tablet input and frame pacing, owner art-direction acceptance, hosted release qualification and family activation are separate release evidence. No family participated and no generation service was invoked by these acceptance journeys. [World art contracts](../../WORLD_ART.md) · [Creation Studio acceptance](../../ACCEPTANCE.md)
