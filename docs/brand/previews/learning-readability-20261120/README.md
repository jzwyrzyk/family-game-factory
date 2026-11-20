# Learning readability review — November 20, 2026

These are captures from the actual production build, not design mockups. The test follows the visible welcome, parent settings, local Bubble Gum game and host-owned Language checkpoint. Synthetic profiles, deterministic local content selection and a checkpoint event are explicit test fixtures. No child data or provider calls are included.

- [Desktop question](english-question-desktop.png)
- [Phone question](english-question-phone.png)
- [Desktop hint](english-hint-desktop.png)

Captured application: `index-D1Z2cPgu.js` / `index-D6YgHrk3.css`, based on merged PR89 `669df0ef5e73e11c8786b741815ba290c820d326`. Selected disabled answers and used tiles have separate composed-state contrast checks. The [real app regression](../../../../tests/learning-readability-browser.cjs) and [composed surface matrix](../../../../tests/learning-surface-contrast.cjs) record the executable journeys.

The question and help use dark ink on their light surfaces, with the actual question first and no grade/purpose/assessment-note clutter. Back to Games remains visible. Tests also inspect Math and dark result cards; only the three directly relevant English captures are committed here.

These browser captures do not establish audio quality, physical-device acceptance or child comprehension. [Delivery state](../../../../DELIVERY-STATE.md) records the scoped checks and publication status.
