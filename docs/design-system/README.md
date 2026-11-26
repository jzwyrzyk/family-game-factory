# Jems design system

Design once. Approve once. Reuse everywhere. This is the canonical implementation guide for the incremental migration authorized November 25, 2026 (America/New_York). It preserves the approved identity and feature authority. **The initiative is not complete.** This first independently reviewable increment consolidates foundations and the existing collection family; the [inventory and dependent checkpoints](INVENTORY.md) explicitly retain the other archetypes.

## Start here

1. Find the feature and its authority in [current architecture](../../ARCHITECTURE-CURRENT.md).
2. Find its existing archetype in [the inventory](INVENTORY.md). Use the collection template for the migrated secondary pages. Preserve focused onboarding and canvas layouts.
3. Reuse `src/design-system/tokens.css`, production components and existing feature-owned specialist components. Do not create a competing header, palette or action implementation.
4. Keep authorization, persistence, provider calls, learning/evidence, rewards and game mechanics in their existing controllers. Pass their guarded callbacks to presentation.
5. Run `npm run design:check && npm run design:test`, typecheck and the relevant feature regression. Use the Phase 2 `check:changed` guidance from merged #219; shared changes still require full integration qualification.
6. Inspect actual composed surfaces in the live Vite gallery and the standalone product review, including phone, touch, focus and failure states. Record exact-source evidence and remaining owner/device acceptance.

If feedback applies to every header or control, change its shared implementation first. A feature exception must identify its product need and owner; never turn child artwork or a game world into a uniform host illustration.

## Foundations and components

`tokens.css` owns the winning values from the brand, approved art library and modernization layers. Nunito/Inter font files stay in `brand/art-library.css`. Legacy token names remain aliases. Exact-value replacements across Studio, Creation, Art, Pals, Rewards and Parent CSS preserve current appearances. Specialized colors and older layout rules remain in the inventory; this is not a claim that every CSS literal has been removed. Media-query constants are documented in `breakpoints.ts` because CSS variables cannot be used in media query conditions.

| Production export | Contract and consumers |
| --- | --- |
| `createCollectionHeader` / `createCollectionPage` | Existing or new collection page, live heading/description/back/progress elements. Shared width, edge and header. Journey, My Pals, Gems, Powers, My Creations, Notifications. Retains IDs, focusability and callbacks. |
| `createPageHeader` | Narrow presentation primitive used by the template. Legacy `brand/page-header` delegates to the template for active-branch compatibility. |
| `createDashboardCard` | One native button, artwork slot and live detail text. Journey and the gallery use the same implementation. |
| `createDestinationCard` | Native illustrated navigation card; existing Home and Powers consumers. Host owns its route and supplied image. |
| `createContextNavigation` | Named navigation group with current-page indication; Journey sections. These are navigation buttons, not fake ARIA tabs. |
| `createAction` | Native button, explicit label, optional icon, three presentation variants. Legacy class adapter preserves Pals, Rewards, Notifications and Parent treatments while eliminating duplicate button construction. It never starts automatic asynchronous work or invents loading state. Full visual action consolidation remains pending. |
| `containDialogFocus` | Visible/enabled-control keyboard containment with disposal. The current Menu owns open/dismiss, scroll restoration, route guards and narration; the utility owns traversal only. |
| `hostArtworkPath` | Approved host illustrations already used by Home/Powers. Paths/provenance remain distinct from images. No new artwork or approval is inferred. |

Retain `brand/icons`, `brand/maker-identity`, `pals/catalog`, `pals/presentation-image`, speech/read-aloud controls and the feature asset registries. Pal selection, same-form fallback, transparency masks, source hashes, original drawings and earned ownership remain authoritative there. Presentation must not resolve private artwork by bypassing those owners.

## Assemble a page

```ts
import {createCollectionPage} from '../../design-system/templates/collection';
import {createDashboardCard} from '../../design-system/components/dashboard-card';
import {createAction} from '../../design-system/components/action';

const title = document.createElement('h1');
title.textContent = 'My collection';
const description = document.createElement('p');
description.textContent = 'Choose something to continue.';
const content = document.createElement('div');
content.className = 'jems-world-overview';
content.append(createDashboardCard('A moon adventure', 'Continue your idea', guardedOpen).element);
const page = createCollectionPage({title, description,
  back: createAction({label: 'My Journey', onPress: guardedBack}), backLabel: 'My Journey'}, content);
```

No new stylesheet is required. `tools/design-system/gallery.ts` executes this composition. The focused browser check changes one heading token at runtime and verifies all six actual product consumers, demonstrating propagation without per-page edits. This demonstrates reuse; no developer-hours or hosted CI speedup is claimed.

## Review and governance

Run `npm run dev`, then open `/tools/design-system/` for fast component iteration. For actual product routes use `npm run review:build`, open `dist-review/jems-ui-review.html`, and choose **Design system** in the destination selector. The same artifact contains the actual application journeys, synthetic scenarios and grade choices. Gallery fixtures are excluded from the ordinary production entry.

`design:check` checks the extracted shared/gallery sources for raw color declarations, unknown tokens, small literal font sizes, unauthorized fonts and presentation imports of domain authority. It also checks compatibility delegation, canonical foundation ownership, six template consumers and migrated breakpoints. It is a focused source check, not a CSS parser or comprehensive duplicate detector. Existing product browser suites retain their wider responsibility.

`exceptions.json` accepts exact `{file, rule, match, reason, owner}` records; explain the legitimate gameplay, learning, creative or accessibility need. Stale exceptions fail. Current exceptions are empty. Legacy feature styles are outside strict shared-component enforcement until migrated, rather than hidden behind thousands of automatic waivers. No new regression pipeline or runtime dependency is introduced: the existing standalone workflow runs the fast contracts and gallery browser checks and uploads their evidence.

`design:browser` verifies the shared gallery at four sizes, touch targets, composed text contrast, keyboard focus, dialog containment/restoration, token propagation through six real routes and no external HTTP requests. `UI_REVIEW_INLINE_HARNESS=1` is the existing managed-browser workaround; it does not establish actual file opening. Owner, physical device, audio, hosted DEV/TEST and feature acceptance retain their original gates.

[Source-bound evidence, before/after captures and standalone download](evidence/README.md).
