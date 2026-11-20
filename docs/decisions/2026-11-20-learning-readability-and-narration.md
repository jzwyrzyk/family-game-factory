# Readable learning surfaces and friendly narration

- **Date:** November 20, 2026 (America/New_York).
- **Status:** Accepted repair direction; implementation and publication are recorded in [delivery state](../../DELIVERY-STATE.md).
- **Source:** The owner's screenshot of white Language Quest text on a pale card, request to check equivalent states, question about the earlier text cleanup, and preference for a perky, happy female voice.

## Decision

Separate native learning hosts from dark game-result card styles. Question, hint, edit/creative label, feedback and failure colors belong to their actual surface. Preserve the existing dark Math and result themes. Verify the composed application at phone and desktop sizes instead of relying only on isolated activity CSS.

Adopt [Child interface: clear at six](../brand/CHILD_INTERFACE.md) as the durable text and narration contract. Present the actual question first. Remove redundant purpose/grade/skill labels and generic encouragement from the question screen; preserve necessary passages, instructions, answers, help and evidence. Keep ordinary child labels and controls at least 18px and main task text at 20px. The compact navigation keeps its existing structure while using the same label floor.

Use one explicit local female-English voice preference across Language, Studio Hear reply and Idea Workshop. Prefer recognized higher-quality variants, use near-natural pace/pitch, wait for asynchronous voice discovery, and cancel stale requests. Do not use an arbitrary browser default. A short unavailable notice is preferable to silently selecting an unsuitable voice. Speech remains tap initiated, and listening support is recorded only when playback begins.

## Why and limits

The screenshot's heading was recolored by a selector intended for dark result cards. That selector also reached pale hint headings. Legacy panel rules separately gave Language writing labels pale text, and a generic save-warning style lacked its own background. Raising one heading selector would leave these related states exposed.

The earlier broad child-interface candidate existed locally but was absent from main after PR89. This scoped repair starts from PR89's actual merged source `669df0ef5e73e11c8786b741815ba290c820d326` and preserves its character-first navigation and parent access. It reuses the previously approved question-first direction without importing old phone-header rules, game-library changes or concurrent Pal work.

The current output mechanism is browser speech synthesis. Voice quality and availability depend on installed local voices; tests cannot prove a voice sounds happy on a real device. This decision does not add hosted speech, send child text to a new provider, alter dictation, change learning scoring, or enable generation.

## Reconsideration

Review the actual voice on intended devices with the owner. If suitable local voices cannot meet the desired quality consistently, assess a separately scoped natural-voice service or reviewed audio assets with clear data, cost and offline behavior. Future UI revisions must retain the question-first, readable-surface and cancellation requirements.
