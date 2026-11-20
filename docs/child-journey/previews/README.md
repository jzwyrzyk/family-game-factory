# First-creation visual review

Selected browser captures for the [first-creation contract](../FIRST-CREATION.md). These are review evidence, not pixel-perfect test baselines.

## Capture context

Captured November 19, 2026 at approximately 10:38 p.m. America/New_York (`2026-11-20T03:38Z`) from the first-creation working tree in a local production build served under `/arcade/`. The served bundles were `index-CUQPh3v2.js` and `index-CjxPPoGo.css`. See the repository's [delivery state](../../../DELIVERY-STATE.md) for source context and local checks; the review PR records published-head workflow results.

Playwright used headless Chromium with a fresh browser context for each viewport, device scale 1 and reduced motion. Phone contexts enabled touch and mobile emulation. The browser waited for local fonts and visible artwork to decode before capture. These JPEGs were captured directly by the browser at quality 86; the help image is an element capture of the entire inline panel.

The builder configuration was the deterministic `{ "version": 1, "mode": "unavailable" }` fixture. The visible “not connected” copy is intentional. No real generation provider or child account was used. The screenshots establish local browser presentation, not deployment, physical-device reliability or child comprehension.

## Selected views

| Image | Dimensions | Visible state |
| --- | --- | --- |
| [Desktop welcome](first-welcome-desktop.jpg) | 1280 × 900 | Optional Make / Explore invitation, with the ordinary navigation deferred until a choice. |
| [Phone welcome](first-welcome-phone.jpg) | 390 × 844 | Both first actions fit in the viewport; the heading is not styled as an input. |
| [Phone first idea](first-idea-phone.jpg) | 390 × 844 | Compact approved artwork, separate Send and Build actions, and optional guidance after the composer. |
| [Phone Journey help](journey-help-phone.jpg) | 366 × 658 panel within a 390 × 844 viewport | Four making steps, existing practice and scene-video routes, and optional tip reset. |

The same review also checked welcome, first idea, return, practice, play and change views at 320 × 740, 768 × 1024 and 1280 × 900. No horizontal overflow or browser runtime errors appeared. At 390 × 844, Send ended at y=653 and Build at y=734. The smaller 320 × 740 viewport uses ordinary vertical scrolling for Build. In game view, the guide followed the stage; switching to My ideas moved it into the visible conversation.

The full automated acceptance and compatibility results belong in the delivery record. These four compressed files keep the visual evidence small enough to review with the source.
