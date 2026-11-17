# Dedicated private conversational coach (not deployed)

This is a **manual, owner-reviewed** blueprint for the private service code in
`server/coach/`. The Docker image contains a self-contained Node bundle, no
source tree, no browser assets, no GitHub runner credentials and no model API key.
It is not built or deployed by the normal Pages/pull-request workflow.

## Why separate?

The Game Factory's private `factory-generation` model key never enters the
public browser, preview, Cloud Run gateway or this private speech/coach service.
If authorized, this service uses short-lived Google IAM to reach OpenAI on
Google Cloud's separately approved Model Garden private preview and Google's
Speech-to-Text. **Do not deploy with under-13 personal data without ZDR and
parent verification for the actual provider.**

## Build and inspect locally (no infrastructure mutation)

```sh
npm ci
node scripts/deployment/build-private-coach.mjs
test -s dist-private/coach-server.mjs
```

Run automated contracts with `npm run test:coach`; all model and speech
responses in those tests are synthetic.

## Owner-authorized deployment checklist

1. Review [full release criteria](../../docs/design-coach/PRIVATE_CONVERSATION_RELEASE.md).
2. Obtain **written** OpenAI on Google Cloud model entitlement, including an
   eligible production/private pilot purpose, billing offer and ZDR approval.
3. Verify child-specific consent and the adult's external identity before using
   `server/owner-setup.ts` to grant model/audio permission to that family.
4. Create a new dedicated Cloud Run **private** service identity with least
   privilege (only allowed Vertex OpenAI model and optional Speech-to-Text).
   Grant Cloud Run Invoker exclusively to the existing gateway service account.
   Deny `allUsers`; review organization ingress/egress and no request-body logs.
5. Pin the actual Cloud Run HTTPS audience and exact gateway service-account
   email in the private service environment. The gateway stores only that
   audience, never a model API key or an arbitrary inference URL.
6. Leave all flags **false** until consent, data processing terms, cost
   ceilings, model evaluation, device speech tests and emergency escalation
   have been reviewed.

## Private service settings (none are secrets)

```text
FACTORY_COACH_BROKER_ORIGIN=https://<reviewed>.run.app
FACTORY_COACH_GATEWAY_SA=<reviewed-gateway>@<project>.iam.gserviceaccount.com
FACTORY_COACH_VERTEX_PROJECT=<approved-project>
FACTORY_COACH_MODEL=gpt-6-luna  # only if entitled, never inferred
FACTORY_COACH_APPROVED=false
FACTORY_COACH_PRIVACY_APPROVED=false
FACTORY_COACH_SAFEGUARDS_APPROVED=false
FACTORY_COACH_ZDR_CONFIRMED=false
FACTORY_COACH_FAMILY_CONSENT_CONFIRMED=false
FACTORY_COACH_PRIVATE_BROKER_APPROVED=false
FACTORY_COACH_AUDIO_APPROVED=false
FACTORY_COACH_AUDIO_PRIVACY_APPROVED=false
FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED=false
FACTORY_COACH_AUDIO_MAX_MICRO_USD=0
```

Also configure reviewed max turn budget, current price ceilings, output tokens
and price-review timestamp. The two Cloud Run identities must differ. No API
keys should be passed to the private service. Never activate audio based solely
on the model's consent flag.

## Network, operations and rollback

The gateway IAM audience and private endpoint must match exactly, with a
fresh identity token per request; this implementation refuses arbitrary hosts,
redirects, unauthenticated browser access and unreviewed price/consent flags.
Inspect IAM policy before any release. Verify no request body logs, no image or
voice uploads to GCS, conservative ledger settlement and emergency shutdown.
Use the existing `FACTORY_COACH_APPROVED=false` model switch and independent
audio approval flags for rollback. No automatic deploy workflow is included.

**Public-release blocker:** current Google Cloud OpenAI access is a private
preview, not an established public production entitlement. Written provider
approval is required, independent of code test results.
