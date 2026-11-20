# Drawing-to-Playable Engine — complete staged build program

This file is a roadmap and scope boundary, not a claim that all phases are implemented. Every phase is independently testable and must preserve previous sources and public/live safety controls.

| Phase | Outcome | Acceptance and dependencies | Status |
| --- | --- | --- | --- |
| 1. Physical car vertical slice | Child marks body/wheels; saved drawing drives on real suspension in Rally | Moving/reradius wheel changes *real* Planck bodies and joint anchor; transparent artwork rotates with wheel; no network upload | Merged in PR23; exact-head CI and real-device evidence recorded separately |
| 2. Guided component editor | Multiple parts, cutouts, touch/keyboard, independent revisions | Correct a missed part, change role, save tests, revert; separate child profiles | Dedicated Art Studio and recoverable editor implemented; real-child trials pending |
| 3. Stronger local segmentation | Background/ink extraction, partial overlaps and edge correction | Mask editor with add/erase brush or polygon, controlled crop and preserved interior details; compare 30–50 drawings | Connected-background extraction and bounded mask add/erase implemented; real-photo quality calibration remains pending |
| 4. Consent-gated visual recognition | Propose semantic components and likely roles across cars, figures, inventions, scene objects | Parent enables remote inference explicitly; immutable source hashes, opt-in, budget cap, moderation, privacy notices, manual corrections | Not enabled or implemented |
| 5. Articulated character rigging | Editable pivots/bones, joint limits and authored walk/flap/idle/jump behaviors | A child's dragon flaps and jumps; user-corrected pivots make real change; no hidden replacement art | Basic physical joint playground implemented; richer animation controls pending |
| 6. Invented machine behaviors | Wires/emitters/motors/forces/controls based on child intention | Child tells what unusual parts do; inspector shows their approved effects; bounded plugin-like behaviors | Part roles and simple motors/impulses begun; authored behaviors pending |
| 7. Interactive scenery | Recognize/draw terrain, platforms, obstacles and collectibles | Scene geometry and game objects derive from user-selected regions, not visual wallpaper | Guided component role only |
| 8. Generated-game asset registry | Approved rigs, transparent sprites and behavior descriptors selectable in the trusted generated runtime | Immutable versioned asset IDs, profile access, source hashes, size limits, CSP and no network in game execution | Not implemented |
| 9. Portable private asset bundles | Safely export/import rig plus source across devices | Verify hash, schema, size, ownership, version and compatibility; no script injection | Original/rig/draft bundles, safe remapped import, exact-ID restore and combined scene/art files merged in PR23 |
| 10. Release/product quality | Child/play reliability and device performance | Tablet touch and landscape review; correction burden; graphics/audio/performance and child comprehension, followed by careful tuning | Not yet measured on real hardware |

## Implementation priorities

### Near-term
- Keep physical-car and drawing-editor browser checks passing on each exact integration head; the [PR23 merge receipt](../../DELIVERY-STATE.md#pr23-art-studio--merged) establishes its tested source, not later combinations.
- Observe real photo imports: correction frequency, transparency, wheeled-car shape fidelity and paper backgrounds.
- Improve image masks with explicit child tools for adding/removing areas and inspect the result on a checkerboard.
- Preserve the implemented exact rig binding in native game revisions and hash-bearing private art in scenes; use the [Art Studio contract](ART_STUDIO.md) and its regression suites.

### Recognition and reasoning, next research spike
Evaluate several approaches on the *same private consented sample*:
1. Offline image processing only;
2. Multimodal model to propose **labels, approximate bounds, parent-child relation and uncertainties**, not executable code;
3. Specialist segmentation to refine child-corrected region prompts.

Compare component recall, wrong-piece rate, correction minutes, inference cost, latency, privacy and reliability. Never infer an invented machine's behavior without asking the child. A model proposal must pass the existing validators and explicit child approval before registration.

### Asset/runtime bridge
A generated game should see only a trusted, immutable sprite/rig **asset ID**, physical primitives, and sanctioned animation state descriptors. The asset itself remains private, profile-scoped, and inaccessible to arbitrary generated code. In particular, do not expose blob URLs, localStorage, DOM, network, model keys, or the drawing image to sandboxed source.

### Verification and release safety
- Separate source visual fidelity, component correctness, physical behavior, and child enjoyment checks.
- Test failed uploads, large files, corrupt images, browser storage quota, missing source, mid-session profile changes, cancelled gestures, hidden tab/focus transitions, rollback, and old revisions.
- Keep model calls disabled by default. No merge/deploy/paid activation in a review branch.
- Maintain independent math/learning and game-quality contracts. The drawing pipeline only produces approved game assets.
