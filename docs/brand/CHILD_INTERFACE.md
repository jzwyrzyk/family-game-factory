# Child interface: clear at six

**Accepted direction:** November 20, 2026. The owner requested fewer words, consistently readable text for a six-year-old, and a warm, upbeat female reading voice. This contract applies to new work and revisions. It states the product target; [delivery state](../../DELIVERY-STATE.md) records which surfaces have actually been checked.

## Put the next action first

Use a clear heading, the object being chosen and a short action label. Add one short instruction only when the next action would otherwise be unclear. Remove redundant eyebrow labels, grade/skill metadata, repeated taglines, generic encouragement and repeated save notices from the active task. Enlarging unnecessary copy does not reduce reading load.

Keep the actual question, necessary passage or diagram, answer controls, useful status, and optional help. Parent-level assessment explanations belong in Grown-ups. For example, listening support must still be recorded correctly without placing an explanation of independent-reading evidence beside the child's Read this to me button. Longer directions can live behind clearly named Help or More controls. Real errors and recovery actions must remain visible and understandable.

### Creation is a guided conversation

The owner's [creation refinement and November 21 clarification](../decisions/2026-11-20-guided-chat-creation.md) make the ordinary new-game screen **a conversation coach, one input and useful action buttons**. The coach responds to what the child actually says and asks one useful open question when more understanding is needed. The child supplies the creative answer through typing or reviewed dictation. Do not offer suggested-answer chips, a menu of feelings or styles, or a **Choose the rest** shortcut. Buttons support actions such as Send, Speak and the eventual explicit Build; they do not supply the child's game design.

New-game creation opens with two short sentences from jems: "Hey, I'm jems! Tell me the game you're imagining. I'll ask a few fun questions so we can make it look and play the way you want." This is a once-before-first-child-message display, never synthetic child evidence. A new first build remains blocked until the coach understands the child's action and consequence, goal or open-ended purpose, world, intended visual style and mood; viewpoint and movement need clarification only when they materially shape play. These are adaptive content criteria, not a fixed interview, turn count or list of questions. No unnecessary scores, lives or progression, and no repeated answered questions. When stuck, help the child invent from a favorite thing, an imagined moment or an ordinary object doing something extraordinary. A short conversational recap precedes the child's explicit Build; a delegated or helper-authored whole game cannot stand in for their idea.

Put the detailed plan, experiment settings, explanation controls and longer help behind an optional disclosure. Avoid competing hero copy, repeated save notices and several different help panels around the current question. Keep the child's own idea and relevant choices in the conversation; compiled build instructions, technical status updates and raw job output belong outside it. Minimal presentation must not erase saved provenance or hide a real error.

Keep decorative reward popups out of an active creation conversation and fitted game play so they cannot cover questions, answers or game controls. Entry clears an earlier cosmetic toast; suppressed artwork does not replay when the child leaves the game. Earned levels, gem totals, receipts and learning evidence still update, and My rewards retains the committed grants. Other surfaces keep their ordinary celebrations.

