# Creative library acceptance

Open the offline UI review in the **Populated** scenario and choose **My Art · choose a saved creation**. Choose My Rock, look at its thumbnail, and start a picture hunt. The fixture uses the private drawing writer and a real local game. The other synthetic drawings exercise a character, a vehicle and a world. [Offline review instructions](../ui-review/README.md#connected-creative-universe) · [Destination compatibility matrix](STANDARD.md#destination-compatibility)

| Workstream | Integrated source or dependency | Reproducible evidence |
| --- | --- | --- |
| A · Drawing workspace | [Editable drawings #199](https://github.com/jzwyrzyk/family-game-factory/pull/199), [reviewed PNG consent and admission #204](https://github.com/jzwyrzyk/family-game-factory/pull/204) | The crayon browser journey compares exact original downloads, editable marks and recovered revisions. [Desktop](evidence/editable-sketch.png) · [Phone](evidence/restored-sketch-phone.png) |
| B · Illustrated worlds | [World illustrations #200](https://github.com/jzwyrzyk/family-game-factory/pull/200) and the shared editor | The world browser journey exercises four painted stages, layer visibility, four retained classic backgrounds and an authored backdrop. [Forest](evidence/worlds/enchanted-gem-forest.png) · [Moon](evidence/worlds/moon-adventure.png) · [Cloud](evidence/worlds/cloud-kingdom.png) · [Workshop](evidence/worlds/inventors-workshop.png) |
| C · Movement | [Editable movement paths #201](https://github.com/jzwyrzyk/family-game-factory/pull/201) | Record a path, copy the named group into another scene and run the interpreter at a fixed clock. The source and previously kept scene stay pinned. [Path editor](evidence/motion/draw-a-path.png) · [Playback](evidence/motion/path-playback.png) |
| D · Library and picker | Shared picker, drawing store, prepared game/scene stores and backup authorities | Exercise a synthetic rock, character, vehicle and world. Each appears in a game, scene, world and animation. Revise, archive, explicitly replace, switch profiles and restore into fresh storage. [My Art](evidence/library/my-things.png) · [Scene picker on phone](evidence/library/scene-asset-picker-phone.png) · [Recovery test](../../tests/creative-universe-recovery.cjs) |
| E · Game integration | Trusted local picture hunt and compatible Rally, plus [isolated compositor qualification #202](https://github.com/jzwyrzyk/family-game-factory/pull/202) | The hunt counts three taps and supports explicit revision replacement. Rally accepts a working car assembly. The synthetic worker fixture independently exercises a bounded 2D slot. [Picture hunt](evidence/games/picture-hunt-desktop.png) · [Rally](evidence/games/rally-choose-car-version.png) · [Worker fixture](../game-intelligence/evidence/generated-slot-compositor.png) |
| F · World building | Scene-owned background and decoration references | Use the picker to place private art, select layers, reuse a saved layout and reopen an earlier scene. [Editor](evidence/worlds/world-editor.png) · [Private backdrop](evidence/worlds/my-art-backdrop.png) |

## Reproduce locally

Run `npm ci` in the repository. Use the Playwright Chromium installed for the project, or set `CHROMIUM_PATH` to a compatible local Chromium binary. Browser tests use synthetic data.

1. Run `npm run build`, `npm run test:art` and `npm run test:creation`.
2. Run `npm run test:art-browser` for the drawing, storage, picker, game, cross-profile and fresh-restore journeys. Run `npm run test:creation-browser` for scene, recovery and learner controls.
3. Run `npm run test:generated-art` for the independent synthetic worker fixture and `npm run test:ci` for required-suite coverage.
4. Run `npm run review:build`, open `dist-review/jems-ui-review.html`, then run `npm run review:test`.

## Integration and release

The combined dependency review is [PR #209](https://github.com/jzwyrzyk/family-game-factory/pull/209). Other open candidates include alternative drawing editors, motion representations and generated-game adapters in #206–208 and #210–213. Candidate review must choose and qualify a write format before deployment. The D reader accepts the compatible semantic and scene-role field names. A generated executable receives no owner handle or private storage access from this picker.

The source and Chromium evidence cover synthetic profiles and emulated viewports. Hosted DEV/TEST, physical devices, independent generated-game security review and owner visual acceptance are separate release decisions. The existing household deployment predates this candidate. [Current delivery state](../../DELIVERY-STATE.md)
