# Presentation and playable quality

**Scope:** the style-aware production and acceptance path implemented on this branch for real generated games. This extends the earlier [Game Intelligence work](README.md); it does not replace its independent authored behavioral probes, authorization, learning host or execution isolation. Source implementation is not deployment or provider activation. See [delivery state](../../DELIVERY-STATE.md) for dated release evidence.

**Decision:** [ADR0006](../decisions/0006-style-diverse-playable-quality.md), following the owner's request to carry the craft of Gem Factory into generated games without making every game look or play alike. Child art uploads and a new art-library workflow remain later work.

## The quality target

A complete result needs deliberate presentation, the requested action and payoff, meaningful play, and usable controls. An attractive picture with advance buttons does not satisfy this standard. Neither do colorful placeholders whose controls technically change a score. A small matching game or an open-ended toy can satisfy it without an economy, compulsory win or complicated simulation.

The standard permits five presentation families. They are independent of interaction, simulation and goal/free-play mode:

| Presentation family | Craft to preserve and review |
| --- | --- |
| `pixel` | Consistent pixel scale, crisp silhouettes, readable sprites and contrasting play areas. Pixel art is a finished style, not a low-quality precursor to realistic textures. |
| `flat-2d` | Deliberate shapes, line weights, composition, color hierarchy and responsive animation. Clean geometry can be the intended artwork. |
| `illustrated` | Coherent drawn or painted treatment, readable subjects and clear separation between scenery and interactive pieces. |
| `dimensional` | Consistent depth, light, scale and occlusion; objects visibly meet their surfaces and remain easy to manipulate. |
| `realistic` | Coherent materials, proportions and lighting while preserving readable subjects and controls. Detail must support play. |

Gem Factory is a reference for finish and clarity, not a required palette, factory theme, rendered-art treatment or collection loop. A dimensional or realistic appearance does not imply true 3D navigation or a physics engine. The generated runtime remains 2D; an essential unsupported 3-axis action remains a capability gap. Explicitly requested physics and physical causes still follow the [game-form decision](../decisions/0002-intent-faithful-game-forms.md).

## Active production path in source

The existing `JobService` and Actions coordinator own the path. There is no second queue or alternative acceptance service.

| Stage | Implemented responsibility | Boundary |
| --- | --- | --- |
| Source grounding and plan | Read the full child request and verified base; propose the action, payoff, variation, style and any art requirements. Bind the proposal to the exact request and base revision. | Private hosted agent. The existing heuristic form preflight remains advisory; the new structured planning request is a paid model call under the existing approval and budget. |
| Art preparation | Reuse approved assets; optionally produce up to two new raster assets under separate explicit image approval. | Private hosted producer; no game execution, model-returned URL fetching or image bytes in generated source. |
| Source generation | Use the plan, source-grounded requirements, approved asset metadata and appropriate runtime interface. Return source, controls and bounded ordinary-input suggestions. | Private hosted coding request; server attaches the plan and assets. |
| Technical test and capture | Compile, validate, play with ordinary inputs, check lifecycle/isolation and capture actual desktop/tablet images and receipts. Run an independent authored intent plan when one is supplied. | Credential-free isolated test stage. |
| Presentation and playable review | Examine all validated captures, action receipts, the original request and the plan as an unverified proposal. Return four separate judgments and bounded finding codes. | Separate private hosted reviewer request; it receives no generated source and does not execute the game. |
| Accept or repair | Accept only a fully bound pass, or use the existing bounded repair/retest loop. Preserve the last kept game. | Server-owned coordinator and accounting; Ready does not choose Keep. |

[OpenAIResponsesAgent](../../server/agent/openai.ts) makes plan → art → code self-contained in `generate`/`repair`; the [local service](../../server/pipeline/service.ts) and [Actions coordinator](../../server/actions/coordinator.ts) invoke review after the technical gate. The Actions protocol has authenticated `generate`, `test` and `review` stages. The legacy reviewer uses the same approved model in a separate request. The [Adult Private premium builder](PREMIUM-BUILDER.md) selects its reviewer independently, binds a richer production specification and checks observed mechanics before acceptance. Both paths use independent sandbox evidence. Model judgment and human calibration are separate evidence.