An explicit Build receives immediate, focused acknowledgement. Pending submission and an accepted build use different truthful states. Once accepted, offer **Play while I wait** and **Stay here** in the focused handoff. Use approved artwork, short copy and large controls; no fictitious time estimate is needed. Ordinary background readiness remains a visible, explicit action and never reopens a dismissed dialog or interrupts play. The [first-creation contract](../child-journey/FIRST-CREATION.md#build-handoff-and-recovery) defines the state and focus boundaries.

### First coding puts the actions within reach

The owner's [November 22 coding refinement](../decisions/2026-11-22-first-learner-coding.md) makes **First steps** the ordinary scene editor. Give the stage and code comparable space in landscape. In portrait, reserve about two thirds of the available workspace for code. On constrained screens, offer Code and Play views. All six beginner actions must be immediately visible and tappable on entering Code. Keep exits, Undo and Keep easy to find. A first learner should not need to understand coordinates, variables, signal names or several scripts to make a character move.

Reveal one block's useful controls when selected. Put additional authoring tools and scene settings behind explicit choices. Simplification must preserve exact custom values, nested blocks, existing programs and saved references. It must not substitute a supplied solution for the child's sequence or make an existing exercise impossible to solve. Start and tap choices select their own programs, so exploring a different event never erases the first program.

Keep a challenge's brief, Watch and Check near the active scene. Help can reveal requirements and hints; feedback should be visible beside the task without scrolling the entire screen away. Hints retain their existing assistance record. Plain-language labels, the current-action highlight and visible consequences should explain the activity before decorative slogans or metadata.

Inspect text inside a scaled canvas as well as DOM text. Supply readable scene speech and counters outside the canvas when necessary; an 18px CSS label elsewhere does not make a tiny speech bubble readable. Approved Pals should belong visually in their world, with their original colors, white details and gem anatomy preserved when the renderer removes a paper background. See the [Creation Studio contract](../creation-studio/README.md#first-steps-and-more-tools) for the actual presentation and compatibility boundaries.

## Readability holds on phones

| Element | Product target |
| --- | --- |
| Visible child labels, statuses, captions and secondary controls | At least **18 CSS pixels**, including narrow phone layouts |
| Main instructions and typed task text | **20 CSS pixels** by default |
| Question prompts and section headings | At least **22 CSS pixels** |
| Main touch controls | At least **48px** high |
| Secondary interactive targets | At least **44px** in the touch direction |
| Ordinary text contrast | At least **4.5:1** against the actual rendered background |

Use `--jems-child-label` and `--jems-child-body` from [the shared brand layer](../../src/brand/jems.css). Essential text remains readable in hover, focus, error, hint, worked-example and saved states. Use spacing, weight and grouping for hierarchy. Reflow or simplify crowded layouts; do not solve them with smaller text or clipped actions. Learning diagram text also needs inspection at its final displayed size.

## A surface owns its colors

Light activities use dark ink; dark activities and game results use appropriate light ink. Set the foreground and background together. Do not apply a dark card's heading or form rules to every descendant of a host container. Native learning mounts use `learning-modal-card`, separate from dark result `modal-card` styling. Language edit and creative labels own their dark ink even inside an older panel. Save failures have an explicit readable warning background and foreground. Selected answers and used letter tiles remain instructional content: do not fade their text when the control becomes disabled.

Inspect actual composed screens. An isolated component can pass while a more specific outer selector turns its heading white. Test native Studio games, the legacy game shell, My Powers and generated-preview covers, including visible error and help states. Verify the light Math and English workspace and the separate dark game-result surface, including transitions between them. Grade-specific target sizes, model labels and interaction states follow the [learning workspace standard](../learning/LEARNING_WORKSPACE_STANDARD.md).

## Friendly optional narration

The target is a warm, cheerful adult female voice with clear, natural pacing. Avoid exaggerated pitch or slow robotic delivery. Language reading, Hear reply and Idea Workshop directions share one deliberate voice policy. Prefer recognized female local English voices, with higher-quality variants first when available. Wait for delayed browser voice lists; never silently fall back to an arbitrary male or unknown system default.

Speech starts only after an explicit tap and can be stopped. Pending or active speech must cancel on navigation, disposal, profile changes or a replacement request. Language records listening support when audio actually starts; an unavailable voice must not manufacture assistance evidence. Written instructions remain available.

Browser voices expose no standardized gender, quality or emotion field. Installed voice names guide selection, not a guarantee of expressive quality. The owner's [November 21 refinement](../decisions/2026-11-21-profile-play-and-reading.md) adds the separate, default-off [natural narration architecture](../speech/NATURAL_NARRATION.md) and [shared read-aloud contract](../speech/READ_ALOUD.md). No live provider or microphone permission is activated by that implementation. Device listening acceptance remains separate from mocked voice tests. If a suitable voice is unavailable, retain the speaker control with a short truthful notice and keep the text visible.

Keep the reading button available through chat replies, learning questions, revealed hints and Creator interactions. A speaker icon means reading; a microphone means dictation. Natural speech is preferred only when its authenticated session capability is available. Preserve an explicit previewable device backup and report its actual mode in Grown-ups. Reading must be stoppable, and a mobile playback-permission retry reuses its already downloaded transient audio rather than creating another synthesis.

## Fit the child’s game to the screen

The playable view owns the available viewport and contains required learning overlays. Always retain a clear way to leave and a Full screen / Exit full screen control. Browser refusal uses a truthful expanded view. Avoid outer-page scrolling during play; allow readable help, learning cards and optional tool trays to scroll within bounded areas. Keep touch targets and text readable instead of scaling an entire web page down. Rotation and the mobile browser bar must resize the real game area. See the [fitted-play contract](../homepage/README.md#games-stay-in-view).

## Evidence and scope

The [accepted repair decision](../decisions/2026-11-20-learning-readability-and-narration.md) covers question presentation, semantic contrast, local narration and compact-navigation type size. Broader library copy, thumbnails, Pal artwork, subject defaults and optional-practice exits are separate work and must not be represented as delivered by this patch.

Render the actual candidate, inspect its captures, and retain the exact test/build provenance. Automated browser checks establish the tested states; they do not establish physical-device audio quality, child comprehension or educational effectiveness.

Early learning uses generous illustrated answer targets, spoken prompts, replay and an explicit grown-up reading alternative. First steps presents arrows, actions, an event control and ordered commands. Optional exact values remain in the editor. Compare the stage, palette, sequence and playback controls together on portrait, landscape and short viewports.

## Early learner journeys

Early activities offer pictured answers, audio replay, mute, a declared grown-up reading option and large tap targets. Children can select and undo story tiles without dragging. A printed decoding target stays visible and silent. A tap before instruction delivery leaves the attempt open. Use the shared Spark and owned-Pal art in the creation handoff. In the scene editor, a child can add direction blocks by tapping. On narrow phones Code and Play share the workspace through adjacent controls. Expand or use fullscreen to work with either view.

A young profile starting one of the retained native games hears a short first action after browser activation. Replay and mute appear with game tools. Opening a checkpoint stops the previous instruction. Leaving play or switching profiles disposes its reader. The handoff and scene introduction also respect that profile’s early-learning mute choice.

In the graphical editor, Jump and Dance display existing Spark poses with their direction or music symbols. Focus motion respects the device’s reduced-motion preference. Empty sets use a framed empty group. Objects in nonempty sets have individual picture descriptions so a screen reader can enumerate them.

## Shared landing-page reference

The existing My Art composition is the owner-approved visual standard for Home, My Journey and Creative Studio: illustrated purpose, readable task cards, one clear primary next action, and progressive details. Preserve its artwork and original composition while repairing undersized text. My Journey groups actual Pals, gems, achievements and powers; Creative Studio separates Make a scene, Rebuild a scene and Try an experiment. See the [modernization decision](../decisions/2026-11-25-child-experience-modernization.md).

## Secondary page headers and focus

My Journey, My Pals (including Choose your Pal), Gems & achievements, My Powers, My Creations and Notifications use the shared Jems page header. Put the back action first, followed by one left-aligned title and a short description. Place optional owner-scoped progress beside the title on wide screens and beneath the description on phones. Align the section navigation and the content below to the same edge. Use approved illustrations in the activity, collection and reward content.

Move focus to the route heading when a reader needs the new page announced. Keep this ordinary title outside the Tab order and visually quiet during navigation. Give keyboard-operated buttons, links and disclosure controls a visible focus ring. Dialogs return focus to their opener. An active learning question retains its own announcement and intentional focus treatment. On phones, My Powers keeps the existing global navigation above the learning workspace so it cannot cover answers. Its section navigation, back action, title and description use the same spacing as the other Journey pages.

Home and first-visit onboarding lead with an invitation and a maker choice. My Art and Creative Studio use illustrated workspaces; creation conversations, experiments, learning questions and gameplay put the current task first. Grown-ups and guardian screens keep the information hierarchy of their management forms and reports. These experiences retain their own headers. [Shared header implementation](../../src/brand/page-header.ts)

On small phones, present both free starters in compact illustrated rows. Keep each choice button within reach above the global navigation at the 390 × 844 review size. Back actions and descriptions must meet text contrast on the actual page background, including the Notifications surface.
