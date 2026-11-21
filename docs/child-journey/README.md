# Child journey — current entry and original integrated review

The current application opens the Studio experience by default. The accepted [first-creation journey](FIRST-CREATION.md) starts eligible first visits with a character choice, followed by creation, small contextual hints, a direct ready-result action, and useful return recommendations. The owner's [November 21 conversation-coach clarification](../decisions/2026-11-20-guided-chat-creation.md) requires children to develop their own answers through conversation, with no suggested-answer chips or choose-rest shortcut. New-game Build stays gated until the child's idea is coherent enough; the resulting handoff is focused and compiled build text stays out of chat. Extra tools remain expandable. The [homepage contract](../homepage/README.md) describes the ordinary library after the welcome. `?studio=1` remains an alias; `?arcade=1` and `?studio=0` deliberately select the legacy experience.

The sections below preserve the original Adaptive Math v1, Game Quality v1, and child-owned Studio integration review. Its source pins and evidence are historical. At that review the combined UI was opt-in; later homepage and first-creation decisions supersede that entry mode. Current release and verification claims belong in [delivery state](../../DELIVERY-STATE.md).

## First-release standard

A grade 1–4 child should be able to choose a game, understand its controls, play, receive useful math support, return to play, try a creative idea, and find that idea again. The interface should protect their work and leave the creative choice with them. A working journey is the engineering criterion; comprehension, enjoyment, and learning still require observed children.

### Benchmarks and what we adopted

These are documented product patterns and accessibility guidance, not evidence that copying an interface produces learning gains.

