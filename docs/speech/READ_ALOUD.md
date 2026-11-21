# Child read-aloud

The November 21, 2026 owner request extends read-aloud across child interactions and asks for a sensible, caring young adult female voice. A speaker with **Read this to me** means listening; the separate microphone means dictation. Neither reading nor dictation sends a conversation or builds a game automatically.

## Shared behavior

`src/speech/read-aloud-control.ts` supplies a visible control, a **Stop reading** state, a short unavailable notice and the common narrator. The control remains discoverable when voices are absent; missing browser support does not remove the written text or pretend audio started.

The shared narrator cancels pending voice discovery, availability checks, synthesis requests and playback on a replacement read, navigation, profile changes, page hiding or disposal. If a mobile browser requires another tap after downloading audio, **Play reading** resumes the same transient audio without another synthesis request or charge. A device voice denied after asynchronous status/voice discovery likewise retains the selected text for a gesture-bound retry, without another network request. Natural audio object URLs are revoked on completion or cancellation. A stale result cannot begin playing in another child’s context. A refused natural synthesis is not retried or silently replayed through another provider.

| Surface | Content read |
| --- | --- |
| Chat | The selected saved helper message; the persistent composer button reads the most recent reply, including after reopening a conversation |
| Math | Current question and displayed choices; separate control for the revealed hint or worked example |
| English | Current passage, question and displayed choices; separate control for revealed help |
| Game help | The actual native/generated host instructions and controls shown in Help |
| Idea Workshop | Current authored reasoning directions and any already revealed hint, with the same Read / Stop / Play recovery and actual-start access-support rule |
| Creation Studio | Persistent reading toolbar for current directions, scene challenge, visible hint or scene-check feedback; a control remains available inside the character picker |
| Grown-ups | Explicit Jems voice preview with displayed natural/device mode; separate preview and selection of an eligible installed device backup voice |

Math question narration supplies access to the wording without computing or revealing an answer and does not add a mathematical hint. English passage/question playback retains the existing listening-support evidence rule: evidence is recorded at actual playback, not at button tap, request submission or successful audio download. Narrating an already revealed hint does not remove the hint’s assistance history. Creator directions do not award learning credit.

## Voice policy and limits

When configured, the narrator checks the existing private narration route’s status before sending any text. The optional natural-voice service is a separate runtime capability, off until its server approval and provider settings are enabled. Its authenticated transport and server rules remain authoritative; a client voice preference cannot authorize it.

The local backup uses known female English voices with `localService=true`, prefers variants identified as natural/enhanced/premium, and preserves the voice’s original pitch. Automatic selection excludes known legacy robotic voices such as Zira. A grown-up may explicitly preview and select one if it is the only usable option. The browser provides no standardized gender, quality, age or emotion metadata; names are selection hints, not proof of voice quality.

**Reading voice** in Grown-ups stores the selected local fallback voice only on that browser. It has no child content, adds no profile migration, and does not change learning difficulty. The device-voice preview is strictly device-only; **Preview Jems voice** uses the same status-gated route as child read-aloud and reports the actual selected mode. An installed voice disappearing falls back to the best eligible installed voice, with a notice in the settings panel.

The natural route accepts at most 2,000 characters and 4,000 UTF-8 bytes in one explicit read. Longer content is read completely with an eligible device voice; the client does not truncate it or turn one tap into several metered requests. If no eligible voice exists, it reports unavailability and leaves the text visible.

## Validation boundary

Narrator units cover explicit start/stop, delayed voice discovery, quality ordering, local-only preview, status-before-text, late/cancelled results, actual media-start evidence, object URL cleanup and no replay after failure. Math/English browser cases cover the rendered controls, ordinary keyboard order and evidence behavior. Production browser/physical-device acceptance and a listening review of the intended natural voice remain separate from synthetic audio tests.
