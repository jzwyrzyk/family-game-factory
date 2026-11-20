# Private Art Studio and explicit reusable art versions

**Status:** accepted development direction; implementation in refreshed PR23. Merge and deployment remain separate delivery facts.

**Source:** the owner asked to bring the earlier drawing-to-game PR up to the current Jems specification and experience, including a dedicated upload/development space, a mini editor and stored reusable characters/art across games.

## Decision

Provide an Art Studio within the existing application. Keep original pixels, editable movement designs and game/scene uses as separate records. Preserve child-authored originals and create new image derivatives or movement revisions for edits. Reuse the approved Jems shell, assets, learning host, local writer protection and existing Create & code editor.

Saved native game revisions pin an immutable rig ID. Saved scene actors pin an original image/hash or exact rig/assembly hash. Saving later art never updates earlier uses implicitly. Missing art produces a recoverable unavailable state; a stock asset cannot impersonate the child's design.

The first supported destinations are the physical drawing playground, Junkyard Rally and local Create & code scenes (including scene animation/video). A rig appears as a single cutout composite in the block scene; its independently simulated joints remain in the physics destinations. The existing generated-game model/manifest boundary stays unchanged.

Art remains local and profile-owned. Upload means choosing an image from the device or camera, not publishing it. Bundles support copying into a selected profile, restoring exact references after a family-progress restore, and moving a scene together with its artwork. Archive keeps references alive; permanent deletion refuses dependencies. The parent area describes separate art/progress backups honestly.

## Reasons and consequences

The old global car selection could silently change art when reopening saved work. Explicit version bindings eliminate that ambiguity and let one character participate in several independent creations. Reusing Create & code provides real behavior editing with the existing scene/history/learning rules rather than inventing another block language.

Keeping local private assets separate from generated manifests preserves the existing trust and provider-processing boundaries. It also means this change does not make arbitrary generated JavaScript or every native game accept custom art. That requires a separately specified trusted runtime asset adapter, not an unchecked URL or private image pasted into a prompt.

Two-file family backup remains explicit because the current progress recovery coordinator does not atomically journal image storage. Combined scene/art export serves a portable individual creation now. A future complete-family image backup must coordinate all persistent stores and interruption recovery before replacing these semantics.

No additional reward category or educational measurement is introduced by drawing or saving. The owner requested making/creative capability; upload counts and visual complexity do not establish skill.

## Revisit when

Revisit broader adapters when a specific native/generated game needs private art and the trusted renderer can preserve owner/version isolation. Revisit recognition after a consented private drawing sample demonstrates where local proposals need help. Revisit backup packaging when a tested all-store recovery design can replace the explicit art/progress transfer path.

See [the feature contract](../drawings/ART_STUDIO.md), [gold standard](../drawings/GOLD_STANDARD.md) and [delivery state](../../DELIVERY-STATE.md).
