# A game stays on the screen

**Owner request:** November 21, 2026. Games need a consistent, child-friendly play view that does not disappear when the page scrolls, with a clear exit and an explicit fullscreen option. This is the feature contract for the [profile, play and reading decision](../decisions/2026-11-21-profile-play-and-reading.md). Source implementation and browser acceptance are separate evidence.

## Shared boundary

[`installPlayView`](../../src/studio/play-view.ts) owns one fitted boundary around Studio's playable host. Native favorites, saved revisions and sandboxed generated games all enter it after a playable mount. Entering from a card far down My Games brings the game into view immediately. The host uses the available visual viewport; the outer document cannot scroll during play. A dedicated play header replaces the global header, redundant Play button and duplicate Game/Ideas/Tests tabs. My Games returns to ordinary navigation. The existing player picker remains available inside More, using the same owner-change handlers.

The local play header always includes **My Games** and **Full screen / Exit full screen**. Active-play actions use short **Change**, **Help**, **More** and, when appropriate, **Keep** labels with complete accessible names. Learning options, picture/scene tools, background builds and the player picker appear inside More during play and return to their ordinary places on exit. A ready background result adds **ready** to More without opening the result or interrupting play. More is a bounded, viewport-positioned panel; its buttons and contained player choices remain reachable by keyboard. Escape closes More and returns focus to its summary.

Changing a game, opening help, choosing versions, leaving for another page or changing profiles uses existing disposal and learning guards. Disposal exits fullscreen, restores prior document scrolling and restores the ordinary tools. The `factory-page` listener also releases the view when a legacy or learning-host route leaves directly. These changes do not save a favorite, select a version, clear learning evidence or reset a required checkpoint.

## Fullscreen and learning

The fullscreen request happens directly in the child's button interaction. Its target includes the game, navigation controls and trusted learning overlay. Only the browser decides whether native fullscreen is available. A refusal or missing API leaves a usable expanded view and a short truthful notice. The same exit button collapses that fallback; Escape does so when focus is in the host. Escape first closes an open More panel. Native fullscreen exit is reflected through `fullscreenchange`, including browser Escape.

A pending fullscreen response cannot reinstate a session after disposal. The child can leave an unanswered required learning activity through the existing visible exit. Expansion preserves the same active attempt and the game's paused/inert state. No orientation lock is imposed, and iframe readiness/height messages cannot bypass the bounded host or learning authority.

## Game adapters

| Surface | Adaptation |
| --- | --- |
| Dragon and Buckets | A scoped shadow-root adapter measures the remaining height, preserves the real canvas ratio and reserves room for touch controls. The original native engines and saves remain in use. |
| Hill and historical physics construction | The renderer redraws for its actual fitted stage height. An opened garage or tool collection may scroll within the game. |
| Sticker construction | The invention scene remains beside or above a bounded sticker tray. The tray can scroll to every sticker and GO control without moving the scene. |
| Moon and Robot favorites | The canvas shares a flex layout with real-size controls; compact landscape layouts put controls alongside the scene. |
| Generated previews | The sandboxed iframe fills the same host. Its previously supported preferred-height messages cannot expand a playing page. |
| Required learning, help and long menus | Content stays readable and scrolls inside its own bounded panel. The legacy Language overlay uses the real game boundary while in fitted play, so its exit cannot slide under an unrelated header. No whole-page CSS scale shrinks the controls. |

Complex or historical games still retain a contained host scroll fallback. It is not acceptance evidence that their essential canvas and controls fit: those must be checked separately. The Buckets intro's obsolete fixed grade caption was removed; the host already owns that game's learning questions and profile grade.

## Acceptance and remaining evidence

`npm run test:play-view` uses real production native game mounts and an unavailable remote configuration, with synthetic local profiles. It must run after `npm run build`. It checks all seven favorite entries at 1280×900, 390×844, 320×667, 844×390 and a 640×450 CSS layout with 2× pixel density. The last case represents the layout space of a 1280×900 window at 200% zoom; it does not operate the browser's own zoom control.

The checks cover the host **and the actual canvas/scene and essential touch-control bounds**, readable primary actions without scrolling, contained sticker-tray access, no outer scrolling, visible exit/fullscreen targets, More hit-testing and keyboard access, player-menu containment, denied fullscreen/Escape, return from editing, rotation, and an unanswered real host-learning checkpoint. Independent game/viewport failures are collected with separate captures, followed by trusted Home cleanup; a failed case is not retried or silently reset. The dependent fullscreen/editing/learning journey runs separately. Geometry is asserted after mounting and two animation frames, rather than waiting for an invalid layout to become correct. Success and failure captures go to `test-results/play-view/`. The generated fixture in `tests/studio-journey.cjs` requests a 1,000px height and checks the iframe boundary on desktop, portrait and landscape.

Local Chromium execution was blocked before page load by the environment's socket restriction. Initial hosted candidate `fbe248662e95c68be44b5a121c9fdfa85590cbeb` passed the seven desktop and seven 390px game cases, then failed the 320px factory basket bounds. Its actual captures also exposed unnecessary navigation, cramped actions and a Language exit behind the header. Those observations led to the dedicated header, contained Language overlay and short-landscape factory positioning described above. The construction footer's functional controls were restored after a separate journey exposed their accidental hiding. The current revised layout still requires hosted execution and capture review; earlier passes do not establish this candidate's geometry.

In particular, short landscape scenes, 320px wrapping, legacy canvas text and every later factory stage still need rendered inspection. Existing native gameplay, touch, learning, continuity and sandbox suites remain applicable. No physical-device fullscreen, iOS browser-bar behavior, screen-reader, real browser zoom or child usability acceptance is claimed by these fixtures.
