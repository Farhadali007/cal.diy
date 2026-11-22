# Secure API access (task 2.6)

- **Date:** 2026-11-22 (Phase 2, task 2.6)
- **Status:** Design decided; calendars permission gap fixed; rate limiting verified enforced.

## 1. Design decision — mandate OAuth-client credentials for VOICERO integrations

**Decision:** VOICERO integrations authenticate to this API with **per-organization
OAuth client credentials** (`x-cal-client-id` / `x-cal-secret-key`), one client
per business org (created by the provisioning flow, task 2.5), with
least-privilege permissions. The **admin API key is used ONLY for
provisioning acts** (org create, org link, OAuth client create) and health
checks — never for ongoing business operations.

**Why not build scoped API keys instead:** the platform already has a scoped
credential — the OAuth client with its 10-bit permission bitmask
(`BOOKING/EVENT_TYPE/SCHEDULE/APPS/PROFILE × READ/WRITE`,
`packages/platform/constants/permissions.ts`), enforced by `PermissionsGuard`.
Building a second scoping system for plain API keys would duplicate it. The
gap was never the credential model; it was that some endpoints never asked
the guard for a permission (see §3).

**Enforcement point:** VOICERO-side, in Phase 3 task 3.1
(`CalcomProviderFactory` Cal.diy mode): business operations use the per-org
client credentials stored encrypted in VOICERO's `integrations` table; the
admin key is used only by the provisioning orchestrator (2.5). This fork
cannot distinguish "VOICERO's admin key" from any other API key, so the
separation is enforced by VOICERO's code, not by this API.

