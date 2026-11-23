# Conversation-first and spoken Studio — owner review

**Status: draft implementation. Not a live-AI or universal voice release.**
The existing design-coach specification remains the governing safety/ownership standard.

## Child behavior and product intent

A child can talk about a game, a character, a joke, a strange world, or an
undeveloped idea without the assistant demanding an optimization exercise.
An explicit **Talk** button sends a conversational turn. An explicit
**Try a change** button follows the existing controlled revision/build path.
Neither a speech transcript nor a conversational suggestion can build,
promote or publish a game. The Studio notebook supplies bounded prior turns,
child goals, observed runtime facts and independent experiments when a live
model is authorized.

Example:
1. Child speaks: "The dragon should sneeze spaghetti!"
2. Coach responds: "Should it be a silly surprise or change how you play?"
3. Child speaks: "Just a huge silly mess."
4. Coach follows up without a build. Child taps **Try a change** only if
   they decide to create a playable test.

This is **not** a rigid four-turn script, and no predetermined mechanic is
required for success. The child can keep talking, stop, play, or explicitly
request help. Do not auto-correct their design, infer emotions, or equate
game success with enjoyment.

## Implemented in this review branch

- Conversation has its own visible action separate from building.
- The model policy favors back-and-forth discussion instead of unsolicited
  optimization or compulsive questioning; the offline fallback is still
  clearly labeled *local*, not connected AI.
- **Tap to Speak** requests on-device English **dictation** quality rather than the shorter command-recognition default, when the browser supports the quality option. The adapter
  requires explicit availability and processLocally=true. The child starts
  each turn, the browser stops after a phrase, and final recognized text
  enters the existing conversational path. No transcript executes a build.
- If the on-device English language pack is downloadable, its installation
  requires a separate explicit click; listening does not automatically
  start after installation.
- Where a verified localService text-to-speech voice exists, a spoken child
  turn receives an audible reply; **Hear reply** also works on demand.
  Text is always available. The product refuses unverified remote text to
  speech and remote speech recognition.
- No raw audio recording/storage, constant listening, speech sent to the
  Factory server, or paid speech endpoint is introduced by these changes.
  Recognized **text** is saved in the existing local per-child conversation
  notebook, and could reach an approved model endpoint only after its
  separate activation gates. A device's **keyboard dictation** is controlled
  by its operating system and may have different privacy behavior.
- Recording is cancelled on session navigation and player switching;
  previous child's last spoken reply is cleared. Math/activity guards remain.

## Acceptance/QA

- A supported local mechanics instruction passed to **Talk** creates no
  experiment, build, model execution request or main-version change.
- A mocked on-device recognizer produces a genuine conversation turn while
  preserving the current game and learning evidence.
- The microphone refuses engines without on-device availability attestations
  or the processLocally attribute, with a readable fallback.
- The device requests microphone access only after tapping Speak; children
  can stop immediately. A failed permission/no-speech event must not submit.
- Later transcripts cannot cross profile or project boundaries.
- Speech output requires a locally advertised voice. It may be unavailable.
- Test desktop, phone and tablet in portrait/landscape; test actual devices,
  mic permission denial, language-pack download, offline mode, interruptions,
  reloading, returning to a game, an active math question and low literacy.

## Not complete or approved for public release

1. **True natural AI conversation:** existing structured coach transport and
   bounded conversation history need an owner-approved low-latency private
   model deployment. The owner pilot currently keeps model credentials in
   the private generation environment, not the gateway; that security
   boundary must not be bypassed simply to enable conversation. No paid
   inference is activated in this PR.
2. **Under-13 processing:** independently verify the current minor-use
   requirements, necessary zero data retention before processing a child's
   personal data through the OpenAI API, safeguards, parental notices,
   consent where applicable, access control, retention/deletion paths and
   incident escalation. `store:false` is not ZDR approval. Browser
   microphone permission by itself is not a full legal authorization.
3. **Cross-device speech:** the on-device Web Speech API has limited
   support. A child who does not have it can type or use the system keyboard's
   dictation, but that is not an equivalent first-party mic experience.
   An approved private speech-to-text service or tested local embedded
   speech model is a separate alternative, subject to privacy/performance
   review and actual touch-tablet evidence.
4. **Conversational intelligence:** run the full synthetic evaluation catalog against
   the actual approved model, plus targeted multi-turn audio/transcription
   scenarios; check adherence to child ownership, short natural responses,
   no auto-build, truthfulness about observations and skip behavior.
5. **Human validation:** observe voluntary child play, especially younger
   children who cannot type comfortably. Track ability to express ideas,
   response usefulness, comprehension, interruption burden, and errors;
   do not optimize for excessive conversation turns or app usage.

## Provider references

- MDN, SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- MDN, Web Speech API on-device processing: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- OpenAI, Under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- FTC, COPPA FAQs including children's voice audio: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions

## Rollout

Review/merge and test this UI as an **inactive real-model** capability first.
Do not claim that a functional microphone on one desktop browser proves
tablet compatibility. Treat live model activation, speech vendor choice,
child data processing, and public release as separate owner approvals.
