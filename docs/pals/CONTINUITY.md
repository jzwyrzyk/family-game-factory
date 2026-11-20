# Continuity, approvals, and feedback

## Identity and exact references

Keep established species IDs plus character keys where a roster entry contains multiple profiles. Names are editable; board letters are aliases scoped to the actual board. A different spelling does not create a new species.

Resolve current roster membership and counts from the existing character-reference index, not from a copied table in this guide. Where one entry includes multiple profiles, preserve separate character keys and artwork. Never combine characters into one profile to force a count to match.

For each selected asset, record character, form, variant, revision, selection evidence, source/board, and parent reference. Prefer repository paths pinned to an immutable commit, an asset identifier, and a content hash when bytes are accessible. Keep access-controlled source locators in their existing authorized system; do not copy account-specific identifiers or signed URLs into this public guide. A local path alone is not a durable reference. Never invent a hash, app ID, reference, or visual inspection.

Separate `approved_reference` from `current_review_reference`. A filename containing “final” is not approval. A more recent render does not override an older one explicitly selected by the user. Resolve the scope and referenced images of conflicting decisions, then ask narrowly only if evidence cannot settle the conflict.

## Approval states

| State | Meaning | Next action |
| --- | --- | --- |
| Draft | Proposed concept or art attempt | Develop and review |
| In review | Identified candidate awaiting decision | Record feedback against that candidate |
| Selected direction, asset pending | User choice known; exact image unresolved | Locate it and continue unaffected work |
| Approved | User approved or explicitly selected an identified asset for this scope | Use within that form and purpose |
| Superseded | Later explicit selection replaced this attempt | Retain history; do not reactivate silently |

Keep internal QA outcomes separate: Pass / Revise / Reject / Not verified. A QA Pass is not owner approval. Maintain separate milestones for concept direction, exact art, expressions, animation/rig, integration, and in-game verification.

“Approve all except…” applies to shown, identified candidates, with the named exceptions. Preserve a decision about an unidentified “other one” as selected direction pending reference binding. Do not ask the user to reapprove that settled selection. Do not equate concept approval with sprite readiness or runtime completion.

Keep exactly two form slots: `forms.base` and `forms.mature` (display name **Grown**). Revisions, variants, and expressions do not create growth stages. Preserve existing keys and status codes when extending the established index; do not create parallel `grown` records or rename saved runtime data. Do not derive art scope from obsolete runtime labels.

## Edit boundaries and downstream impact

Before generation, write the **target**, requested **change**, anchors to **preserve**, and downstream **impact**. Afterward compare both the delta and anchors against the actual reference. A failed render remains an attempt; it does not rewrite the specification.

| Change | Likely affected work |
| --- | --- |
| Face/lens construction | Expressions, face masks, eye/mouth animation |
| Limb attachment or length | Poses, rig joints, motion clearance, contact points |
| Gem count, placement, supports | Identity, gem motion, occlusion, exports |
| Body architecture or movement | New form reference, rig, animation, display/collision assumptions |
| Palette/markings | Materials and variant mappings; check geometry compatibility |
| Name/alias only | Catalog/UI labels; no automatic anatomy change |

Flag affected assets for inspection without automatically discarding them. Preserve earlier references and continue unaffected work in parallel. A local repair should not become an accidental redesign.

## Turn feedback into reusable lessons

Capture the actual statement or faithful paraphrase, date/source, target asset, scope (global/species/form/attempt), observable failure, corrective delta, preserved anchors, decision, and affected downstream work. Label uncertain causes as hypotheses.

| Feedback | Local record | General lesson |
| --- | --- | --- |
| Fix T's arms | Chimi's selected attachment/proportions | Inspect connected joints; do not make every Pal short-armed |
| F1 had a floating gem | Navi's deliberate hovering relationship | Preserve defining gem mechanics; do not ban fantasy suspension |
| Sivo architecture unchanged | Rejected growth and selected structural direction | Growth must change more than styling |
| Use the other Poff | Exact selection evidence and pending asset lookup | Resolve cross-chat references before editing |
| Reject medal wing decoration | Specific motif and brand context | Avoid ornamental excess; preserve appropriate anatomical wings |

Update only the applicable scope. Repeated local defects may justify a broader QA check. One unusual approved species does not set the anatomy for all future ones.

Update the canonical documents and established character index in the same scoped PR as authorized work. The repository skill routes to these documents instead of maintaining a second copy. Keep the personal ChatGPT skill as a retrieval adapter or a clearly dated distribution; a chat instruction does not silently synchronize files. Do not claim a persistent update unless it was saved.

## Review and handoff

Show clean individual assets, optionally assembled into a comparison layout. Keep labels outside the art. Pair visuals with a compact record: **character/form/revision · decision status · visible change · QA result · unresolved issue**.

Explain what growth changes and why it follows the first form. For repairs, state what was fixed and whether anchors held. Do not use story copy to conceal an unresolved defect or claim the whole roster is complete from a subset review.

Supply actual approved pointers, prompts, crop/export requirements, face and gem support notes, compatible expression/rig references, and verified app mappings. State unknowns. Inspect the actual project before mapping provisional runtime names. Design work does not establish integration or deployment.

## Measure improvement honestly

Track observed data only:

| Metric | Definition |
| --- | --- |
| First-review acceptance | Forms accepted at first owner review / forms with an owner decision |
| Revision rounds | Owner-requested rounds per accepted form |
| Repeated defects | Recurrences of known anatomy, material, continuity, growth, composition failures |
| Reference mistakes | Work generated against the wrong selected character or revision |
| Internal rework | Attempts rejected internally before owner review |
| Deferred decisions | Items awaiting direction, exact reference, or review |

Separate creative direction changes from avoidable execution mistakes. Internal filtering may improve the review experience while consuming generations; report both when evaluating efficiency. Unreviewed art is not accepted art. Do not invent a rate or promise a fixed yield.

## Public record template

[character-record.template.json](templates/character-record.template.json) is an empty design-record template, not a live registry, approved character, runtime schema, or validation program. Adapt it to the existing index rather than replacing that index. Its null values stay unknown until supported. Preserve the index's current `approved_art_reference` and `selected_exact_asset_pending` meanings when translating the human review states above. Record each exact image and the scope of its approval; approval of a direction cannot fill an absent asset pointer.