**Plain API keys bypass permission checks — by upstream design.**
`PermissionsGuard` returns `true` immediately for API-key, NextAuth-session,
and third-party-token callers
(`apps/api/v2/src/modules/auth/guards/permissions/permissions.guard.ts`:
"only check permissions for accessTokens attached to platform oAuth Client
or platform oAuth credentials, not for next token or api key or third party
oauth client"). Consequence: **the admin API key is a root credential.**
It must live server-side only, never in widget JavaScript, never in logs,
and its rotation procedure is a Phase 4 item. Scoping only constrains
OAuth-client-credential callers — which is exactly why VOICERO integrations
must use them.

**How client-credentials auth works** (`api-auth.strategy.ts`): the client
secret authenticates the client, and the request runs as the org's OWNER
(or ADMIN) user with `request.organizationId` set to the client's org. That
is why permission-scoping the calendars endpoints matters: without it, a
leaked per-org client secret could manage the org owner's connected
calendars.

## 2. Rate limiting — verified enforced (the TODOs were stale)

`CustomThrottlerGuard` is a **global** `APP_GUARD`
(`app.module.ts`), Redis-backed (`ThrottlerStorageRedisService`), so every
API v2 route is throttled. The `// TODO: apply ratelimits` comments in
`modules/endpoints.module.ts` and `platform/platform-endpoints-module.ts`
were stale and have been replaced with a pointer to the guard (task 2.6).

Verified behavior (`apps/api/v2/src/lib/throttler-guard.ts`):

| Caller | Default limit | TTL | Block |
|---|---|---|---|
| API key (`cal_…`) | 120/min (`RATE_LIMIT_DEFAULT_LIMIT_API_KEY`) | 60 s | 60 s |
| OAuth client | 500/min (`RATE_LIMIT_DEFAULT_LIMIT_OAUTH_CLIENT`) | 60 s | 60 s |
| Access token | 500/min (`RATE_LIMIT_DEFAULT_LIMIT_ACCESS_TOKEN`) | 60 s | 60 s |
| Other / IP | 120/min (`RATE_LIMIT_DEFAULT_LIMIT`) | 60 s | 60 s |

- Trackers are per-credential (sha256 of the stripped API key; OAuth client
  id; access token) or per-IP — one caller cannot exhaust another's budget.
- Per-API-key custom limits can be stored in the `RateLimit` table (cached
  1 h in Redis); an unknown API-key hash is rejected with 401 by the guard.
- Per-endpoint `@Throttle()` overrides exist where abuse matters most
  (booking attendee/guest/location mutations, atoms verification, verified
  resources). **No `@SkipThrottle()` exists anywhere** — nothing is exempt.
- Responses carry `X-RateLimit-Limit/Remaining/Reset` headers.

VOICERO's provisioning bursts (2.5: ~6 calls per business) and booking
traffic sit far below these limits; no VOICERO-side throttling is needed.
A 429 from this API is returned as an error by `CalcomApiClient` and the
caller decides (booking callers fail closed).

## 3. Permission gaps fixed in 2.6

**Calendars controller** (`platform/calendars/controllers/calendars.controller.ts`):
only `check` had `PermissionsGuard` + `@Permissions([APPS_READ])`. The other
eight handlers ran `ApiAuthGuard` only, so any authenticated OAuth client —
even one with **zero** permissions — could read busy times, list calendars,
save ICS feeds, save Apple credentials, and disconnect the org owner's
calendars. Fixed: six handlers now run `PermissionsGuard` with the matching
permission (reads `APPS_READ`: `checkIcsFeed`, `getBusyTimes`,
`getCalendars`; writes `APPS_WRITE`: `createIcsFeed`, `syncCredentials`,
`deleteCalendarCredentials`). Regression tests:
`modules/auth/guards/permissions/permissions-coverage.spec.ts` (16/16).

## 4. Deliberately NOT changed (read before "fixing")

- **Public booking handlers have no @Permissions — by design.** Bookings
  create/get/reschedule/cancel (both 2024-08-13 and 2024-04-15) and the
  2024-06-14 event-type list use `OptionalApiAuthGuard`: they serve the
  public attendee flow. `PermissionsGuard` **throws** when a handler
  requires permissions but the request carries no auth at all, so adding a
  permission here would 403 every unauthenticated booking. The 2024-04-15
  controller additionally authenticates manually inside its handlers
  (`checkBookingRequiresAuthentication`). The management operations
  (confirm/decline/reassign/mark-absent, list, recordings, transcripts)
  already carry `BOOKING_READ`/`BOOKING_WRITE`.
- **Calendars `save` (OAuth callback) has no guard at all — by design.** It
  is the browser redirect landing for Google/Microsoft OAuth; the `state`
  token authenticates the flow. Adding any guard would break calendar
  connections.
- **Calendars `redirect` (connect) needs no permission.** It already carries
  `@ApiAuthGuardOnlyAllow(["API_KEY", "ACCESS_TOKEN",
  "THIRD_PARTY_ACCESS_TOKEN"])`, which excludes OAuth client credentials.
- **Slots have no PermissionsGuard — by design.** Availability lookup is the
  public booking surface (optional auth, incl. unauthenticated embeds).
- **Organizations controller has no PermissionsGuard — by design.**
  Provisioning is admin-gated in the services (instance ADMIN or org
  OWNER/ADMIN; tasks 2.1/2.2/2.4/2.5). OAuth clients must never create orgs.
- **Public event-type endpoints** (`/:username/:eventSlug/public`,
  `/:username/public`) are intentionally public.

## 5. Residuals

- The OrganizationsController's admin check reads `user.role` from the
  authenticated user object. For client-credentials auth that user is the
  org OWNER — if the org owner is an instance admin, a leaked business
  client secret could call provisioning endpoints. Mitigation: client
  secrets are stored encrypted per business (2.5), and VOICERO's platform
  admin is a dedicated account, never a business owner. A stricter fix
  (require API-key auth specifically on the organizations controller) is a
  Phase 4 hardening candidate, not a 2.6 blocker.
- Rate-limit behavior under real load (429 shape, header presence) is
  proven only by live test, not unit test — a Phase 4 (1.9/4.1) item once
  the dev install runs.
