# Creation journey visual review

Selected browser captures for the [first-creation contract](../FIRST-CREATION.md). These are review evidence, not pixel-perfect test baselines.

## November 21 — corrected conversation coach and Build handoff

The owner clarified that the coach must guide children to their own answers: no suggested-answer buttons, no **Choose the rest**, and no new game until the child has supplied enough coherent intent. These four PNGs show that corrected candidate on branch `feat/guided-creation-20261120`, based on `d0d05944ea4957aef51b690bf02dc8f6bb73f04e`. They supersede the earlier first-idea layout below; the older captures retain their historical scope.

Captured directly by `tests/guided-creation-browser.cjs` at `2026-11-21T05:34:46Z`–`05:34:50Z` (November 21, 12:34 a.m. America/New_York), served locally under `/arcade/`. The production build was:

| Asset | SHA-256 |
| --- | --- |
| `index-qbE__9jW.js` | `f340f107ffa32b1a29ce4bbc7cea4217ece5e48985923c57026d8a6bd251c2e6` |
| `index-CFCtGqFy.css` | `d3941dbaf9f30c4f32daf651eebd91f298bfa4c8532c3e423438ea2905b1e63b` |

| Image | Dimensions | Visible state |
| --- | --- | --- |
| [Desktop conversation](guided-question-desktop.png) | 1280 × 900 | The child's own action and the coach's contextual question about how it should feel. Earlier ideas and extra tools are collapsed; no supplied answers or early Build. |
| [Phone conversation](guided-question-phone.png) | 390 × 844 | The active question, free-text composer, Speak and Send, and collapsed More choices. |
| [Desktop acknowledged Build](guided-build-desktop.png) | 1280 × 900 | Focused cheerful handoff after durable job acknowledgement, with explicit Play while I wait and Stay here. |
| [Phone acknowledged Build](guided-build-phone.png) | 390 × 844 | The same focused handoff with readable copy and complete touch targets. |

All four images were visually inspected. The browser uses fresh synthetic profiles, device scale 1, reduced motion, and mobile/touch emulation for the phone. It waits for the actual question or acknowledged handoff and for fonts/artwork before capture. The connected-coach replies and build job are explicit fixtures; no live provider, private child transcript or paid generation was used.

The surrounding test sends the child's words through the actual composer, requires further conversation despite an otherwise complete-looking evidence set, and only exposes Build after a grounded ready review. It verifies that unsent changes hide Build, exactly one explicit submission occurs, compiled instructions stay outside chat, dismissing the modal preserves the draft, and background readiness does not reopen it. These captures and browser checks establish candidate presentation and host behavior, not live-model coaching quality, physical-device reliability or observed child comprehension. See [delivery state](../../../DELIVERY-STATE.md) and the review PR for the complete scoped evidence.

## Historical November 20 first-creation and Art Studio captures

The following images describe the earlier first-creation implementation. Its Make / Explore welcome, immediately visible Build and original navigation have since been superseded; they are preserved as dated evidence, not the current design.

### Capture context

Captured November 20, 2026 at `04:46 UTC` (`2026-11-20T04:46:27.898Z`) from the first-creation working tree integrating Art Studio main `90743ab2b1da098188db15dc5e40c3dfd799e291`, in a local production build served under `/arcade/`. The served bundles were `index-8QEOF1e5.js` and `index-BvQk881S.css`. See the repository's [delivery state](../../../DELIVERY-STATE.md) for the combined source and checks; the review PR records published-head workflow results.

The [earlier capture set at first-creation head `5dbe8e4`](https://github.com/jzwyrzyk/family-game-factory/tree/5dbe8e497862c921e5eed2d075241a772df8e04f/docs/child-journey/previews) retains its original images, bundle receipt and broader initial visual review. These refreshed images show the combined first-creation and Art Studio source; the earlier evidence is not relabeled as an integration result.

Playwright used headless Chromium with a fresh browser context for each viewport, device scale 1 and reduced motion. Phone contexts enabled touch and mobile emulation. The browser waited for local fonts and visible artwork to decode before capture. These JPEGs were captured directly by the browser at quality 86; the help image is an element capture of the entire inline panel.

The builder configuration was the deterministic `{ "version": 1, "mode": "unavailable" }` fixture. The visible “not connected” copy is intentional. No real generation provider or child account was used. The screenshots establish local browser presentation, not deployment, physical-device reliability or child comprehension.

### Selected views

| Image | Dimensions | Visible state |
| --- | --- | --- |
| [Desktop welcome](first-welcome-desktop.jpg) | 1280 × 900 | Optional Make / Explore invitation, with the ordinary navigation deferred until a choice. |
| [Phone welcome](first-welcome-phone.jpg) | 390 × 844 | Both first actions fit in the viewport; the heading is not styled as an input. |
| [Phone first idea](first-idea-phone.jpg) | 390 × 844 | Compact approved artwork, separate Send and Build actions, and optional guidance after the composer. |
| [Phone Journey help](journey-help-phone.jpg) | 366 × 658 panel within a 390 × 844 viewport | Four making steps, Art Studio drawing entry, existing practice and scene-video routes, and optional tip reset. |

All four refreshed images were inspected. The desktop and phone welcomes keep Make and Explore distinct; the phone composer keeps both Send and Build inside the first viewport, with optional guidance below. Journey help includes the existing drawing and scene-video paths. Capture checks found no horizontal overflow, browser runtime errors or POST requests. Image dimensions above come from the saved JPEGs; the help panel capture includes the whole panel.

The full automated acceptance and compatibility results belong in the delivery record. These four compressed files keep the visual evidence small enough to review with the source.