[Quality policy](../../server/quality/quality-policy.ts) requires this path for every new real metered game and every real revision whose base is not an existing generated v1 game. It rejects new v1 output as a way around current acceptance. The policy is re-applied when older queued real jobs run, are claimed or report; a missing historical flag is not an exemption. Public build requests cannot set the quality policy. Explicit mock/test adapters remain labeled fixtures and cannot establish real-provider acceptance.

## Plan and saved-art contract

The exact validators and schemas live in [presentation-plan.ts](../../server/quality/presentation-plan.ts). The legacy plan has this shape.

```ts
{
  version: 'game-production-plan-v1',
  requestHash, baseRevisionId,
  presentationStyle: 'pixel' | 'flat-2d' | 'illustrated' | 'dimensional' | 'realistic',
  styleOrigin: 'explicit' | 'saved' | 'chosen',
  playerAction, payoff, variation,
  openEnded: boolean,
  artRequests: [{ id, role, prompt, sampling }]
}
```

The premium `game-production-plan-v2` also binds a structured design and ordered offsets into the original request. The trusted server derives choice spans and keeps helper-suggested choices identifiable. Each planned interaction names an ordinary input and its visible consequence. [Design validator](../../server/quality/production-design.ts)

The request hash is SHA-256 of the original request, not of a model summary. The server supplies the base ID and binding fields. Action, payoff and variation are nonempty strings of at most 500 characters each; at most two art requests are allowed, each with a unique bounded asset ID and prompt of at most 1,200 characters. The art producer also rejects malformed or unsafe request data before contacting a provider. Strict objects reject extra fields.

Conservative literal style detection preserves an unambiguous explicit style and otherwise carries the saved asset-pack style forward. The full request and any literal style evidence reach both planner and reviewer. Multiple requested styles remain in that text instead of being silently reduced to a single guessed blend. Physical realism is not interpreted as an art request. These lexical safeguards have regression examples; they are not universal language understanding.

On a saved-game edit, existing art is retained through ordinary rule or mechanics changes. New artwork requires a relevant appearance request or the bounded asset-failure findings `VISUAL_INCOHERENT_ART` / `VISUAL_PLACEHOLDER_APPEARANCE`. Routine repairs reuse the prior plan/assets; an asset repair can replan with the observed failure images. A plan is always a proposal: writing a payoff into it does not prove that the game delivers it or let the planner omit a harder part of the child's request.

## Asset and runtime contract

[game-assets.cjs](../../server/agent/game-assets.cjs) and its [typed facade](../../server/agent/game-assets.ts) validate a server-attached `game-assets-v1` pack. It contains `style` and an `assets` array; the array may be empty for code-native artwork. Each asset has:

| Fields | Contract |
| --- | --- |
| `id`, `role` | Unique letter-first ID, at most 40 characters; role is `background`, `actor`, `object` or `effect`. |
| `mime`, `data` | PNG or WebP with canonical base64 bytes; raster structure, actual dimensions and hash are checked. No remote URL, SVG or script asset. |
| `width`, `height`, `sha256` | Checked dimensions and byte identity, not provider assertions. |
| `sampling` | `pixelated` or `smooth`, selected for the intended treatment. |
| `provenance` | `{kind: 'approved-library' | 'generated', sourceId}` with bounded identifiers. This is provenance metadata, not an upload or library-discovery service. |

The pack allows at most **8 images, 2 MiB combined raw image bytes, 2,048 pixels per dimension and 8 × 1,024 × 1,024 combined decoded pixels**. The byte ceiling also applies to an individual image. Invalid, animated or incompletely decoded inputs fail rather than becoming external fetches. The trusted renderer fully decodes the pack before Play.

The new immutable runtime archive is **`quality-runtime-v2.1.0`**. Its `image` draw command references an approved `assetId` and supplies a stable `key`, centered `x/y`, `width/height`, optional `angle`, and optional `screen` flag. Draw order controls layering. The game worker receives only approved asset IDs; the trusted renderer holds the bytes. Scenery, independently movable actors and code-native interface remain separate. Physical colliders and artwork dimensions are independent, and a detailed texture does not make a physical component or rig.