| Reference | Documented pattern | First-release choice |
| --- | --- | --- |
| [Khan Academy Kids: getting started](https://khankids.zendesk.com/hc/en-us/articles/360006764812-Parent-and-Home-Account-Users-Getting-Started-and-creating-an-account-with-Khan-Academy-Kids) | A prominent play entry, a separate child-selected library, and repeatable guide instructions | Playable choices in the first ordinary phone viewport after opening the library; a clear return action; no required coaching conversation before an existing game |
| [ScratchJr interface guide](https://sites.bc.edu/scratchjr/learn/) | Immediate experimentation, reset, undo/redo, and project saving | Retain independent tests and earlier versions; opening a test never chooses it as the main game |
| [Minecraft Education accessibility](https://edusupport.minecraft.net/hc/en-us/articles/360061503031-Accessibility-Features) | Consistent accessibility settings and device-specific input hints | A visible How to play action; short touch or keyboard guidance derived from the game actually being viewed |
| [Xbox Accessibility Guideline 116](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/116) | Sufficient time to understand non-game UI; important information can wait for the player | Math, help, errors, and ready previews wait for an appropriate child action; a background build does not replace the active game |
| [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Assistive technology can announce important state changes without taking focus | Visible and announced save/build/error states; explicit help gets meaningful focus; ordinary background status does not move it |
| [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | AA minimum is 24 CSS pixels with stated exceptions; larger targets can help | A 44 CSS pixel product target for primary child controls, checked in the phone journey; this is not a claim of complete WCAG conformance |

## What changed

### Entering and returning

The original library put games and the last project before promotional copy. Current [return guidance](FIRST-CREATION.md#return-priority) additionally prioritizes ready and unfinished creative work. A compact player switcher keeps the current owner visible. Playing an original does not create duplicate visible cards; a meaningful experiment still creates a recoverable project. New ideas, playable games, builds, and ready tests have distinct labels.

In a game, Play, Change my game, and How to play are prominent. Undo, Redo, versions, and copying are under More game tools. Math presentation choices remain available in a disclosure, with no Off choice. Grade and learning settings remain in the grown-up area.

Game, My ideas, and My tests are the mobile panels of the same project. Tools stop the live game while preserving a bounded static native scene or a named remote placeholder. Returning uses the selected test or historical version. Construction is restored from its saved build. Action rounds restart; the UI does not claim universal mid-frame resume for design tools. Required math uses the runtime's actual pause/resume path instead.

### One demanding activity at a time

Versions, copying, help, and design tools cannot hide an active math question. The host can bring the existing activity back into view without creating another attempt. The child can still leave for My Games or switch profiles; this records an interruption and does not invent a success.

Math initially focuses the visible question heading, avoiding an unsolicited mobile keyboard. An explicitly requested hint or worked example receives a visible, described focus target. Automatically offered hints announce their reasoning without taking answer focus. Back to my answer returns to the same activity. Completion returns to the same game context or meaningful round result; disposed activities cannot reclaim focus.

Optional reflection follows the required math result and may be skipped. Coaching pause/help preferences do not remove math or alter the learner's grade.

### Protecting creative work

A background build saves an independent test and exposes Try your ready test. It does not autoplay, promote the test, replace the selected test, or clear a newer draft. The durable job record stores the revision identifier, never a signed preview capability. The legacy builder follows the same explicit-ready principle when a result could interrupt an existing preview.

Coaching replies preserve text typed while a reply was pending, including text that was changed and retyped identically. Game-plan fields autosave separately, preserve child/helper attribution, and do not approve the entire plan. A late reply cannot overwrite a newer child decision.

Failed saves keep typed text visible. Navigation/profile changes that would discard an unsaved draft are stopped with a concrete explanation. Library errors are visible on the library, rather than written into a hidden Studio. A successful retry can persist the exact draft. Saving remains distinct from promotion and public sharing.

## Connecting the learning and game-quality branches

The physical workshop and Junkyard Rally use the same learner, grade bounds, pacing budget, hint policy, and evidence as other games. Native host pauses are separate from a player's manual pause: answering math cannot override a deliberate pause, and game keys cannot resume a simulation behind a question. Both longer active play and eligible completed attempts can reach the host checkpoint.

The current tablet controls are included: larger pedals and part controls, a previous/next piece selector for small or overlapping construction pieces, landscape stages that leave room for controls, and held Space driving when the game canvas has keyboard focus. Touch and keyboard controls retain the same host learning pause. Tablet evidence is browser emulation in portrait and landscape; actual family hardware remains part of the observed review.

The trusted generated player now advertises learning protocol 1 and validates the parent channel/artifact connection. Round identifiers, pause/resume, input cleanup, and active-play checkpoints connect generated v2 physics games to the existing learning service. The new immutable runtime archive is `quality-runtime-v2.0.3`; older archive bytes are retained. A saved renderer that cannot advertise the required protocol stays unavailable behind an update message rather than opening a math-free game. Frontend and reviewed trusted runtime must therefore be released together.

The parent owns questions, answer evaluation, and learning history. The generated worker receives no learner name, history, or answer authority. Existing sandbox, source/hash, resource, and paid-activation gates remain in place. This is reviewed code and fixture validation, not proof of a provisioned production worker or live model operation.

## Engineering evidence

See [acceptance](acceptance.md) for exact checks and remaining human validation. The CI workflow runs the original arcade/security/revision journeys, the learning suites, and the quality/Studio/coach/child journeys. Every required suite remains a gate. Independent jobs collect screenshots even when another suite fails.

Source integration starts from:

- Adaptive Math: `69f50387842e0943ad2e3a83a988247eb2fcb97d` (draft #19).
- Game Quality: `4ed8595697c55edb6bbb5a2c94fcc66da0ef5fa7` (draft #20, including the tablet controls added after its `562d5ba` continuation).
- Both include the merged Studio/design-coach work on main `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`.

This branch resolves the overlap and adds the journey changes above. Earlier branch reports remain historical evidence, not validation of this combined tree.

## Deliberate boundaries

The practical v1 uses deterministic navigation and learning, local game simulation, ordinary browser storage, and the existing optional builder/coach transport. It adds no new AI dependency.

Read-aloud, voice input, cross-device conversation sync, and universal design-time mid-round resume were not delivered by the original integration batch. Later [voice](../issue-28/PUSH_TO_TALK_MVP.md) and [homepage](../homepage/README.md) decisions supersede the old voice/entry description; this history does not limit their current source scope. Device screen readers can use the focus and announcement markup; a real screen-reader review is still required. The grade range remains bounded supplemental practice, not a complete certified curriculum.
