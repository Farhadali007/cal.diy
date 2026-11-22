# Dead EE debris audit — VOICERO fork of Cal.diy

Task 1.11. Audit date: 2026-11-22. Baseline: upstream
`ae027bb70e694e2d2c44569f398d6cbcee0389b1` + VOICERO commits through
`e19563f`. Read-only audit — nothing stripped here. Stripping happens in
a later hardening pass (see Sequencing), after the 1.9 baseline proof.

Method: `rg`/`grep` over `apps/` + `packages/` (excluding `node_modules`),
Prisma schema reads, provider/route registration checks, and caller
counts. Every verdict below cites file evidence.

## 1. SAML / SSO — STRIP

Dead. No SAML provider is registered and no SAML code path is reachable.

- Dependency `@boxyhq/saml-jackson` 1.52.2 declared in
  `apps/web/package.json:34` (+ `yarn.lock`) but **never imported** by
  any code file. Its only mention is the `serverExternalPackages` entry
  in `apps/web/next.config.ts:233` (a bundling directive, not an import).
- Env vars `SAML_DATABASE_URL` / `SAML_ADMINS` (`.env.example:35-38`)
  have **zero code readers**.
- Registered NextAuth providers (`packages/features/auth/lib/next-auth-options.ts:303-335`):
  Credentials + Google (conditional) + AzureAD (conditional). No SAML
  provider. No SAML API route exists (`apps/web/pages/api`,
  `apps/web/app/api` have no `saml` matches).
- Unreachable residue: `saml-idp` callback branches
  (`next-auth-options.ts:304-313, 536-543, 808-815`, incl. the
  `SamlIdpUser` type), the `saml`/`saml-idp` mapping in
  `packages/features/auth/lib/identityProviders.ts:10-11`,
  `IdentityProvider.SAML` (`packages/prisma/schema.prisma:347`),
  SAML strings in `apps/web/app/(use-page-wrapper)/auth/error/page.tsx:46-51`,
  the `"saml"` login type in `apps/web/modules/auth/hooks/useLastUsed.tsx:7`,
  and `samlTenant` in `packages/types/next-auth.d.ts:48`.

**Strip plan:** remove the dependency (+ lockfile entries) and the
`serverExternalPackages` line; remove the two `.env.example` vars;
remove the unreachable branches/mapping/strings. The `SAML` enum member
needs a Prisma migration to remove (Postgres enum values cannot be
dropped casually) — do it in the schema strip batch with the DSync
models, or leave the single enum value as harmless residue and record
that choice.

## 2. DSync / SCIM — STRIP (schema)

Dead. Schema + generated artifacts only; zero hand-written code.

- Models `DSyncData` (`packages/prisma/schema.prisma:1785`) and
  `DSyncTeamGroupMapping` (`:1797`), with relations on `Team` (`:604`),
  `User` (`:719`), and `AttributeToUser` (`:1961-1968`, created/updated
  by DSync relations).
- Only other hits: generated Prisma client + zod schemas and the
  creating migration
  `packages/prisma/migrations/20241126132214_scim_attributes_sync_related_attrs_added/migration.sql`.

**Strip plan:** remove both models + all four relation fields, add a
Prisma migration dropping the tables, regenerate the Prisma client and
zod schemas (`yarn prisma generate` + the zod generator), run the
affected type-checks. Precondition: confirm no seed or later migration
references the tables.

## 3. Cal.ai / AI voice agents — QUARANTINE (do not strip unilaterally)

**Correction to the Phase 0 audit:** this is NOT schema-only. The models
back live, shipped app-store apps.

- `model Agent` (`packages/prisma/schema.prisma:2541`) holds a
  provider agent ID (e.g. Retell AI) with inbound/outbound event-type
  links; `model CalAiPhoneNumber` (`:2573`) links phone numbers to
  agents, users, and teams. Migrations
  `20250807134931_add_cal_ai_self_serve` and
  `20250817234749_add_cal_ai_voice_agents` created them.
- Four AI voice-agent apps ship in the catalog:
  `packages/app-store/retell-ai`, `fonio-ai`, `greetmate-ai`,
  `millis-ai` (retell-ai confirmed present in the generated
  `packages/app-store/apps.metadata.generated.ts`).
- The apps are inert without third-party API keys, but they are visible
  in the app catalog and add UI + build weight.

**Verdict:** quarantine, do not strip here. Whether the fork keeps all
100+ apps or trims to Google Calendar + conferencing + ICS is a founder
app-scope decision (FOUNDER-ACTIONS.md). Do NOT build VOICERO features
on these apps — VOICERO has its own voice widget. If the trim decision
lands, removing the four apps + the `Agent`/`CalAiPhoneNumber` models
(with migration) is one strip batch.

## 4. Insights — KEEP (document, not debris)

No Insights product exists: no `/insights` routes or UI in
`apps/web/app`. `INSIGHTS_DATABASE_URL` (`.env.example:21`) is read in
exactly one place — `packages/prisma/index.ts:86-89` — where it feeds
`readonlyPrisma`, a read-replica client that defaults to the main
`prisma` client when unset.

**Verdict:** keep. It is a functional read-replica knob, not an
analytics feature. Document it as such; do not present it as Insights.

