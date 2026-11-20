# First-creation visual review

Selected browser captures for the [first-creation contract](../FIRST-CREATION.md). These are review evidence, not pixel-perfect test baselines.

## Capture context

Captured November 20, 2026 at `04:46 UTC` (`2026-11-20T04:46:27.898Z`) from the first-creation working tree integrating Art Studio main `90743ab2b1da098188db15dc5e40c3dfd799e291`, in a local production build served under `/arcade/`. The served bundles were `index-8QEOF1e5.js` and `index-BvQk881S.css`. See the repository's [delivery state](../../../DELIVERY-STATE.md) for the combined source and checks; the review PR records published-head workflow results.

The [earlier capture set at first-creation head `5dbe8e4`](https://github.com/jzwyrzyk/family-game-factory/tree/5dbe8e497862c921e5eed2d075241a772df8e04f/docs/child-journey/previews) retains its original images, bundle receipt and broader initial visual review. These refreshed images show the combined first-creation and Art Studio source; the earlier evidence is not relabeled as an integration result.

Playwright used headless Chromium with a fresh browser context for each viewport, device scale 1 and reduced motion. Phone contexts enabled touch and mobile emulation. The browser waited for local fonts and visible artwork to decode before capture. These JPEGs were captured directly by the browser at quality 86; the help image is an element capture of the entire inline panel.

The builder configuration was the deterministic `{ "version": 1, "mode": "unavailable" }` fixture. The visible “not connected” copy is intentional. No real generation provider or child account was used. The screenshots establish local browser presentation, not deployment, physical-device reliability or child comprehension.

## Selected views

| Image | Dimensions | Visible state |
| --- | --- | --- |
| [Desktop welcome](first-welcome-desktop.jpg) | 1280 × 900 | Optional Make / Explore invitation, with the ordinary navigation deferred until a choice. |
| [Phone welcome](first-welcome-phone.jpg) | 390 × 844 | Both first actions fit in the viewport; the heading is not styled as an input. |
| [Phone first idea](first-idea-phone.jpg) | 390 × 844 | Compact approved artwork, separate Send and Build actions, and optional guidance after the composer. |
| [Phone Journey help](journey-help-phone.jpg) | 366 × 658 panel within a 390 × 844 viewport | Four making steps, Art Studio drawing entry, existing practice and scene-video routes, and optional tip reset. |

All four refreshed images were inspected. The desktop and phone welcomes keep Make and Explore distinct; the phone composer keeps both Send and Build inside the first viewport, with optional guidance below. Journey help includes the existing drawing and scene-video paths. Capture checks found no horizontal overflow, browser runtime errors or POST requests. Image dimensions above come from the saved JPEGs; the help panel capture includes the whole panel.

The full automated acceptance and compatibility results belong in the delivery record. These four compressed files keep the visual evidence small enough to review with the source.