Assets, plan and suggested playthrough must survive compilation unchanged. `assetsHash`, source hash, compiled-code hash and exact runtime version/hash bind the tested artifact. The preview uses the saved runtime archive. Existing 2.0.x archives and saved v1 games remain supported; an old accepted game does not require a new review merely to open. New real v2 candidates use the current runtime and acceptance path. See the [archive contract](../../server/sandbox/trusted/README.md) and [generated validator](../../server/agent/generated.ts).

## Optional image production and spending

New generated images require `AgentApproval.images` with `enabled: true`, a named approval/model, `maxImages` of 1 or 2, `maxMicroUsdPerImage`, and `priceReviewedOn`. The image price review must be within 31 days, with at most one day of clock tolerance into the future. The per-image allowance is an integer from 1 to 500,000 micro-USD. These are explicit admission and ledger ceilings, **not a measurement of the provider's invoice**. Source code does not choose a newly approved model or silently enable image spending.

Without image approval the planner must return zero art requests. A code-native pixel or flat game still receives the same mandatory review. Other styles may use available approved art or code-native techniques; the absence of an image provider is not permission to accept placeholders as fulfillment.

The [producer](../../server/agent/illustrations.ts) requests one WebP image at a time, medium quality and compression 80: opaque 1,536 × 1,024 scenery or transparent 1,024 × 1,024 actors/objects/effects. It uses a fixed provider endpoint, rejects URL-only responses and reuses exact existing generated assets when request provenance matches. Prompt instructions keep actors, labels and controls out of scenery. The returned pack still must fit the independent runtime limits.

Plan, art, code and review share the job's remaining allowance. Before a novel image POST, generation reserves conservative capacity for source generation and mandatory review using approved input/output ceilings and rates. Only the remainder can fund the image request. The image helper checks the entire planned novel-image charge before its first POST. Timeouts and uncertain paid responses are not automatically replayed. Existing transactional admission, cancellation accounting and bounded retries remain in force.

Text planning/coding/review use structured responses and `store: false`. The legacy admission estimate adds a conservative 4,096-token allowance per low-detail image to its text bound; this is not actual billed usage or a universal conversion for every future model. Six captures already exceed an older 24,000-token input allowance before the accompanying JSON/instructions. Activation therefore needs an explicitly approved multimodal model and sufficient approved input limits, within the current 64,000-token contract maximum. Source does not increase a live allowance automatically. The premium policy requires its own reviewed per-stage low-detail image bound and reserves the complete permitted repair path. Actual response usage is checked, while image costs use the explicit conservative charge. Provider model/rate compatibility, retention and real invoice/latency behavior require release-specific verification.

## Actual capture evidence

[quality-capture.cjs](../../server/sandbox/quality-capture.cjs) runs after the existing technical gate. Its browser contexts have normal motion, desktop keyboard/mouse and emulated touch tablet. It screenshots the actual rendered game interface, including labels and controls, rather than substituting an illustration or only serializing draw commands.

| Capture or evidence field | Implemented requirement |
| --- | --- |
| Envelope | `version: 'game-quality-evidence-v1'`, `motion: 'normal'`, artifact/source/code/runtime bindings, `captures` and `sessions`. |
| Viewports | Desktop 1,000 × 1,000 and touch tablet 600 × 1,000; playable iframe at most 720 pixels wide. These are browser emulations, not physical-device evidence. |
| Captures | Producer normally returns initial, interaction and progress/outcome per device, or two states if there is no separate interaction capture. Validator accepts 4–8 total, at least two per device, including an initial and later state with different PNG hashes. |
| Image metadata | Unique capture `id`, `device`, `phase`, observed `tick`, `width`, `height`, `sha256`, PNG base64 `data`. Phase is `initial`, `interaction`, `progress` or `outcome`. |
| Image bounds | Validator requires 200–1,024 pixels wide and 150–1,200 high, checks actual PNG dimensions/hash and caps combined raw PNG bytes at **4 MiB**. The capture producer caps an individual PNG at **1 MiB**; the validator also bounds each encoded field to 2 MiB. |
| Run length, legacy policy | Producer audits up to 600 fixed ticks, about ten seconds of simulation. Continuing play needs at least 600 ticks; an observed win/loss can end after at least 60. The evidence schema accepts no more than 1,800 ticks. |
| Session | One per device: input count, visible-change count, simulated ticks, `playing`/`won`/`lost`, replay/pause success, touch mode, zero console errors and the actual action trace. |
| Action receipt | Action and sequential index, start/end ticks, before/after hashes of non-text scene commands. At least one ordinary non-wait input must accompany a scene change. |
| Lifecycle/layout | Independent ordinary pause/resume/replay checks, visible control targets at least 44 × 44 pixels, no horizontal overflow, and existing isolation/resource checks. |

