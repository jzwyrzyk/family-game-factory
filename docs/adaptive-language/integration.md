# Trusted Math / Language Arts integration

## Nonnegotiable policies

A child's local profile has a learningSubject of math or language, with absent legacy values defaulting to math. The parent interface and state mutation reject Off/none/invalid subjects. Every game uses the host-owned checkpoint. The existing 1–8 question rolling budget persists **across both subjects** and every game version; switching the subject must not restart or bypass it. Game-design prompts may change the three permitted presentation modes (checkpoint, interaction, both) but cannot disable learning or change the parent's subject choice.

## Shared profile level

The player menu's **Set learning level / Change learning level** and **Grown-ups → Settings** edit the same per-profile grade and learning difficulty used by Math. New or grade-missing profiles start at Grade 1 with Gentle difficulty; age does not choose a grade. Existing explicit grade/difficulty and all language evidence are preserved. Both English selection and attempt admission reject items beyond the selected ceiling, even when Stretch or older focus/history points at a later grade. The optional `learningSetupComplete` reminder flag changes no evidence or subject permission. See [profile setup and migration](../adaptive-math/README.md#profile-grade-and-difficulty-setup).

## State and recovery

The original browser-local family-game-factory-state-v1 root key and Math v2 history are preserved. Language Arts state is stored separately within the same child profile at language.version=1. Existing exports, existing game versions and legacy Math data are never zeroed when ELA is enabled. State validation rejects future or malformed Language Arts history before normalizing profiles. A bad existing load keeps raw data exportable and blocks new saves; invalid imported backups are rejected without replacing the current state. Creative drafts are local sensitive child data, up to 1,200 characters.

Every successful or incorrect submitted answer is saved immediately. A hint event, a read-aloud event, and a final status are recorded separately. Missing/empty input isn't assessed as wrong, and leaving an unanswered task is interruption rather than failure. No internal game score, response speed or motor-control error can change curriculum mastery.

## Actual game lifecycle

The separate [lifetime rewards layer](../rewards/README.md) stages 2 engagement gems for a completed closed-answer activity or a nonempty saved writing exploration. Supported and independent completions receive the same amount; the original hint/read-aloud flags and unscored-writing interpretation remain intact. Staging occurs at the live source-save boundary, with a durable outbox and idempotent ledger projection. Shown, unanswered and wrong-only activities do not qualify, and reading/restoring old attempts does not mint rewards.

The host checks whether a child is eligible for a learning opportunity and whether the native game can pause safely. While the task is open, the simulation stops, input and held keys are cleared and the game mount is inert. A game resumes at its existing state and elapsed-time model when the host confirms conclusion. An explicit worked example allows supportive continuation; an unscored writing response is a finished learning opportunity but never independently correct. Original Challenge consequences apply to Math-only optional parent challenge, not ELA open writing.

Games with no mid-play pause can use existing round boundaries. The host must never fake a safe pause, invent a lost level or bypass the activity.

## Secure generated game bridge

The renderer sends its existing validated factory-preview events. The host uses the current channel, artifact identity, source frame, owner identity, nonce, bounded round IDs and duplicate suppression before opening an ELA task. The legacy event string math-checkpoint is a compatibility name and does not require a Math item. The isolated game worker never obtains child history, the submitted language answer, answer evaluation or the authority to switch subjects. A stale renderer without the required learning handshake remains blocked rather than playing without checkpoints.

Immutable runtime archives must not be rewritten in place. A future subject-neutral protocol would be a reviewed new version deployed with the frontend and regression tests.

## Accessibility and limitations

A target question is visible and focused before a keyboard appears. Optional speech synthesis reads the task/passage on supported browsers and **marks the attempt as assisted**, never proving independent decoding. The browser's voice is not a validated instructional phonics voice; automatic pronunciation and reading-fluency grading remain unimplemented. Controlled local items are checked exactly; creative writing is stored as exploration with optional human review instead of invented AI mastery.

## Reviewed task revisions and backward compatibility

Each item carries a **contentPack** and a versioned ID (`skill-id:v1:index`). The v1 192-item bank is pinned by a test fingerprint. Future editorial fixes, new examples and grade expansion must publish a **new** content pack and keep old pack material available for validating historic attempts; changing v1 in place after any family uses it could make saved data unreadable. The new pack ID is part of a task's unique identity and retention evidence. Bump the pack revision rather than rewriting an archive. A saved attempt's answer, choice set, response form, task text, hint chain and explanation are checked against its declared reviewed pack.

## Unanswered checkpoints and question-budget integrity

Each host-owned checkpoint gets a shared-budget receipt. If a child leaves a **completely unanswered** checkpoint without requesting a hint, worked example or reading support, the original interrupted record is retained but the budget receipt is refunded. This prevents leaving a game from producing an extended learning-free period. A valid response or meaningful help remains a practice interaction and retains its budget receipt. The host refuses an unsupported refund if the original attempt cannot be identified or saving fails. This policy applies equally to Math and Language Arts because they use the same trusted host.

## Opt-in subject switching in the Studio-first UI

A grown-up may select **Both — child can switch**. The stored `learningSubject: math | language` remains unchanged for backward compatibility; the additional optional boolean `allowSubjectSwitch` controls whether children may change the active subject between questions. Existing saved profiles/backups without that flag remain single-subject until a grown-up opts in. A child cannot grant permission through a game-design prompt. Active activities cannot be switched away; invalid or failed saves keep the prior subject. The child-facing selector changes only future activities, not completed grades, separate Math/ELA evidence histories, shared mandatory-checkpoint pacing, game code or archived versions. Parent reports show both sets of evidence.

Early picture and letter choices mount in the trusted host. Print stimuli are validated against the saved pack. Hearing the instruction is an access accommodation. Declared grown-up reading is recorded as support. No microphone participates in an answer.
