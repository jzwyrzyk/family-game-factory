# World composition acceptance

The running Studio and the standalone review use application source `7c31f717712a23001c0d95ed9ed88fa3e4ade3a3`. Choose **Build in the Enchanted Gem Forest** in the standalone review’s destination menu. Choose **Character → Jems objects** to bring a rocket into the forest. Use **Scene settings** to select a placement’s size, turn, position and layer. Play hides editor decorations. **Keep** saves the revision. **Use this world** on its card starts a new scene from that kept version.

| Evidence | What to look for |
| --- | --- |
| [Cross-world Play](forest-cross-world-play.jpg) | Both rockets retain the Moon Adventure sprite. Only the turned copy receives a movement block. |
| [Personal landscape](private-landscape-cover.png) and [exported video](private-landscape.webm) | A synthetic 1200 × 300 original cropped onto the 800 × 450 stage. A tree from the forest remains an independent placement. |
| [Phone placement](placement-phone.jpg) and [tablet placement](placement-tablet.jpg) | The open inspector after using the touch alternatives to move and turn the selected object. |
| [Four illustrated stages, previews, Nook and personal pebble](../worlds/README.md) | Original world plates, transparent props, a retained Pal and a personal asset rendered in the ordinary app. |

## Reproduce

Use the repository’s Node toolchain and installed Playwright Chromium. Set `CHROMIUM_PATH` when using a system Chromium. All personal drawings and profiles in these checks are synthetic.

| Command | Coverage |
| --- | --- |
| `npm run build` and `npm run test:creation-browser` | Production bundle, ordinary authoring, challenge reconstruction, eight recovery journeys, responsive First steps, keyboard and touch, actual scene playback and all four worlds. |
| `npm run test:creation` and `npm run test:art` | Interpreter order, challenge behavior, old and new schemas, private selection, original bytes, image and rig pins, per-owner histories. |
| `node --import tsx --test tests/pals-creation.test.ts` | Retained Pal portrait recovery and readiness of the three world plates plus the exact portrait. |
| `node tests/storage-creation-browser.cjs` | IndexedDB paging, recovery, stale-writer rejection, cross-owner guards and forking the kept revision even when a newer draft exists. |
| `npm run test:art-browser` | My Art capture, crop and cutout, return to scene, immutable movement, editable export, video, corrupt input, profile isolation and late-decode cancellation. |
| `npm run review:build`, `npm run review:test`, `node tools/ui-review/world-compatibility.cjs` | Standalone product sandbox. One uploaded rock keeps its hash and sampled pixel colors through four legacy backgrounds. A second upload checks landscape crop, actual decoded recording and exact editable export. |

The illustrated stage test samples at least 500 points outside actors per comparison and requires 99.5% agreement within two RGB levels with the versioned layers. The landscape regression checks two-source-pixel marks in the cropped backdrop against a direct render of the original, then decodes the exported recording and checks its dimensions and sampled colors with a lossy-codec tolerance. The portable scene archive separately recovers the exact original bytes.

The product journey runs in Chromium at desktop 1440 × 960, tablet 820 × 1180 and phone 390 × 844. The managed browser exercises the standalone HTML using its in-memory transport. GitHub’s standalone job exercises direct file opening. The blank starter has a white stage and one editable gem, as required by the retained project schema.

## Integration and release

The editor consumes the canonical standard from [#196](https://github.com/jzwyrzyk/family-game-factory/pull/196), the four worlds and 32 distinct props from [#200](https://github.com/jzwyrzyk/family-game-factory/pull/200), and the owner-scoped picker and Studio renderer from [#208](https://github.com/jzwyrzyk/family-game-factory/pull/208) and [#211](https://github.com/jzwyrzyk/family-game-factory/pull/211). The retained-background regression from [#205](https://github.com/jzwyrzyk/family-game-factory/pull/205) is included in this stack. Workstream F owns the editor and exact kept-world fork. My Art owns the original bytes and D owns private selection. The shared input helper carries only pointer coordinates.

Release qualification still requires owner art review, physical devices, hosted DEV/TEST and mixed-version storage/rollback checks. Older strict validators can reject a scene containing the new local fields or blank background. Preserve current records and verified exports across rollback. Workstream E’s scoped sprite qualification provides no composition delivery adapter. World reuse here runs in the trusted Creative Studio. Production and external family activation require separate decisions.
