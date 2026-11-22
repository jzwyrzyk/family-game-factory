# Studio-first homepage — product rationale and acceptance

## Decision

Make the Studio library the default at `/`. Keep `?studio=1` as a backward-compatible alias and `?arcade=1` / `?studio=0` as deliberate legacy compatibility and rollback paths. Legacy mode includes a visible **Open current Jems** link back to the modern experience. It removes the active legacy mode flags while preserving unrelated query parameters and the URL hash. This is a **frontend-only change**. Do not change the local game engine, child-specific storage, learning cadence, conversation privacy gates, existing version history, Cloud Run deployments, or paid AI access.

The [first-creation decision](../decisions/2026-11-19-first-creation-journey.md), refined by [the November 20 direction](../decisions/2026-11-20-character-first-navigation.md), begins eligible first visits with **Choose your character** and **Let’s create**. Selecting Spark or Nova saves a cosmetic owner preference; Continue opens the existing composer. Ready-made play is offered during an acknowledged build instead of as a competing opening action. The normal phone-viewport playable-choice requirement below applies to the ordinary library. Prior meaningful work and explicit direct entrances remain accessible; choosing a character or completing the welcome does not count as completing a creation.

See the [first-creation contract](../child-journey/FIRST-CREATION.md) for small contextual hints, Journey help, **Done for now**, and the return priority. A ready requested result takes precedence over the ready-made game played during its build; unfinished creative work takes precedence over ordinary recent play. The action rechecks current saved state and owner before opening it. The same hint preferences travel in existing notebook backups and can be reset independently of work and progress.

The [Notifications contract](NOTIFICATIONS.md) supersedes the former duplicate build shelf: one Home card links to all pending/review work, with unread badges in the card, Menu and game More. The [consolidation decision](../decisions/2026-11-22-unified-game-notifications.md) keeps this source after shell and Conversation Coach rollout, before the separate gameplay overhauls.

## Child mental model

1. **I have an idea:** “Invent a game” opens the existing conversational Studio. Talking or saving an idea must not imply a build was completed; “Try a change” remains separate.
2. **I want to have fun now:** four Ready to Play jems (Factory, Mining, Bubble Gum and Rally) and two Original jems (Dragon and Buckets) are playable from whole-card targets. Saved authored Moon/Robot games remain supported without default tiles.
3. **I already started something:** a compact, recognizable Continue row prioritizes ready results and unfinished creative intentions before ordinary recent play. Saved creations remain selectable and segregated by the active player; an archived or dismissed-resume item is not recommended.
4. **I want to keep exploring:** the Studio's My Games button always returns here. My Powers and family settings remain available, without becoming competing first-screen calls to action.
5. **Something takes time or is unavailable:** the single continuation card and Notifications page keep pending work discoverable without interrupting play; the homepage never promises new AI builds when the private builder is unavailable.
6. **I want an earlier idea or drawing:** **Saved ideas & drawings** opens the retained collection, with an explicit **My Games** button to return.
7. **I have a picture:** **Art Studio** sits beside **Invent a game** before the catalogue. It opens the current player's upload, camera, drawing and reusable-art space. An unavailable online builder does not block this local destination.

## Saved ideas and drawings remain reachable

The ordinary shell has **My Games**, **Create** and a labelled **Menu**. The menu groups **Create & code** and **Art Studio** under Make; **Notifications**, **My journey**, **My rewards** and **My Pals** under Your world; **My Powers**, **Try an idea** and subject choice under Learn & explore; parent dashboard and **Private parent session** under Grown-ups; and Journey help under Help. Parent access and help remain visible during first character selection. Existing route handlers retain their save and learning guards. **Saved ideas & drawings** is a supporting action on the homepage, below the Continue area. It opens the existing My Creations page through the guarded Studio navigation; it does not require a legacy URL or replace the modern navigation.

Preserve the collection's existing ownership semantics. **Our idea notebook** remains shared among family profiles, including older ideas without an assigned profile. **My drawings** remains specific to the current player. Modern Studio games continue to use their existing per-player notebook and revision storage. Restoring this route does not migrate records, assign ownership to older ideas, or change their stored text.

Entry saves pending Studio and Creation work before changing the visible page. A save failure keeps the current work visible and recoverable. The existing learning guard and page lifecycle still control transitions. Focus moves to the collection heading on entry and to the homepage heading on its **My Games** return. Changing players keeps the existing return-home behavior; reopening the collection shows that player's drawings alongside the shared family ideas.

The source owners remain the [Studio navigation](../../src/studio/ui.ts), [original idea notebook](../../src/legacy/ui.js), and [private drawing controls](../../src/assets/ui.ts). The collection can be empty without hiding its drawing upload or return action. Its light-panel descriptions and empty-state copy use the existing muted brand ink; the dark notebook cards retain their light text. The default-mode regression checks computed text contrast of at least 4.5:1 for both surfaces.

## Visual design system

- Single dominant violet create surface; calm lilac/blue ambient background; white supporting cards with gentle shadows.
- Scannable five-to-seven-word phrases and short verb-led actions, not a separate form, Remix navigation, or parent-facing jargon on the first screen.
- Full-card color-coded native artwork/illustrations; titles are text, never image-only. No autoplay sound, moving hero, loading gimmick, or external font/image trackers.
- Balanced 3-column favorites on desktop, 2-column at common mobile widths, single column only on very narrow screens; contextual Continue surface only with saved work.
- Keyboard-visible high-contrast focus, 44px+ essential touch targets, reduced-motion support, no horizontal overflow at 390px, no stolen focus when build finishes.