## 5. License key (`CALCOM_LICENSE_KEY`) — STRIP (fake UI)

The license flow is a stub that always says valid.

- `packages/trpc/server/routers/viewer/deploymentSetup/validateLicense.handler.ts`:
  `LicenseKeyService.validateLicenseKey` returns `true`
  unconditionally. No network call, no phone-home — just a no-op.
- `packages/trpc/server/routers/viewer/deploymentSetup/update.handler.ts:13-14`
  stores the submitted `licenseKey` + `agreedLicenseAt` in the
  `Deployment` model; `apps/web/server/lib/setup/getServerSideProps.tsx:23-32`
  loads the env key into page props. Nothing gates on the value.
- i18n strings (`already_have_key_suggestion` etc.) still prompt for a
  key in the deployment-setup UI.

**Strip plan:** remove the license-key prompt from the setup UI, the
`validateLicense` route + stub service, and the `Deployment.licenseKey`
field (migration). Precondition: verify the setup flow does not gate
any step on the key being present — check the setup UI flow before
stripping. VOICERO never ships a fake "valid" check.

## 6. Stripe billing in API v2 — STRIP the billing half, KEEP the payment-app half

The module is mixed: live payment-app code and dead commercial billing
code share one service.

- Module: `apps/api/v2/src/modules/stripe/` (controller `/v2/stripe`:
  `/connect`, `/save`, `/check`; `stripe` 15.4.0 in
  `apps/api/v2/package.json:85`).
- **KEEP — Stripe Connect OAuth for `stripe_payment`** (paid bookings, a
  live feature): `getStripeRedirectUrl`, `saveStripeAccount`,
  `checkIfIndividualStripeAccountConnected`, `validateStripeCredentials`
  (`stripe.service.ts:60-145`).
- **STRIP — team billing:** `generateTeamCheckoutSession`
  (`stripe.service.ts:171-209`, `mode: "subscription"`) has **zero
  callers**. `getSubscription` / `getStripeCustomerId*` (`:216-262`)
  serve only the billing path — verify each caller before removing.
- `IS_TEAM_BILLING_ENABLED` is defined (`apps/api/v2/src/env.ts:34`,
  `config/app.ts:42`) and **never read anywhere else** — the flag is
  dead. Remove it (the dev compose sets it `false`; a no-op either way).
- Related commercial leftovers in the stripepayment app (same strip
  pass): the premium-plan subscription flow
  (`packages/app-store/stripepayment/api/subscription.ts`,
  `getPremiumMonthlyPlanPriceId`), `UserBillingPortalService`,
  `packages/app-store/_utils/paid-apps.ts`. These are upsell surfaces,
  not booking payments.
- `.env.example` billing vars (lines 174-193, 363, 369:
  `STRIPE_TEAM_*` / `STRIPE_ORG_*` price + product IDs,
  `STRIPE_WEBHOOK_SECRET_BILLING`, `STRIPE_PHONE_NUMBER_MONTHLY_PRICE_ID`)
  are dead commercial vars — remove in the strip pass. Keep
  `STRIPE_PRIVATE_KEY` / `STRIPE_CLIENT_ID` /
  `STRIPE_WEBHOOK_SECRET_APPS`, which the payment app uses (verify each
  before removing anything).

## 7. Workflows — CONFIRMED GONE, no action

No `Workflow` model in the schema; tables dropped by migration
`20260319000000_drop_workflow_tables`. The Cal.diy refactor removed the
feature. Nothing to strip. (VOICERO reuses its own notification system
per the directive; do not rebuild Cal.com Workflows.)

## Pointer for Phase 2 (not debris)

`apps/api/v2/src/modules/organizations/` contains only
`organizations.module.ts` + `index/organizations.repository.ts` — no
controller, no create route. Consistent with the Phase 0 finding that no
org-creation API exists; task 2.1 builds it.

## Sequencing rules for the strip pass

1. Strip AFTER the 1.9 baseline proof, so the unmodified baseline is
   proven before anything is removed.
2. Code strips and schema strips are separate commits (schema changes
   need a Prisma migration + `yarn prisma generate` + zod regen).
3. Dependency removal needs `yarn install` + lockfile update.
4. Every strip commit runs the affected suites + type-check before push.
5. Never strip the payment-app half of Stripe, the read-replica knob,
   or the AI-agent apps without the founder app-scope decision.

## Summary table

| # | Surface | Verdict | Size |
|---|---|---|---|
| 1 | SAML / SSO | STRIP (code + dep + env; enum member with schema batch) | ~10 files + dep |
| 2 | DSync / SCIM | STRIP (schema + migration + regen) | 2 models + relations |
| 3 | Cal.ai / AI voice agents | QUARANTINE — founder app-scope decision | 4 apps + 2 models |
| 4 | Insights | KEEP — read-replica knob, document | 0 files |
| 5 | License key | STRIP (fake UI: stub + prompt + field) | ~6 files + migration |
| 6 | Stripe billing (API v2) | STRIP billing half; KEEP payment-app half | 1 service + app leftovers + env vars |
| 7 | Workflows | CONFIRMED GONE | — |