The legacy generator's suggested playthrough has **1–16** `tap`, `drag`, `hold` or `wait` actions, at most **180 frames per action and 600 total requested frames**, with finite coordinates in the 720 × 400 game space. Held controls are limited to left/right/up/down/action. The capture runner translates these into ordinary device inputs; it accepts no callbacks, state injection or expected-success assertions.

The premium v2 plan can request up to **128 actions** and **7,200 frames** in total, still at most 180 frames per action. The capture runner derives a bounded horizon from that trace and can retain up to four captures per device, eight in total. The initial capture leaves at most three distinct post-action observations per device. A bound premium plan with more than three essential interactions yields `QUALITY_EVIDENCE_CAPACITY_EXCEEDED` before image or code spending. The builder preserves the requested mechanics. Several distinct effects can occur between captures. An unseen transient effect is still missing evidence. Its extended wall-time ceiling is five minutes for the private sandbox test. This permits ordinary-input exploration of a longer level, including an earned terminal payoff, within existing per-frame, byte, image and isolation limits. A game that takes longer than the available observation must remain unverified.

This suggestion helps explore a candidate; it is **not an independent behavioral oracle**. Scene-hash changes can establish observed response, not the semantic cause or requested payoff. A terminal flag alone proves neither. The reviewer must use the actual imagery and original request, and missing essential behavior remains unverified. Independent authored intent plans remain separately validated and enforced when supplied.

Capture ticks are read just before taking a screenshot; the renderer may continue until its audit limit. They identify the observation interval and are not a promise of exact frame-synchronized capture. A short trace can miss a longer progression, hidden bug or alternate input path. Normal-motion capture does not certify reduced-motion behavior, sound quality, actual devices or every state.

The shared [evidence validator/hash helper](../../server/quality/game-quality-evidence.cjs) binds the images and receipts to the exact game. Its artifact hash covers kind, title, instructions, source, controls, asset hash, plan and suggested playthrough; the envelope separately checks compiled-code and runtime identity. Capture data is accepted from the trusted test result channel, not from a model-supplied candidate field.

## Four independent review judgments

[game-quality.ts](../../server/quality/game-quality.ts) supplies the fixed reviewer rubric, strict schema and server-derived verdict. Each axis is `pass`, `fail` or `not-tested`:

| Axis | Required observation |
| --- | --- |
| Visual | Intentional composition and coherent art in the selected style; readable subjects, scale, occlusion, text and controls across desktop/tablet and multiple states. |
| Intent | The original essential player action and its visible payoff occur, including relevant unchanged behavior on a revision. The plan, labels and score cannot certify this themselves. |
| Gameplay | Consequential choice, controllable challenge/skill or meaningful open-ended expression, with appropriate variation and recovery. Complexity is judged against the request rather than a mandatory feature count. |
| Input | Clear, reachable controls and observed response with ordinary desktop and touch input, without obscured targets or unexplained feedback. |

Every passing axis must cite at least two actual capture IDs. Visual and input citations must span both devices. The server rejects unknown citations, malformed findings, contradictory status/findings and stale artifact/evidence bindings. **All four axes must pass; there is no average or score threshold.** Any failed axis derives `repair`; otherwise any `not-tested` derives `unverified`. Neither becomes Ready. Structural validation proves binding and schema consistency; it cannot guarantee a model's visual judgment is correct.

