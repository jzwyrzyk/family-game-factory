# Versioned generated-game runtime archives

Each approved directory is an immutable trusted package, separate from the child's generated source. `worker.js` contains the Planck engine, bounded physics facade, intrinsic hardening, private channel bootstrap and frame copier. `client.js` contains the input clock, interpolation, approved canvas artwork and local audio synthesis. No generated source is an input to this build.

`bundle-v2.cjs` keeps an explicit version → SHA-256 registry. A compiled game records both `runtimeVersion` and `runtimeHash`, in addition to its separate source and compiled-code hashes. The preview looks up its exact archived version. New sandbox attestations must use the current approved version. An unknown version or changed archive fails closed. V1 continues through the original primitive renderer and gate.

## Updating an approved runtime

1. Change the trusted source and its `VERSION` in `runtime-v2.ts`; choose a new version.
2. Run `node scripts/build-generated-runtime.cjs quality-runtime-v2.MINOR.PATCH`. The packager refuses to overwrite an existing archive.
3. Review the manifest, exact worker/client output, source hashes and dependency versions. Append the new hash to `bundle-v2.cjs` and update its default `VERSION`, preserving every previous approved registry entry and archive.
4. Update the generation prompt's supported version and run the trusted unit and browser containment/mechanic suites against this exact archive. The source-hash guard includes the bootstrap, language allowlist, hardening, frame copier, renderer, physics facade, catalogue and artwork. Do not treat a source-only review or VM unit fixture as browser/gVisor evidence.
5. Build/review a new immutable sandbox image and coordinate the existing private worker's reviewed public-source pin. Keep existing gateway/private-worker trust identities, approval flags and runner gates intact. Activation remains a separate authorized deployment step.

Never overwrite an approved directory or remove an approved registry entry to make new code pass. Saved games retain their original package; a future upgrade is a new revision. The initial unregistered development snapshot was replaced before the first approved hash was recorded; no published or accepted game referred to that draft.

## Limits and evidence scope

V2 uses 60 Hz fixed steps, at most four catch-up steps per request, 40 bodies, 60 physical joints plus one bounded drag, 24 queued contact/break events, 500 capability calls per tick, 240 commands per frame, one background, 80 sprites, 40 text labels, eight queued sound cues and ten live synth voices. A sanitized frame's serialized JSON is capped at 64,000 UTF-16 code units. Generated source remains capped at 30 KB of UTF-8 and compiled source at 100 KB. The trusted package is outside both source caps. These budgets do not impose a hard per-game browser JavaScript heap cap; ordinary allocations and computation remain subject to the worker watchdog and browser resources. The production gVisor test container has separate resource limits.

The v2 gate compares a deterministic idle scene against UI-input exploration for up to 120 fixed ticks. It requires input-dependent non-text scene changes, valid playing/won/lost state, clean replay, pause/resume, bounded reported resources, responsive canvas and parent isolation. This permits endless construction and ordinary losses. It does not prove every input has a physical effect or every generated goal is reachable. The authored suspension fixture separately checks known win and loss conditions, and the workshop fixture checks physical dragging. These checks establish functional contracts; child enjoyment and low-end-device performance still require device/play testing. Production arbitrary source still requires the credential-free, network-disabled gVisor worker; the unit suite executes only trusted runtime code and hand-authored test scaffolding.
