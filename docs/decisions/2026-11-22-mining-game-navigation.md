# Mining belongs in the shared game library and player

**Status:** accepted owner direction; implementation and acceptance are tracked separately in [Delivery state](../../DELIVERY-STATE.md).

**Date:** November 22, 2026, America/New_York.

## Problem and direction

The owner likes Mind Your Jems' illustrated world but reported that the game is difficult to find and leave. It is absent from the ordinary Ready to Play shelf and opens a different pop-out experience after creation. The owner requested the mining mechanics first, followed by a unified experience and clearer organization. Earlier direction also removed Moon Donut Dash and Robot Route Lab from the default catalogue and distinguished Dragon Island and Splash or Pass from prebuilt games.

## Decision

Register Mind Your Jems as the `mining` native game and open it through the same Studio host as other playable games. The Ready to Play shelf contains Gem Factory, Mind Your Jems, Bubble Gum Builders and Junkyard Rally. A separate **Original jems** group contains Dragon Island Rescue and Splash or Pass. The child's saved creations retain their **My jems** group.

An acknowledged build's explicit **Play while I wait** action opens that same mining game. The original build remains a separate notebook project. Its current status and explicit ready or recovery action live in the common **More** menu's build shelf; completion cannot take over the current game. A failed or cancelled original build has a route back to its composer. Starting mining from home requires no build, connection or paid service.

The first explicit mining launch uses the existing native-starter `playOnly` project/session and initial revision; later launches reuse it. This ordinary persistence does not submit a generated build, rewrite the originating project's revision, promote its candidate or add a new storage authority.

The [shared play view](../homepage/PLAY_VIEW.md) owns My Games, fullscreen, help/change tools, profile access and the bounded viewport. Mining keeps its illustrated scene and actual sound, pause and in-game directions. It does not install a second modal, a unique close flow or a different fullscreen boundary. Entry focuses the real game stage. Focus or pointer activity outside the scene pauses the hazard clock; closing More leaves the visible Keep playing action in control of resumption. Its controller mounts in the native lifecycle and pauses under the existing timed learning host. Level completion remains in the game and emits only a local mechanic signal; it does not create lifetime rewards or a second host result overlay.

Removing a starter tile does not delete a runtime. Keep Moon and Robot IDs, mechanics, saved revisions and backup validation. Unmodified visits to those retired starters no longer become Continue recommendations; saved creative work remains available in My jems, including a draft or child conversation before any experiment exists. Use the existing meaningful-work predicate rather than assuming `playOnly` means no authored work. Keep unsupported mining edits honest: this first native manifest offers no local tuning control, and cosmetic text changes cannot masquerade as changed mechanics.

## Integration and release

This follow-on uses PR125's fitted-play component, reviewed at `1340d041145ffba4322ccb8262188b7cf2c7b6c4`, and the separately implemented mining gameplay overhaul. Initial integration used PR128 head `cefa0b7a040825f8a3c7b68008b3cb8eab681dec` (tree `68d9eca0314abb4b92112916c2f28e22133c8240`). The reviewed native candidate incorporates the shared Help and fitting corrections through PR128 head `e19dd23ecd7ee764d200ac89db82a9a1b868b653`; subsequent integration and exact hosted evidence, including the standalone terminal-footer color correction, are recorded in [Delivery state](../../DELIVERY-STATE.md). The [ordered gameplay decision](2026-11-22-mining-gameplay-and-navigation.md) remains the original scope record. PR125's draft status and unrelated learning/narration changes are not implicitly approved for merge or activation. Reconcile their then-current heads before a combined release.

The new shared manifest is also used by gateway seed validation. Local mining needs only the browser bundle; importing that native game as a base for a later AI-built change requires a gateway and private generation worker built from compatible manifest/preflight source. This adds no provider activation, credential, storage key or currency rule.

After a player first opens mining, the existing workspace and notebook can contain the new `mining` ID. A pre-mining browser rejects the complete mixed workspace/notebook when it encounters that ID and leaves Studio unavailable; it does not discard the new record or rewrite the other projects. The original raw JSON remains in storage, and the existing parent exporter can preserve unrecognized source data as recovery fields. A frontend rollback must keep compatible mining readers/runtime or use a separately tested migration that preserves every saved project; deleting or silently filtering the notebook or new game is not a recovery procedure. The existing exclusive source-writer lock and reload-before-write rule still govern multiple tabs.

A focused compatibility check loaded the actual PR125 readers at `1340d041145ffba4322ccb8262188b7cf2c7b6c4` against three valid synthetic Moon, Robot and Mining projects/sessions. Both old constructors rejected the new ID with zero writes and byte-identical retained JSON. The current readers then reopened all three. This establishes the no-write reader boundary, not whole-browser rollback or recovery acceptance.

## Evidence required

Verify the actual catalogue entrance and build-wait entrance lead to the same playable frame; movement, pause, help, fullscreen, exit and profile changes retain their controls; the original job survives and readiness remains explicit. Test retired saved games through valid synthetic prior saves and visible saved-game cards. Inspect actual mining and catalogue captures on narrow portrait and shallow landscape. Unit, browser, visual and observed-child acceptance remain distinct.

Reconsider the implementation if shared-host fitting obscures the mine's controls or artwork, if navigation loses the originating build, or if a saved-runtime record becomes unreadable. These are defects to repair, not reasons to reintroduce a disconnected modal.
