# Private artwork in 2D games

## Use a drawing in a game's editable companion

Open the game, select **Animate & code**, choose an actor, then open **Scene settings → Use my art**. The picker lists that profile's saved versions. Choosing a picture changes the actor's appearance. The actor keeps its name, position, action scripts, triggers, and references from other actors. **Undo** restores the prior appearance. **Keep** records the edited scene revision. A later artwork revision requires another explicit selection.

The host obtains an authorized editable companion for the selected generated game revision. Its scene records the game project, session, and revision. Remote companions can name only reviewed bundled objects. The drawing choice happens later, in the trusted editor, and uses the existing owner-checked private-art resolver. Restored drawings and rigs must match the content hash recorded in the scene. The source game and its remote companion remain available with their original assets. Games without an editable companion retain the separate-scene journey.

## Local executable example

The **creative-art-review** build includes a single turn-based generated-module-v2 game, **Gem Hunt**. With a private picture selected for an actor, open **Scene settings → Try Gem Hunt** on localhost. Left/right keys and buttons move the drawing to the three gems in the Gem Factory workshop. The session supports offline play after opening, completion and replay. Game rules decide where movement is allowed and when a gem counts. The local session awards no player gems, learning credit or Pal progress.

The dedicated mode and loopback hostname check scope this example to local review. Ordinary builds exclude its JavaScript and CSS. The checked-in game is a synthetic authored example using the generated-module ABI. Its fixed source is in [workshop-v1.js](../../tools/creative-art-review/workshop-v1.js).

1. The editor verifies the pinned artwork against the active profile, bytes and revision. It retains the bounded decoded sprite in host memory.
2. A sandboxed iframe with an opaque origin starts the pinned **quality-runtime-v2.1.0** worker. The host checks the worker archive hash before launch. The frame enforces a hashed inline script policy. The frame receives left, right or restart. The worker has two symbolic sprite names.
3. The relay projects each result to actor position, gem position, and score. The host accepts bounded integers from its active frame while awaiting a turn. It renders its own illustration, gem and child sprite, maintaining the sprite's original aspect ratio and alpha. An invalid response or timeout closes the execution boundary. Close, navigation, profile transition and the host learning overlay end the session.
4. Loading the game and collecting gems performs no provider operation. The worker, relay and remote application APIs receive no private pixels, names, hashes, owner IDs, store handles, credentials or asset URLs.

The example runs against the selected actor pin. The companion's existing scene storage, history, download and recovery retain that selection. Gem Hunt play sessions end when the dialog closes.

## Requirements for general generated games

The candidate design keeps the drawing and rasterization in the trusted host. A generated game could declare a bounded symbolic role in an independently validated game manifest. The host must show the role and ask the child to choose their own art. The trusted binding must include the immutable game revision, slot, asset revision, owner authorization and represented content hash. Reopening must resolve those exact values or explain recovery. A role must never infer physics or learning behavior.

Before supporting arbitrary modules, independently qualify game/source/runtime attestation, a bounded rendering command protocol including camera and layering, profile and family fences, consent enforcement, expiration and teardown, archive/deletion protection, backup/restore remapping and stale revision handling. Test with a separately hosted private DEV/TEST pair and applicable release identities. Security review must cover worker isolation, false or oversized messages, origin binding, timing, resource limits, screenshots for generation/repair, diagnostics and evidence collection. Private pixels must stay outside model inputs, reports and screenshots sent to providers. Production activation requires its own release approval.

## Coordination with scoped delivery research

PRs #202 and #206 independently exercise artifact, slot, consent and runtime qualification. Gem Hunt adds the local My Art to gameplay journey using a fixed reviewed module. Keep both qualification harnesses outside ordinary delivery. When consolidating generation instructions, apply the 2D and authentic-art doctrine once and rerun the complete companion/premium request budget gates. Preserve exact existing worker and release pins until the combined path is independently qualified.

## Offline evidence

From the repository root, use the existing Node and Chromium installation.

```sh
npx --no-install vite build --mode creative-art-review --outDir test-results/creative-art-review
node tests/creative-art-game-browser.cjs
```

The focused browser test uploads a synthetic transparent drawing, opens a generated companion through its host entry point, replaces an actor's image, verifies immutable versions, and plays the isolated game. The executable test checks that the original-color silhouette moves with the actor, that private information is absent from the frame, and that collecting all three gems, replay and learning interruption work. Use `CHROMIUM_PATH` for a system Chromium installation. The [capture](../drawings/evidence/connected-game-gem-hunt.png) uses synthetic artwork.
