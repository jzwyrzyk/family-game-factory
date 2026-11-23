# Explicit learning profiles, fitted play and persistent reading

**Status:** Accepted product direction; implementation candidate, not deployed.
**Source:** Owner request, November 21, 2026: stop higher-grade questions for younger children; set grade/difficulty per profile; make games consistently fit the screen with fullscreen and easy navigation; replace robotic speech with a caring young adult female voice; retain reading controls throughout child interactions including Creator.

## Decision

- Every child profile has a visible learning grade and difficulty. Unconfigured profiles start at Grade 1 / Gentle. Age does not infer a higher grade. Existing explicitly saved levels and evidence remain intact. A short editor in the player menu and the named learner's Grown-ups settings edit the same fields. Grades 1–4 remain the implemented content range. Stretch stays within the selected grade ceiling in both subjects; game difficulty is separate.
- A playable game opened through Studio enters a bounded play area. The child can leave, edit the idea, open help and request fullscreen. Stray page scrolling cannot move the game off screen. Fullscreen includes the trusted learning host and exit controls. A refused/unsupported browser API uses a truthful expanded view. Tools and learning text may scroll within their own areas instead of becoming too small.
- A speaker means **Read this to me**; the microphone continues to mean dictation. Reading remains explicit and stoppable across saved chat replies, questions, hints, game help and Creator. Navigation, disposal and profile changes cancel pending and active speech. Downloading audio is not evidence that it played.
- Browser voice selection cannot guarantee the requested sound. Add an optional separately approved natural narration capability to the existing private service. Google Cloud Text-to-Speech supplies a pinned English female Chirp 3 HD voice, initially Aoede; Leda and Sulafat are the only configured alternatives. This is a candidate to audition, not a claim that the owner has approved its perceived age or tone. Device voices remain an explicit, previewable backup.

## Boundaries and consequences

Natural narration has its own default-off settings and family consent scope. Model-chat or microphone permission alone does not enable it. The browser sends only the selected reading text after an authorized status check and explicit tap; the gateway admits spend and the private service uses Google IAM. No model key, recording, generation request or narration media is put into the browser's saved projects, backups, public artifacts or application logs.

The implementation does not enable an API, grant IAM, activate paid speech, rotate a worker pin or deploy a revision. The [natural narration runbook](../speech/NATURAL_NARRATION.md) defines the concrete later configuration and listening checks. Current production chat diagnostics and audit stabilization have overlapping source files and must be reconciled before a combined release.

Read-aloud supports access to question wording; it does not solve Math. English retains listening-support provenance. Fitted layout does not bypass required checkpoints, change a game version or demonstrate learning efficacy. The shipped devices and the audible voice still need actual acceptance.

## Standards used

The implementation uses explicit user activation and fullscreen-change handling described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide). Persistent exits, readable/reflowing controls and keyboard escape follow the relevant principles in [WCAG 2.2](https://www.w3.org/TR/WCAG22/); this is not a claim of whole-site WCAG compliance. Jems retains its own larger 44–48px control targets and child typography.

Google documents [Chirp 3 HD voice names and gender](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), [plain-text synthesis](https://docs.cloud.google.com/text-to-speech/docs/create-audio) and [TTS data logging](https://docs.cloud.google.com/text-to-speech/docs/data-logging). These describe the provider API, not a deployed permission or completed family consent.

Related contracts: [Child interface](../brand/CHILD_INTERFACE.md), [Math](../adaptive-math/README.md), [fitted play](../homepage/README.md#games-stay-in-view), [read-aloud](../speech/READ_ALOUD.md), [delivery evidence](../../DELIVERY-STATE.md).