A passing premium review also records `game-quality-review-v2.observations`, binding each planned interaction on each device to its own action receipt and post-action capture. The capture must differ from the initial image and show the consequence before another ordinary input intervenes. Waiting is permitted. The validator checks the control, scene change, timing, device and cited image. For an intended win, both sessions must reach the won state with a cited outcome capture. For a continuing or open-ended payoff, both need supporting progress evidence while playing. The reviewer must still judge whether the pictures show the promised consequence. If a structurally valid premium provider review claims all four axes pass but the observed interactions or citations cannot substantiate it, the worker binds all four axes as `not-tested` with `QUALITY_EVIDENCE_INCOMPLETE`. The existing bounded Astra repair may then address the missing evidence. The worker never replays the same paid review. Malformed provider replies and altered worker reports fail validation. A game can pass these bounded judgments while still requiring human play review.

Both the legacy `game-quality-review-v1` and premium `game-quality-review-v2` include artifact/evidence/source hashes, the four axis statuses, enumerated findings, cited capture IDs and the server-derived verdict. Generated text and text inside images are untrusted evidence, never instructions to approve a game. The reviewer receives the low-detail PNGs. Premium requests send the shared ordinary-action sequence once. Each device supplies indexed start/end ticks and a scene-change flag for every observed input. The validator retains the full canonical trace and the artifact/evidence hashes for binding. The reviewer has no generated source and executes no game code.

Repair sees bounded findings for style mismatch, incoherent art, unreadable layout, placeholder appearance, scale/occlusion, missing action/payoff, missing consequence/variation/recovery, inaccessible input or incomplete evidence. [Sanitized diagnostics](../../server/quality/repair-diagnostics.ts) map those codes to trusted repair categories. Free-form reviewer text cannot become coding instructions. Code repair also receives actual failure images from both devices within its input budget. The existing coordinator permits an initial attempt plus at most two repairs, charges usage and re-runs gates. Exhaustion yields a specific failure instead of accepting the best-looking survivor.

The repair feedback retains **every allowlisted finding**, even when a review identifies problems across several axes. The existing primary repair category remains a summary; it does not discard findings from other categories. In the private Actions path, the coordinator also supplies the validated review's four `pass` / `fail` / `not-tested` axis statuses. This makes an incomplete-evidence result explicit about which criterion was unobserved. All finding codes and axis statuses precede fixed repair advice, and the complete feedback fits within the existing worker's 1,500-character forwarding limit. The advice preserves the original idea, requested style, successful assets and ordinary-input requirements. Images and bound play evidence continue through their existing independent path; the finding codes do not determine whether those images are supplied. The in-process fallback uses the same complete finding sanitizer but does not supply the optional axis context.

The private execution record's optional `lastFailure` stores only the latest accepted test/review rejection: its stage, zero-based attempt (0–2), stable category/code, at most twelve unique finding enums, and the four validated axis statuses for a review. It is written before retry advancement or final exhaustion, so the final rejected review remains diagnosable after candidate and screenshot cleanup. A subsequent technical rejection replaces prior review axes. Existing `diagnostics` and `repairCategory` retain their previous-repair provenance when the final attempt fails. `lastFailure` is historical: a later repair can become Ready, or a later authorization/provider failure can have a different terminal cause. Read the current job status and `errorCode` separately. Older records without this optional field remain valid; no historical details are invented or backfilled.

This metadata contains no generated source, child prompt, screenshot, asset, free-form error, evidence reference or provider response, and it is not added to the browser job-status response. Keeping complete criteria and a bounded rejection receipt changes neither review binding nor the all-axis acceptance rule, attempt ceiling, authorization, spending admission, cleanup or explicit Keep behavior. The focused presentation and coordinator tests cover mixed findings, unobserved axes, compatibility with the unchanged worker transport, malformed context rejection, terminal provenance and successful repair. These synthetic checks do not establish that any particular live candidate would pass or identify why a historical candidate was rejected beyond the retained evidence.

## Privacy, persistence and release integration

The browser, gateway, preview and sandbox remain model-keyless. Generation/image preparation and review run in the private hosted credential boundary; only the isolated test stage executes generated code. The test container retains no-network, read-only-root, resource and gVisor requirements. Worker callbacks remain authenticated and tied to the expected job, attempt, stage and workflow identity. The new quality review stage needs corresponding private workflow/environment integration; merging public source alone cannot enable it.

