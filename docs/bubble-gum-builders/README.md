# Bubble Gum Builders: objects, gum and adventures

**Owner direction:** November 22, 2026, America/New_York. Preserve the appealing illustrated game, make gum physically join recognizable objects, add meaningful variety and construction, and let children enjoy the moving invention. This is the implementation contract; [delivery state](../../DELIVERY-STATE.md) records its actual verification and release.

## The play loop

Choose a recognizable object, place it on its matching blueprint outline, and seal its join with gum. The first object is the body. Every later object needs an already connected parent and one gum join before the next part is offered. The gum is drawn across that particular seam and travels with both objects. A disconnected build cannot launch.

Each build starts with ten gum pieces. A wrong object, repeated tap, or invalid join consumes nothing. Undo restores the previous exact state, including gum. Changing a parent removes its attached subtree and returns those connectors; unrelated parts stay. Two suitable objects per role create visibly different inventions. Extra silly pieces add actual nonmatching objects, while matching highlights offer optional support. These choices are separate from the host's learning grade.

A wiggle test shows loose pieces wobbling and a connected invention moving together without ending a round. The authored connection graph supplies the structural rules; this engine does not claim a force simulation. The saved physical workshop remains a different engine.

## Variety and progression

Thirty local SVG object drawings cover bottles, cans, boxes, cups, a teacup, sponge, sneaker, funnel, spoon, fork, ruler, straw, balloon, fan, cap, CD, toy wheel, button, paper wing, paper sail, craft stick, spring, comb, sock, brush, bowl, basket, cork, carton and cardboard tube. Tray and invention use the same drawings; the assembly frame crops transparent margins and turns elongated parts to fit their role.

| Build | World |
| --- | --- |
| Rocket Pop | Sky |
| Bubble Sub | Sea |
| Silly Bot | Stage |
| Sneaker Scoot | Road |
| Teacup Glider | Sky |
| Sponge Sailor | Sea |
| Tin-can Taxi | Road |
| Kitchen Drummer | Stage |
| Balloon Buggy | Sky |
| Spoon Fish | Sea |
| Ruler Roller | Road |
| Basket Boogie | Stage |

The deterministic rotation visits all twelve without an immediate repeat. The first three builds use five objects; the next three use six, then seven, then eight. All larger prefixes remain valid inventions with at most seven of the ten gum pieces consumed. Later cycles retain eight parts and vary the stable choice order/decoys. Saved progress always reopens its exact blueprint, objects and gum colors.

## Give the invention time on screen

Launch starts a 24-second authored adventure with four scenery moments. The assembled invention stays in view; the background and bounded motion provide travel. A large context action adds a visible hop, swoop, spin or bubbles effect. No precision steering, reaction deadline or failure is required in the showcase.

After the adventure the invention remains on screen. Watch again repeats the adventure; Change pieces returns to the intact build; Next build is an explicit finish action. Replay and the wiggle test emit no host result. A completed build is reported once, and a failed completion-receipt save keeps the result pending until the child retries. The native host retains its existing result and required learning flow, followed by Next level. Editing an unreported completed invention requires another completed adventure before reporting.

Reduced motion keeps the same 24 seconds and explicit controls, using calm scenery and stationary construction instead of shortening the payoff. Pause stops the animation clock, input and drag. Background time cannot finish a ride. Leaving removes the animation frame, observers and input/visibility handlers. The shared My Games exit and fullscreen controls remain available.

## Input and layout

Tap an object then its outline, drag it to the target, or use Tab/Enter. Selecting a piece focuses its placement target; placing it focuses the real join. The current step and a small tray fit beside or beneath the scene. Necessary labels stay at least 18px, instructions at 20px, and controls at least 48px. More pieces pages through additional choices three at a time, preserving drag and ordinary tap use without trapping touch scrolling. The invention stays in view. See [clear at six](../brand/CHILD_INTERFACE.md) and [the common play view](../homepage/PLAY_VIEW.md).

## Runtime and saved-data compatibility

New defaults use `qualityVersion:3`, implemented in `src/games/bubble-gum-builder.ts`, `bubble-gum-rules.ts`, `bubble-gum-art.ts` and the scoped CSS. The new validated `gum-assembly-v1` record lives in `constructionStates[stateKey].assemblyConstruction`. The registry captures the owning profile and preserves the prior record on save failure.

Existing version 2 uses the unchanged sticker game and `stickerConstruction`; version 1 retains physical play and `qualityConstruction`; missing version keeps the older engine. The three named persistence domains coexist, including when a legacy engine writes. This is a new default, not an automatic rewrite of saved revisions. Unknown assembly records are preserved and blocked; an explicit session-only play option does not overwrite them.

The Ready to Play Bubble Gum card opens an existing version 3 starter session, or creates a separate version 3 project when a child has only an earlier starter. Earlier starter sessions remain reachable in **My jems**, labelled **Sticker workshop**, **Machine workshop**, or **Earlier workshop**. Their names, revisions, play state, conversations and experiments remain unchanged. Reopening those saved cards keeps their recorded engine; returning to the current catalogue card resumes the new assembly project rather than creating another copy.

Supported local assembly edits are matching highlights and extra silly pieces. Gravity, thrust, joint strength and gum-budget edits are rejected for this guided engine; they remain meaningful in the physical workshop. No local edit silently changes engines. Native server/worker consumers of the manifest need a compatible source before accepting version 3 as an AI edit base. This change itself changes no worker pin or backend configuration.

## Acceptance evidence

The pure rules suite covers all twelve recipes, both alternatives and four progression sizes (96 combinations), invalid placement, connected-parent rules, all gum colors, exact undo snapshots, subtree recovery, deterministic choices, progression bounds, schema/prototype validation, reporting and replay semantics. Browser acceptance covers real input, loose/solid wiggle tests, normal-motion duration, all families, replay, child-chosen completion, saves and recovery, legacy isolation, pause/exit and the fitted player at desktop, tablet, phone, narrow phone and landscape sizes.

Run `npm run test:bubble-gum` for focused rules/browser checks. The dedicated workflow preserves captures and video, including on failure. The ordinary shared-player, rewards, maker-journey and local-edit fixtures also exercise the new default. A passing build or automated test does not establish child enjoyment, physical-device usability or educational improvement; owner play remains separate evidence.
