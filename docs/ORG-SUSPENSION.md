# Org-level suspension (task 2.7)

- **Date:** 2026-11-22 (Phase 2, task 2.7)
- **Status:** Implemented + unit-tested. Live e2e deferred to the 1.8/1.9 unblock.

## 1. What it is

An org-level `suspended` state on `OrganizationSettings` (schema +
migration `20261122000000_voicero_org_suspension`): `suspended`,
`suspendedAt`, `suspendedReason`, `suspendedById`. Existing orgs are NOT
suspended by default. The per-user `User.locked` flag exists upstream but
only blocks web login; org suspension is the VOICERO enforcement tool for a
whole business.

## 2. What suspension does (enforcement)

| Path | Effect |
|---|---|
| OAuth client credentials (`x-cal-client-id` / `x-cal-secret-key`) | **Rejected** at auth — `ApiAuthStrategy.oAuthClientStrategy` throws 401 for a suspended org. This blocks ALL API v2 access for the business (the VOICERO integration path). |
| Token refresh (`POST /v2/oauth/:clientId/refresh`) | **Rejected** — the endpoint runs `ApiAuthGuard`, which routes through the same strategy check. |
| Authorization-code exchange (`POST /v2/oauth/:clientId/exchange`) | **Refused** — `OAuthFlowService.exchangeAuthorizationToken` throws 400. No new tokens can be minted for a suspended org. The authorization code is NOT invalidated, so the exchange can succeed after a resume. |
| Platform admin API key | **Never blocked.** It is the recovery path (and the provisioning path). Suspension must never lock the operator out of unsuspending. |

## 3. Authorization

- **Suspend/resume:** instance ADMIN, or an accepted OWNER/ADMIN member of
  the org's MANAGER org (the agency). An unmanaged org can only be
  suspended by an instance ADMIN.
- **The org's own admins can NOT suspend or resume it.** Suspension is an
  enforcement act by the platform/agency; if the org could lift its own
  suspension it would be toothless. A business owner pausing their own
  business is a different feature (disable event types / OOO), not this.
- **Read status:** instance ADMIN, any accepted member of the org, or any
  accepted member of the manager org.
- **No cascade:** suspending a manager org does NOT suspend its managed
  orgs. Each business is suspended independently.
- **Reason required** when suspending (max 500 chars); resuming clears
  reason, timestamp, and actor.

## 4. Endpoints

- `GET /v2/organizations/:id/suspension` — status.
- `PATCH /v2/organizations/:id/suspension` — `{ suspended: boolean, reason?: string }`.

## 5. Deliberately NOT covered (residuals, with homes)

- **Existing access tokens remain valid until their own expiry.** Suspension
  blocks new issuance (exchange + refresh) but does not revoke tokens
  already issued. Bounded by the token TTL. Revocation-on-suspend is a
  Phase 4 hardening candidate.
- **Org API keys are not checked** (`apiKeyStrategy`). The platform admin
  key must never be blocked, and org API keys are a legacy path — per the
  2.6 decision, VOICERO integrations use OAuth client credentials. Adding
  the check needs team→org resolution (an API key's team may be a sub-team,
  not the org). Phase 4 hardening candidate.
- **Public slots / booking page are not checked.** A suspended org's event
  types still show availability on the public booking page, and a booking
  made through that page would still land. The VOICERO-driven path (widget
  → VOICERO backend → API) IS blocked. The slots seam belongs to task 2.8
  (per-business wiring), which builds the team→org resolution the check
  needs.
- **Web-UI login for org members is not blocked.** Suspension is enforced on
  the API surface (VOICERO's model: business owners manage booking setup via
  the VOICERO dashboard, not the Cal.diy web UI). Blocking web login is a
  follow-up for 2.8/4.1.
- **A missing OrganizationSettings row reads as "not suspended"** and cannot
  be suspended (the service throws 404 rather than fabricating a settings
  row with an invented `orgAutoAcceptEmail`). Every org created through the
  normal flow has a settings row; this only affects legacy data.

## 6. Tests

- `organization-suspension.service.spec.ts` — 16 tests (auth matrix,
  reason-required, resume-clears, missing-row behavior, 404s).
- `api-auth.strategy.spec.ts` — 5 tests (suspended rejected, unsuspended
  accepted, missing row accepted, wrong secret / unknown client unchanged).
  RED-proven: neutering the check fails exactly the rejection test.
- `oauth-flow.service.spec.ts` — 3 tests (exchange refused for suspended,
  minting works for unsuspended / missing row).
- `organization-suspension.controller.e2e-spec.ts` — written, NOT run
  (needs Postgres; VPS A at 1.9).