## Research-grounded choices

- Nielsen Norman Group, [Children’s UX](https://www.nngroup.com/articles/childrens-websites-usability-issues/): children aged 6–8 differ substantially from 9–12, and redundant navigation and long reading burdens are especially problematic.
- Nielsen Norman Group, [Homepage design principles](https://www.nngroup.com/articles/homepage-design-principles/): simplify first-screen decisions and make the value and primary action obvious.
- Nielsen Norman Group, [Visual design principles](https://www.nngroup.com/articles/principles-visual-design/): use scale, contrast, proximity and balance to organize attention.
- W3C [WCAG 2.2](https://www.w3.org/TR/wcag/): minimum target-size and focus guidance; this implementation intentionally targets larger, 44px actions for child touch use.

## Automated and manual gates

- `npm test` must pass at the exact PR head, including the `tests/homepage-entry.cjs` contract, existing Studio/voice/continuity/learning/game suites and explicit old Arcade regression tests.
- After building the production bundle, run `npm run test:navigation-continuity`. The [default-mode regression](../../tests/navigation-continuity.cjs) covers desktop and 390px entry/return, preserved historical family ideas, player-specific drawings, reload, empty collections, draft-save failure/retry, all retained modern destinations through the compact shell, and a visible exit from both legacy modes. It uses synthetic local records and unavailable provider configuration; it does not establish live-service, physical-device or child acceptance.
- Inspect `test-results/navigation-collection-desktop.png` and `navigation-collection-phone.png` for the restored collection. The regression also captures a failure screenshot if a journey fails. Legacy-only feature tests remain useful, but do not prove discoverability from the normal homepage.
- Inspect `test-results/homepage-desktop.png` and `homepage-mobile.png` at real rendered viewport sizes, including two-column card widths, typography wraps, contrast, dropdown layering, and visible scroll affordances.
- Manually check keyboard only, VoiceOver/TalkBack, iPad portrait/landscape, small Android, 200% zoom, two child profiles, local storage full/denied, poor/offline network, parent controls and game exit.
- Actual children aged 6–8 and 9–12 should attempt unaided: **play a favorite**, **invent an idea**, **continue an existing game**, **return to My Games**. Observe mis-taps, wrong navigation, first-action latency and interpretation of build availability; automated screenshots do not establish age appropriateness.
- No merge without clean CI and owner visual review; no Pages deployment without a separate intentional action. Rollback: restore preceding main, or visit `?arcade=1` while investigating. No backend release is part of this work.

## Discoverable Math and English practice

**Menu → Learn & explore** has the compact **Learning adventure** Math/English control when **Both — child can switch** is enabled. The grown-up chooses Math only, English only or Both. **My Powers** also displays the subject choices before voluntary practice, with switching disabled when the parent selected only one subject. Subject switching is disabled while a question is active. Switching selects the subject for future questions, is saved to the current child profile, survives reload, and does not reset separate learning records or the shared required-checkpoint budget. Parent Controls display both subject reports when Both is enabled.

Both means children can **choose** the next subject; there is no forced alternation, no Off mode, and no new claims of curriculum completeness. Existing profiles retain their previously chosen subject and restriction until a grown-up enables Both.

In Studio gameplay, the same subject choice is available under **More → Learning in this game**. Outside active play, the collapsed learning options return below the preview. It changes the *next* eligible checkpoint, not a currently open activity, and leaves game simulation state untouched.

## Games stay in view

The November 21, 2026 owner request adds one bounded play view for every game opened through Studio, including saved versions, native favorites and private generated previews. Opening or explicitly returning to a playable game brings it into the available viewport. Outer page scrolling is locked for that play session. A dedicated header offers **My Games** and **Full screen**, with **Change**, **Help** and **More** below it. More contains learning, picture/scene tools, versions, background builds and the existing player picker. Editing, leaving, profile changes and other page transitions restore the ordinary header, tools and scrolling. This changes presentation, not game saves or required-learning decisions.

**Full screen** requests the browser API from the child's explicit tap and targets the whole Studio page, so the visible exit and trusted Math/English overlay remain with the game. Browsers that deny or do not support the API use the same page-filling expanded view and say so. **Exit full screen** works for both modes; Escape closes the fallback when focus is in the host. Browser-native Escape is reflected through `fullscreenchange`. No orientation lock is imposed. Mobile browser-chrome changes and rotation resize the play area.

The native adapters size their real scenes within that area. Recovered shadow-root games keep their canvas ratio and visible touch row; physics games redraw at the actual stage height; sticker-building keeps the scene visible while its tray can scroll. Long help, learning cards, expanded garage tools and small/zoomed layouts keep contained scrolling instead of shrinking readable controls. Generated frames fill the bounded host; their reported preferred height cannot enlarge the outer page. Existing iframe sandboxing, readiness handshake, pause and learning authority remain unchanged.

The [fitted-play contract](PLAY_VIEW.md) records lifecycle behavior, game adapters, exact desktop/phone/320px/landscape/zoom-layout cases and remaining visual limits. The browser regression checks actual scenes and controls as well as host bounds, scrolling, More keyboard/hit access, fullscreen fallback and learning. The generated-transport fixture requests a 1,000px iframe. These fixtures do not establish physical-device fullscreen, generated-game quality or real-child acceptance. Local browser launch for this candidate was blocked by the environment's socket restriction; hosted execution and visual review of its captures remain required.
