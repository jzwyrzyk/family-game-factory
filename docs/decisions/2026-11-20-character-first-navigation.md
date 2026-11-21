# Character-first entry, compact navigation and private parent access

**Status:** Accepted for implementation; source review and production acceptance remain separate.
**Recorded:** November 20, 2026 (America/New_York).
**Decision source:** The owner reviewed the deployed site, requested simpler mobile navigation, the existing girl/boy-style human characters as the first choice, no competing invitation to play before creating, and a discoverable private parent session for testing. The owner then authorized all four fixes and specified that the selected character must propagate across all site imagery. This direction was given in the development conversation.

## Context

The eight-destination header made the phone shell crowded. The welcome offered creation and Explore first before establishing the child's character. Human-maker imagery could show both characters outside the chooser. The gated Adult profile entry disappeared when browser connection or deployment readiness was missing, leaving the tester without an explanation or route to recovery.

## Decision

- Keep **My Games**, **Create** and a labelled **Menu** as the ordinary primary navigation. Group existing creative tools, progress, learning, parent and help destinations in a native modal drawer. Reuse existing route handlers and save/learning guards. On phones, avoid covering game or editing controls with fixed navigation.
- Begin eligible first visits with the approved **Spark** and **Nova** human-maker cards and one **Let's create** continuation. The two characters are equally capable cosmetic choices; do not label, infer or store gender. A successful character save enables Continue but does not create a project, submit work or grant rewards. Continue opens the existing idea composer.
- Remove the Explore-first invitation. Existing ready-made play remains useful after an actual acknowledged build; an explicit ready action opens the child's result. Returning work and intentional direct tool entrances retain their existing behavior.
- Render only the active owner's chosen human across host profile, home imagery, Journey/rank cards and celebrations. Use neutral gems before selection outside explicit choosers. Changing the choice updates the host without resetting work or replaying rewards. Gem Pals, the Gem brand helper and child-authored game imagery retain their separate identities.
- Keep **Menu → Grown-ups → Private parent session** available from the first screen, plus a Parent Settings entry. Explain missing configuration, disconnected browser, disabled testing, approval/renewal and access-check failures. The existing passphrase-backed adult switch remains the only unlock; display conversation, building and dictation readiness separately.

## Consequences and limits

This supersedes the Explore-first and avatar-optional opening in the [earlier first-creation decision](2026-11-19-first-creation-journey.md). It preserves optional contextual guidance, explicit Send/Build/Keep, owner isolation, real saved-state recovery, meaningful return and the no-focus-theft ready-result handoff. A child can explicitly open the ordinary library after selection without creating a throwaway project. Established profiles and direct entrances are not forced into a new setup tour.

The drawer adds one step to secondary destinations while keeping the two main tasks visible. Its labels, focus behavior, small-screen targets and routes require browser and visual checks; automated viewports do not establish actual-device or child comprehension. Reconsider the grouping if observed use shows a frequent task is unnecessarily difficult to find.

The parent entry changes discoverability, not authorization. It creates no backend flag, permit, provider approval, secret, paid action or new website. The [temporary adult-session decision](0005-temporary-adult-profile.md), trusted-device controls and isolated adult workspace remain authoritative. Real production game generation still requires evidence from the deployed configuration and an authorized bounded adult journey.

## Implementation and evidence

- [First-creation contract](../child-journey/FIRST-CREATION.md)
- [Homepage and navigation](../homepage/README.md)
- [Maker imagery and progress](../brand/GEM_PROGRESS.md)
- [Adult access and production acceptance](../adult-pilot/VOICE_RELEASE_AND_UAT.md)
- [Architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery state](../../DELIVERY-STATE.md)
