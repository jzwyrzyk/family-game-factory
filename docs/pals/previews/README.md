# Companion implementation previews

## Approved expression playground — current combined candidate

These captures show the actual production-built **My Pals → Try Pal expressions** surface from the combined PR90 candidate based on merged PR89 main `669df0ef5e73e11c8786b741815ba290c820d326`, using assets **`index-iVs4Asj-.js` / `index-CvQ7lEds.css`**. The desktop and phone images were regenerated from that bundle and visually inspected. Six Pal component groups, eight expression-browser groups and eight integrated application Pal groups passed locally; [delivery state](../../../DELIVERY-STATE.md) records the complete scope and remaining hosted gate.

| Capture | Evidence scope |
| --- | --- |
| [Expression playground, desktop](expressions-desktop.png) | A 1440px application viewport, cropped to the actual playground panel. |
| [Expression playground, phone](expressions-mobile.png) | A 390px application viewport showing contained Navi Grown Encouraging retry art and the character/form/expression controls. |

The selected portrait uses exact approved pixels. Preview controls expose 23 original profiles, Base/Grown and Ready/Celebrate/Think/Try again; they do not collect, equip, grow or award anything. These images do not establish a merged release, creature-to-collection identity mapping, articulated rigs, production deployment or physical-device/child acceptance. The [expression contract](../EXPRESSIONS.md) defines the tested source behavior.


## Current Base/Grown integration

The captures in `two-form/` use production assets **index-CD85vMsh.js / index-C67kjIJc.css** with PR81/current-main integration. The built-app journeys passed on this source, and an independent reviewer inspected desktop/390px collection, scene, failed-save, owner-loading and 320px navigation captures. Historical images below remain unchanged.

| Capture | Exact evidence scope |
| --- | --- |
| [Earned collection, desktop](two-form/earned-desktop.png) | Actual local UI Math completions and a delegated host hint produced 10 gems and one adventure. These are automated sample-profile actions, not observations of children or a paid provider. |
| [Complete collection, desktop](two-form/collection-desktop.png) | Explicit receipt fixtures exercise 50/150-gem unlocks and 15 cumulative adventures. Glim remains Grown with exactly two forms; no third transition is promised. |
| [Complete collection, phone](two-form/collection-phone.png) | The same labeled fixture at 390px shows both navigation rows, the selected Pal route and readable preview-art/collection controls. |
| [Editable scene, phone](two-form/scene-phone.png) | Owned token Pals are added through the real editor; actor programs and explicit Keep remain available. This is supported local scene use, not arbitrary generated-game integration. |

The portraits remain provisional gem tokens. These screenshots do not establish an approved character/form mapping, final creature animation, physical-device reliability or child engagement. The source, test correction and publication boundary are recorded in [delivery state](../../../DELIVERY-STATE.md).

## Original three-stage candidate

**Historical capture scope:** the images below record the original three-stage PR68 candidate. They remain provenance, not the current two-form UI. Current Base/Grown integration and its checks are recorded in [delivery state](../../../DELIVERY-STATE.md) and [ADR0013](../../decisions/0013-two-form-pals-and-current-main.md).

Captured on **November 19, 2026** from runtime candidate `ef62e3b` on `feature/jems-pals-implementation`, based on shared Rewards commit `5c61a5c`. A later test-only capture adjustment waits for portrait decoding after equipment updates; it does not change runtime behavior. These are browser screenshots of the working application, not character-art proposals. Existing approved gem tokens remain provisional companion portraits; no artwork was generated or modified.

| Preview | What the shown state means |
| --- | --- |
| [Collection: earned progress, desktop](pals-app-earned-desktop.png) | Glim was chosen through the UI. Five actual Math activities were completed through the learning interface, including one delegated Pal hint: **10 gems and 1 adventure**. The hint remains recorded as assistance. No receipt fixtures had been added at this capture. |
| [Collection: all Pals, desktop fixture](pals-app-fixture-desktop.png) | Shows the complete collection and Radiant Glim. Later test-only source receipts add **180 gems and 14 adventures**, producing the pictured **190 gems and 15 adventures**. The real collection UI performs the eligible Welcome and Take along actions. This is seeded unlock/growth evidence, not observed child progress. |
| [Editable playground, mobile](pals-app-playground-mobile.png) | The actual 390px Creation Studio after adding Glim and Kip to a free scene through its controls. Existing actors and scripts are preserved; the displayed Pal blocks are editable. Kip eligibility and the header total use the same labeled receipt fixture. |

The desktop captures use a 1440px viewport. The browser checks also cover 768px, 390px and 320px collection reflow. The [component suite](../../../tests/pals-ui-browser.cjs) adds keyboard/focus, saving/error, reduced-motion and 200% zoom checks.

## Reproducing the checks

After `npm run build`, run:

```sh
npm run test:pals-browser
node tests/rewards-browser.cjs
```

The final review candidate passed **5 companion component groups, 7 integrated companion groups, and the full updated rewards journey** using Playwright's bundled headless Chromium. The companion journey recorded no uncaught application errors, console errors or paid provider requests. Its [test source](../../../tests/pals-browser.cjs) labels receipt seeding separately from normal UI actions; generated results remain in `test-results/`.

These checks establish local browser behavior. They do not establish deployment, real-device acceptance, observed child engagement or educational benefit. See the [companion contract](../README.md) for implementation boundaries and deferred artwork.
