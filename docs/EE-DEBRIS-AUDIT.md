# Dead EE debris audit — VOICERO fork of Cal.diy

Task 1.11. Audit date: 2026-11-22. Baseline: upstream
`ae027bb70e694e2d2c44569f398d6cbcee0389b1` + VOICERO commits through
`e19563f`. Read-only audit — nothing stripped here. Stripping happens in
a later hardening pass (see Sequencing), after the 1.9 baseline proof.

Method: `rg`/`grep` over `apps/` + `packages/` (excluding `node_modules`),
Prisma schema reads, provider/route registration checks, and caller
counts. Every verdict below cites file evidence.

## Revision 2026-11-23 (task 4.7) — disable, don't strip

Founder decision 2026-11-23 (Final 6% order): prefer DISABLING unused
integrations over destructively removing working upstream code. The
1.11 strip plan below is revisited under that principle:

- Surfaces with a runtime disable point are DISABLED by configuration
  (the app-store disable list — see §8). No app code is deleted;
  re-enabling is one env line.
- Surfaces with zero runtime surface (dead code, unread env vars,
  unreachable branches) have their strip DEFERRED indefinitely: there
  is nothing to disable, and deleting working code buys nothing until
  a concrete reason appears (a CVE in an unused dependency, build
  weight, a confusing UI). The original strip plan stays below as the
  record of what to remove if that reason ever appears.
- Nothing in this revision authorizes a migration, a dependency
  removal, or a production change. Section headings keep the original
  verdict in parentheses so the 1.11 evidence stays readable; the
  summary table gains a revised column.

## 1. SAML / SSO — DEFER STRIP (inert; was STRIP)

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

## 2. DSync / SCIM — DEFER STRIP (inert schema; was STRIP)

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

## 3. Cal.ai / AI voice agents — DISABLE (was QUARANTINE)

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

## 5. License key (`CALCOM_LICENSE_KEY`) — DEFER (fake UI; was STRIP)

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

## 6. Stripe billing in API v2 — DEFER STRIP of billing half, KEEP payment-app half (was STRIP/KEEP)

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

## 8. App-store disable list (task 4.7) — DISABLE, don't strip

The 1.11 quarantine question (§3) is answered by configuration: the
fork disables 98 of the 106 catalog apps through a policy list and
keeps 8 enabled. No app code is deleted.

**Mechanism** (`packages/app-store/_utils/disabledApps.ts` — no
imports, so it cannot create a circular dependency): a default list of
98 disabled slugs (plus dirName aliases where the dirName differs from
the slug), matched by slug or dirName; `VOICERO_DISABLED_APPS`
(comma-separated) adds extras; `VOICERO_ENABLE_DISABLED_APPS`
re-enables (wins over both). Env is read lazily on every call.

**Enforcement points** (all server-side; existing credentials and
bookings keep working — disabling gates listing + new installs only):

- `packages/app-store/_appRegistry.ts` — `getAppWithMetadata` returns
  null for disabled apps, so `getAppRegistry` /
  `getAppRegistryWithCredentials` never list them and `/apps/[slug]`
  404s; the registry loops also pre-filter with
  `excludeDisabledApps`.
- `apps/web/pages/api/integrations/[...args].ts` — the `add` endpoint
  returns 403 for disabled apps (callbacks stay open so an in-flight
  install can complete).
- `packages/trpc/server/routers/viewer/apps/toggle.handler.ts` — the
  admin toggle refuses to re-enable a disabled app.
- `scripts/seed-app-store.ts` + `apps/web/app/api/cron/syncAppMeta/
  route.ts` — disabled apps seed/sync with `enabled=false`, so the
  cron cannot re-enable them when their keys validate.

**Kept enabled (8):** `google-calendar`, `office365-calendar`
(calendars — task 3.4 precedence), `ics-feed` (ICS),
`daily-video` (Cal Video — the founder keep-vs-replace decision is
STILL OPEN, so it stays enabled), `google-meet`, `msteams`, `zoom`
(conferencing), `stripe` (paid bookings — §6 KEEP half).

**Disabled (98):** every other catalog app, including the four AI
voice-agent apps (`retell-ai`, `fonio-ai`, `greetmate-ai`,
`millis-ai` — VOICERO has its own voice widget), all CRM/analytics/
automation/payment apps except Stripe, and all niche calendars
(Apple, CalDAV, Exchange 2013/2016, Feishu, Lark, Zoho) and
conferencing (Jitsi, Tandem, Huddle01, Webex, Whereby, …).
Re-enable candidates if the product needs them later: `jitsi`
(self-hosted conferencing fallback), `caldav-calendar`,
`zapier` / `make` — one env line each, no code change.

**Verified (4.7):** API v2 cannot install a disabled app — its only
credential-creation callers are the Zoom, MS Teams, and Stripe
services (`apps/api/v2/src/modules/conferencing/services/
zoom-video.service.ts:111`, `office365-video.service.ts:118`,
`modules/stripe/stripe.service.ts:126`), all kept apps. The event-type
location picker only offers apps the user has credentials for
(`packages/app-store/utils.ts` `getApps`), so a disabled app with no
credentials never appears as a location option. Unit tests:
`packages/app-store/_utils/disabledApps.test.ts`.

## Pointer for Phase 2 (not debris)

`apps/api/v2/src/modules/organizations/` contains only
`organizations.module.ts` + `index/organizations.repository.ts` — no
controller, no create route. Consistent with the Phase 0 finding that no
org-creation API exists; task 2.1 builds it.

## Sequencing rules for the strip pass

> NOTE (4.7): the strip pass is DEFERRED under the disable-first
> principle. These rules apply if/when a strip is ever approved.

1. Strip AFTER the 1.9 baseline proof, so the unmodified baseline is
   proven before anything is removed.
2. Code strips and schema strips are separate commits (schema changes
   need a Prisma migration + `yarn prisma generate` + zod regen).
3. Dependency removal needs `yarn install` + lockfile update.
4. Every strip commit runs the affected suites + type-check before push.
5. Never strip the payment-app half of Stripe, the read-replica knob,
   or the AI-agent apps without the founder app-scope decision.

## Summary table

| # | Surface | Verdict (1.11) | Revised (4.7) | Size |
|---|---|---|---|---|
| 1 | SAML / SSO | STRIP (code + dep + env; enum member with schema batch) | DEFER STRIP — inert, zero runtime surface | ~10 files + dep |
| 2 | DSync / SCIM | STRIP (schema + migration + regen) | DEFER STRIP — inert schema, zero code | 2 models + relations |
| 3 | Cal.ai / AI voice agents | QUARANTINE — founder app-scope decision | DISABLE — 4 AI apps on the policy list (§8); models stay | 4 apps + 2 models |
| 4 | Insights | KEEP — read-replica knob, document | KEEP (unchanged) | 0 files |
| 5 | License key | STRIP (fake UI: stub + prompt + field) | DEFER — stub gates nothing; prompt removal needs the setup-flow check first | ~6 files + migration |
| 6 | Stripe billing (API v2) | STRIP billing half; KEEP payment-app half | DEFER STRIP billing half (zero callers — re-verified 4.7); KEEP payment half | 1 service + app leftovers + env vars |
| 7 | Workflows | CONFIRMED GONE | CONFIRMED GONE (unchanged) | — |
| 8 | App-store scope (4.7) | — | DISABLE 98 apps by policy; KEEP 8 (§8) | 2 new files + 5 enforcement points |
