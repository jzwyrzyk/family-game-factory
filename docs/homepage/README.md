# Studio-first homepage — product rationale and acceptance

## Decision
Make the Studio library the default at `/`. Keep `?studio=1` as a backward-compatible alias and `?arcade=1` as a deliberate, non-advertised legacy rollback path. This is a **frontend-only change**. Do not change the local game engine, child-specific storage, learning cadence, conversation privacy gates, existing version history, Cloud Run deployments, or paid AI access.

## Child mental model
1. **I have an idea:** “Invent a game” opens the existing conversational Studio. Talking or saving an idea must not imply a build was completed; “Try a change” remains separate.
2. **I want to have fun now:** six illustrated developer favorites are all genuinely playable, each whole card clickable, in a predictable 3-by-2 desktop / 2-by-3 mobile layout.
3. **I already started something:** a compact, recognizable Continue row appears only when real saved work exists. Saved creations remain selectable and segregated by the active player.
4. **I want to keep exploring:** the Studio's My Games button always returns here. My Powers and family settings remain available, without becoming competing first-screen calls to action.
5. **Something takes time or is unavailable:** the existing nonmodal build shelf preserves play during an actual pending build; the homepage never promises new AI builds when the private builder is unavailable.

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
- `npm test` must pass at the exact PR head, including the new `tests/homepage-entry.cjs` contract, existing Studio/voice/continuity/learning/game suites and explicit old Arcade regression tests.
- Inspect `test-results/homepage-desktop.png` and `homepage-mobile.png` at real rendered viewport sizes, including two-column card widths, typography wraps, contrast, dropdown layering, and visible scroll affordances.
- Manually check keyboard only, VoiceOver/TalkBack, iPad portrait/landscape, small Android, 200% zoom, two child profiles, local storage full/denied, poor/offline network, parent controls and game exit.
- Actual children aged 6–8 and 9–12 should attempt unaided: **play a favorite**, **invent an idea**, **continue an existing game**, **return to My Games**. Observe mis-taps, wrong navigation, first-action latency and interpretation of build availability; automated screenshots do not establish age appropriateness.
- No merge without clean CI and owner visual review; no Pages deployment without a separate intentional action. Rollback: restore preceding main, or visit `?arcade=1` while investigating. No backend release is part of this work.
