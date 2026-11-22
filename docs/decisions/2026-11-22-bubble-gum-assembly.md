# Bubble Gum Builders: real assembly and an enjoyable payoff

**Status:** Accepted owner direction for implementation; review tuning remains open.
**Recorded:** November 22, 2026 (America/New_York).
**Decision source:** Owner requested a comprehensive overhaul following the mining game: preserve the pleasing interface, use gum as the physical connector, make the component objects recognizable, allow puzzle configurations, expand item variety, and extend the flight/swim/other payoff.

## Context

The former default `qualityVersion:2` decorates a completed illustration with three stickers and ends its launch after 1,850ms (250ms in reduced motion). That implemented behavior does not fulfill the updated assembly and enjoyment intent. The earlier physics game has a separate saved runtime and must remain recoverable.

## Decision

Add version 3 as the new-game default. Use guided object assembly with a deterministic connected-parent graph, visible gum at the actual seams, ten consumable connectors and recoverable experiments. Keep tap, drag and keyboard input. Use a varied authored catalog, multiple object alternatives and progressively larger inventions. Follow assembly with an extended adventure that keeps the construction on screen and leaves replay, revision and continuation to the child.

The initial tuning is twelve blueprints, thirty objects, five-to-eight parts and a 24-second adventure. These are implementation choices for owner play review, not user-prescribed numbers or a measured engagement result. The graph is the simplest implementation matching the allowed puzzle direction; simulated forces are retained only in the existing physical engine.

## Consequences and limits

Version 3 stores assembly separately. Saved sticker, physical and older revisions retain their engines and data. Host learning and rewards remain authoritative: the child explicitly ends a completed build, replays do not add another result, and failed receipt persistence is recoverable.

The shared player from PR129/PR125 supplies exit, tools and fullscreen. This candidate is prepared alongside those unmerged changes. The owner's coordinated merge sequence remains in effect. No production merge, deployment, paid service, telemetry or infrastructure change is authorized by this implementation.

Revisit the exact timing, part count, decoys and visual join clarity after actual owner/child play. Read the [feature contract](../bubble-gum-builders/README.md) for behavior and [delivery state](../../DELIVERY-STATE.md) for observed evidence.
