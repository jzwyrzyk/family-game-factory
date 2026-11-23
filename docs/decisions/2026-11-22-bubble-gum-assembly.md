# Bubble Gum Builders: real assembly and an enjoyable payoff

**Status:** Accepted owner direction for implementation; review tuning remains open.
**Recorded:** November 22, 2026 (America/New_York).
**Decision source:** Owner requested a comprehensive overhaul following the mining game: preserve the pleasing interface, use gum as the physical connector, make the component objects recognizable, allow puzzle configurations, expand item variety, and extend the flight/swim/other payoff.

## Context

The former default `qualityVersion:2` decorates a completed illustration with three stickers and ends its launch after 1,850ms (250ms in reduced motion). That implemented behavior does not fulfill the updated assembly and enjoyment intent. The earlier physics game has a separate saved runtime and must remain recoverable.

## Decision

Add version 3 as the new-game default. Use guided object assembly with a deterministic connected-parent graph, visible gum at the actual seams, ten consumable connectors and recoverable experiments. Keep tap, drag and keyboard input. Use a varied authored catalog, multiple object alternatives and progressively larger inventions. Follow assembly with an extended adventure that keeps the construction on screen and leaves replay, revision and continuation to the child.

The initial tuning is twelve blueprints, thirty objects and five-to-eight parts. Following owner play review, launch has a five-second countdown/ignition followed by a 24-second journey. These exact counts and durations are implementation choices, not user-prescribed numbers or a measured engagement result. The graph is the simplest implementation matching the allowed puzzle direction; simulated forces are retained only in the existing physical engine.

## Owner play refinement

The owner described the overhaul as much better, approved the shake test, and requested four changes: remove empty object silhouettes that imply one preferred choice; use only pink gum without a picker; give the initial departure substantial energy such as rocket fire; and extend the successive moon/star-style encounters according to the apparent viability of the chosen build.

Implement neutral placement targets and one pink gum presentation. Retain the shake test. Add countdown, world-specific ignition effects and visible departure, then evaluate authored object-role suitability and pair balance to select a distinct journey and motion. Every complete build gets a full-length, positive adventure. Stronger combinations go farther; awkward combinations have an enjoyable local outing and a concrete piece-swap suggestion. Travel counters use fictional units and are unrelated to learning grades or rewards. Evaluation derives from existing saved objects and requires no save migration.

## Consequences and limits

Version 3 stores assembly separately. Saved sticker, physical and older revisions retain their engines and data. Host learning and rewards remain authoritative: the child explicitly ends a completed build, replays do not add another result, and failed receipt persistence is recoverable.

The shared player from PR129/PR125 supplies exit, tools and fullscreen. This candidate is prepared alongside those unmerged changes. The owner's coordinated merge sequence remains in effect. No production merge, deployment, paid service, telemetry or infrastructure change is authorized by this implementation.

Revisit the exact timing, part count, decoys and visual join clarity after actual owner/child play. Read the [feature contract](../bubble-gum-builders/README.md) for behavior and [delivery state](../../DELIVERY-STATE.md) for observed evidence.
