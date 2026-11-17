# Trusted Math / Language Arts integration

## Nonnegotiable policies

A child's local profile has a learningSubject of math or language, with absent legacy values defaulting to math. The parent interface and state mutation reject Off/none/invalid subjects. Every game uses the host-owned checkpoint. The existing 1–8 question rolling budget persists **across both subjects** and every game version; switching the subject must not restart or bypass it. Game-design prompts may change the three permitted presentation modes (checkpoint, interaction, both) but cannot disable learning or change the parent's subject choice.

## State and recovery

The original browser-local family-game-factory-state-v1 root key and Math v2 history are preserved. Language Arts state is stored separately within the same child profile at language.version=1. Existing exports, existing game versions and legacy Math data are never zeroed when ELA is enabled. State validation rejects future or malformed Language Arts history before normalizing profiles. A bad existing load keeps raw data exportable and blocks new saves; invalid imported backups are rejected without replacing the current state. Creative drafts are local sensitive child data, up to 1,200 characters.

Every successful or incorrect submitted answer is saved immediately. A hint event, a read-aloud event, and a final status are recorded separately. Missing/empty input isn't assessed as wrong, and leaving an unanswered task is interruption rather than failure. No internal game score, response speed or motor-control error can change curriculum mastery.

## Actual game lifecycle

The host checks whether a child is eligible for a learning opportunity and whether the native game can pause safely. While the task is open, the simulation stops, input and held keys are cleared and the game mount is inert. A game resumes at its existing state and elapsed-time model when the host confirms conclusion. An explicit worked example allows supportive continuation; an unscored writing response is a finished learning opportunity but never independently correct. Original Challenge consequences apply to Math-only optional parent challenge, not ELA open writing.

Games with no mid-play pause can use existing round boundaries. The host must never fake a safe pause, invent a lost level or bypass the activity.

## Secure generated game bridge

The renderer sends its existing validated factory-preview events. The host uses the current channel, artifact identity, source frame, owner identity, nonce, bounded round IDs and duplicate suppression before opening an ELA task. The legacy event string math-checkpoint is a compatibility name and does not require a Math item. The isolated game worker never obtains child history, the submitted language answer, answer evaluation or the authority to switch subjects. A stale renderer without the required learning handshake remains blocked rather than playing without checkpoints.

Immutable runtime archives must not be rewritten in place. A future subject-neutral protocol would be a reviewed new version deployed with the frontend and regression tests.

## Accessibility and limitations

A target question is visible and focused before a keyboard appears. Optional speech synthesis reads the task/passage on supported browsers and **marks the attempt as assisted**, never proving independent decoding. The browser's voice is not a validated instructional phonics voice; automatic pronunciation and reading-fluency grading remain unimplemented. Controlled local items are checked exactly; creative writing is stored as exploration with optional human review instead of invented AI mastery.

## Reviewed task revisions and backward compatibility

Each item carries a **contentPack** and a versioned ID (`skill-id:v1:index`). The v1 192-item bank is pinned by a test fingerprint. Future editorial fixes, new examples and grade expansion must publish a **new** content pack and keep old pack material available for validating historic attempts; changing v1 in place after any family uses it could make saved data unreadable. The new pack ID is part of a task's unique identity and retention evidence. Bump the pack revision rather than rewriting an archive. A saved attempt's answer, choice set, response form, task text, hint chain and explanation are checked against its declared reviewed pack.