The quality path preserves [PR55's adult-profile and guardian-consent boundary](../privacy/ADULT_CHILD_RELEASE_INTEGRATION.md). The coordinator rechecks applicable current generation consent and the exact original adult grant at dispatch, each generate/test/review claim and each state-changing report, again before releasing review evidence and immediately before Ready. A later adult unlock cannot revive a job admitted under a revoked or expired grant. Jobs and accepted revisions retain their adult audience; the quality verdict cannot change ownership or authorize a child profile to read adult work.

The in-process service checks the same permission before each generation/repair, before sandbox execution, before sending images for review, after review returns and at final publication. Denied authorization is not a repair finding and cannot trigger an automatic paid repair. Terminal failure/cancellation clears retained candidate/evidence fields without replacing the kept game. A provider call already underway may still incur usage; an eventual passing verdict cannot publish after permission has expired or been revoked. These are source-enforced boundaries, distinct from the combined integration tests and live deployment acceptance recorded in [delivery state](../../DELIVERY-STATE.md).

Raw captures are temporary job evidence. On Ready, cancellation, failure or interrupted-run recovery, live job candidate/evidence fields are removed. Accepted revisions retain the compact bound review and their own approved game assets, not raw screenshot evidence. Private content-addressed artifact externalization can store candidates/evidence outside the transactional document. Limits are **8 MiB per private object** and **10 MiB for authenticated worker request bodies and sandbox output**, with existing aggregate quotas and integrity checks.

Removing a job's reference is **not physical deletion from GCS**. The current artifact-store interface has no garbage-collection/delete API; previously externalized objects remain private under the store's retention policy. Production retention/garbage-collection configuration and verification remain an explicit release gap. Do not claim that completing or cancelling a job erases previously written objects. See [artifact storage](../../server/storage/artifacts.ts) and [architecture](../../ARCHITECTURE-CURRENT.md).

Compatibility, authentication, spending, host-owned Math/Language, immutable revisions and explicit Keep remain mandatory. This change neither imports children's drawings nor activates a provider, repins a live worker, deploys a service or approves a new release audience.

## Validation and what remains unmeasured

Focused tests cover all five style families, explicit/saved style preservation, request/base binding, strict asset and playthrough contracts, art approval/reservation, invalid or reused screenshots, stale hashes, contradictory reviews, rejection/repair/exhaustion and mandatory review in the existing service/coordinator. Browser tests exercise real raster rendering and actual capture/input behavior. The [synthetic presentation fixtures](../../server/testing/presentation-quality-fixtures.ts) deliberately use generated test pixels and simulated reviewer responses; they are not screenshots of beautiful games or evidence of a model's taste. See [presentation tests](../../tests/presentation-quality.test.ts), [pipeline tests](../../tests/quality-pipeline.test.ts), [asset tests](../../tests/generated-art.test.ts), [image-producer tests](../../tests/illustrations.test.ts) and [capture browser test](../../tests/quality-capture-browser.ts).

The draft does **not** establish a real-provider quality yield, success rate on unseen requests, a latency/cost distribution, agreement with human art reviewers, physical-device reliability, child enjoyment or learning benefit. Existing authored behavioral fixtures are narrower than arbitrary-game coverage. Native Gem Factory's own gameplay/browser results must be reported separately from generated-game results.

The next evaluation should build human-reviewed acceptable/unacceptable references for **pixel, flat 2D, illustrated, dimensional and realistic** games, including beautiful-but-static failures and simple-but-complete successes. Hold out materially different themes and mechanics, both goal-based and expressive toys, plus saved-game edits that should preserve art. Compare the same ideas, models, budgets and devices against the earlier path; report all submitted jobs, failures, repairs, false approvals/rejections and style diversity, not only attractive accepted samples. Check five successive edits for visual identity and mechanical continuity before asserting robust remix quality. This calibration and held-out evaluation have **not been completed** by adding the rubric or fixtures.

Human review should assess fidelity and craft without requiring Gem Factory's appearance. Consented observation on intended devices is separately needed for first-play understanding, comfort, meaningful choice and voluntary replay. Automated acceptance means “met these bounded technical and model-reviewed criteria on this evidence,” never “fun approved.” The [research protocol](research-protocol.md) and [device/play review guide](../game-quality/PLAY_REVIEW.md) retain their separate evidence roles.
