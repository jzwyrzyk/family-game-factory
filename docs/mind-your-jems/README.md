# Mind Your Jems! — Play while you wait

A **pre-built, no-network, no-LLM** Jems mini-game that appears **only when a Studio build has a durable job acknowledgement**. This is deliberately separate from user-created games: it does not run generated code, alter a project, bypass an admission/consent check, or send mined-gem activity to any service.

## Child experience

1. **Mine:** Tap or keyboard-activate a faceted crystal on the friendly rock head. Most crystals are worth 1 Jem; gold is worth 3. The bag holds 8.
2. **Bank:** Tap **Bank my Jems** or the minecart to deposit carried Jems. Banked Jems survive all shakes.
3. **Notice:** Every ~11–18 seconds the rock head looks up and gives a 3.6-second big-idea warning; bank and tap **Grab the hair!**.
4. **Shake:** The head shakes for ~1.25 seconds. All *unbanked* Jems fly away, even when holding on. Grabbing saves the miner from a funny slide, not the cargo. There is no death or pay-to-recover mechanic.
5. **Continue:** The game loops, celebrating each 25 banked Jems without falsely promising a new AI-built game. A real confirmed playable revision enables **Play my game** immediately.

Visual vocabulary: existing approved \`public/jems-logo.svg\` (faceted gem, wrench, lowercase wordmark), ink \`#0B1E3B\`, blue \`#2E6BFF\`, purple \`#8B5CF6\`, coral \`#FF5E7A\`, gold \`#FFC24D\`, mint \`#22D3A6\`. All art is inlined SVG/CSS, not a static mockup. Support pointer/touch and keyboard activation, Android tablet portrait/landscape, and reduced-motion preferences.

## Integration boundaries

- The Studio build must already have \`job.status\` queued/building/testing to offer the launch. It is **not** available solely because the child typed an idea or clicked Send.
- Studio's existing \`readyExperiment\` check is authoritative for \`Play my game\`. The mini-game's score does not change readiness.
- Background polling, cancel, profile isolation, pending experiments and generation/preview controls remain in Studio. The arcade displays *observed phases* and never invents a percentage or completion time.
- Native \`<dialog>\` provides an explicit close path (button or Escape); opening the arcade must not send any extra builder request. Closing or leaving preserves the original build and keeps mini-game scores ephemeral.
- A profile change closes the modal, clears its in-memory scores, and prevents cross-profile previews.
- Existing logo assets ship with the app; **no third-party SDK, analytics, cookies, new storage keys, AI calls or new permissions**.

## Acceptance and tests

\`npm run build\` and \`npm run test:unit\` include deterministic banking, capacity, warning, grabbing, shake loss and accounting invariants in \`tests/mind-your-jems.test.ts\`.

\`npm run test:studio\` runs \`tests/mind-your-jems-browser.cjs\` against the real bundled Studio with mock API results. Tests cover three viewport classes, actual launch from an acknowledged job, real logo loading, mouse/touch-ready buttons and keyboard, banking, no preview request while playing, score reset, no invented readiness, and a deliberate handoff only after a confirmed finished revision.

## Release strategy

Feature PR only. No production deployment or child activation implied. Re-run full workflows and manual device smoke tests before merge. Subsequent art/animation passes can replace SVG visuals without affecting the pure game rules or build gates.
