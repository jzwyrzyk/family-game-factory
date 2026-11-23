# Child interface: clear at six

**Accepted direction:** November 20, 2026. The owner requested fewer words, consistently readable text for a six-year-old, and a warm, upbeat female reading voice. This contract applies to new work and revisions. It states the product target; [delivery state](../../DELIVERY-STATE.md) records which surfaces have actually been checked.

## Put the next action first

Use a clear heading, the object being chosen and a short action label. Add one short instruction only when the next action would otherwise be unclear. Remove redundant eyebrow labels, grade/skill metadata, repeated taglines, generic encouragement and repeated save notices from the active task. Enlarging unnecessary copy does not reduce reading load.

Keep the actual question, necessary passage or diagram, answer controls, useful status, and optional help. Parent-level assessment explanations belong in Grown-ups. For example, listening support must still be recorded correctly without placing an explanation of independent-reading evidence beside the child's Read this to me button. Longer directions can live behind clearly named Help or More controls. Real errors and recovery actions must remain visible and understandable.

### Creation is a guided conversation

The owner's [creation refinement and November 21 clarification](../decisions/2026-11-20-guided-chat-creation.md) make the ordinary new-game screen **a conversation coach, one input and useful action buttons**. The coach responds to what the child actually says and asks one useful open question when more understanding is needed. The child supplies the creative answer through typing or reviewed dictation. Do not offer suggested-answer chips, a menu of feelings or styles, or a **Choose the rest** shortcut. Buttons support actions such as Send, Speak and the eventual explicit Build; they do not supply the child's game design.

New-game creation opens with two short sentences from jems: "Hey, I'm jems! Tell me the game you're imagining. I'll ask a few fun questions so we can make it look and play the way you want." This is a once-before-first-child-message display, never synthetic child evidence. A new first build remains blocked until the coach understands the child's action and consequence, goal or open-ended purpose, world, intended visual style and mood; viewpoint and movement need clarification only when they materially shape play. These are adaptive content criteria, not a fixed interview, turn count or list of questions. No unnecessary scores, lives or progression, and no repeated answered questions. When stuck, help the child invent from a favorite thing, an imagined moment or an ordinary object doing something extraordinary. A short conversational recap precedes the child's explicit Build; a delegated or helper-authored whole game cannot stand in for their idea.

Put the detailed plan, experiment settings, explanation controls and longer help behind an optional disclosure. Avoid competing hero copy, repeated save notices and several different help panels around the current question. Keep the child's own idea and relevant choices in the conversation; compiled build instructions, technical status updates and raw job output belong outside it. Minimal presentation must not erase saved provenance or hide a real error.

Keep decorative reward popups out of an active creation conversation so they cannot cover the question or answer controls. Earned levels and gem totals still update; this presentation choice does not alter receipts, learning evidence or normal celebrations in play.

An explicit Build receives immediate, focused acknowledgement. Pending submission and an accepted build use different truthful states. Once accepted, offer **Play while I wait** and **Stay here** in the focused handoff. Use approved artwork, short copy and large controls; no fictitious time estimate is needed. Ordinary background readiness remains a visible, explicit action and never reopens a dismissed dialog or interrupts play. The [first-creation contract](../child-journey/FIRST-CREATION.md#build-handoff-and-recovery) defines the state and focus boundaries.

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

Inspect actual composed screens. An isolated component can pass while a more specific outer selector turns its heading white. Test native Studio games, the legacy game shell, My Powers and generated-preview covers, including visible error and help states. Keep dark Math and result-card checks so a light-surface repair cannot reverse that defect elsewhere.

## Friendly optional narration

The target is a warm, cheerful adult female voice with clear, natural pacing. Avoid exaggerated pitch or slow robotic delivery. Language reading, Hear reply and Idea Workshop directions share one deliberate voice policy. Prefer recognized female local English voices, with higher-quality variants first when available. Wait for delayed browser voice lists; never silently fall back to an arbitrary male or unknown system default.

Speech starts only after an explicit tap and can be stopped. Pending or active speech must cancel on navigation, disposal, profile changes or a replacement request. Language records listening support when audio actually starts; an unavailable voice must not manufacture assistance evidence. Written instructions remain available.

Browser voices expose no standardized gender, quality or emotion field. Installed voice names guide selection, not a guarantee of expressive quality. Device listening acceptance remains separate from mocked voice tests. If a suitable local voice is unavailable, show a short truthful notice. A future consistent hosted voice would need an explicit architecture and data-policy decision; this change adds no provider service or microphone permission.

## Evidence and scope

The [accepted repair decision](../decisions/2026-11-20-learning-readability-and-narration.md) covers question presentation, semantic contrast, local narration and compact-navigation type size. Broader library copy, thumbnails, Pal artwork, subject defaults and optional-practice exits are separate work and must not be represented as delivered by this patch.

Render the actual candidate, inspect its captures, and retain the exact test/build provenance. Automated browser checks establish the tested states; they do not establish physical-device audio quality, child comprehension or educational effectiveness.
