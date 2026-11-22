# Per-business wiring (task 2.8)

How a VOICERO business becomes a working scheduling tenant on the fork:
a default schedule, event types owned by the business's staff, connected
calendars, and suspension enforcement on every public booking path.

## What 2.8 built

### Org wiring endpoints (new)

`OrganizationWiringService` (`apps/api/v2/src/modules/organizations/services/organization-wiring.service.ts`),
exposed on `OrganizationsController`:

| Endpoint | Behaviour |
| --- | --- |
| `POST /v2/organizations/:id/schedules` | Get-or-create the default schedule for a member of the org. Body: `{ userId, timeZone }` (IANA, validated). Returns `CreateScheduleOutput_2024_06_11`. |
| `POST /v2/organizations/:id/event-types` | Create an event type **owned by** a member of the org. Body: `{ userId, title, slug, length, description?, scheduleId? }`. Returns the standard event-type shape via `EventTypeResponseTransformPipe`. |

Auth: instance ADMIN or org OWNER/ADMIN. The target user must be an
accepted member of the org (unknown user → 404, non-member → 400).
Manager orgs act through the platform admin key; ongoing wiring is the
business's own job.

### Why org-scoped endpoints exist

Upstream event-type creation is always for the authenticated user:
`EventTypesService_2024_06_14.createUserEventType(user, body)` uses
`getUserToCreateEvent(user)`, which returns the caller's own identity.
There is no userId/teamId/org parameter in the input. The wiring service
therefore resolves the target member, transforms the input through the
standard `InputEventTypesService_2024_06_14`, and creates the event type
with the **target** user — reusing the upstream validation and creation
path instead of duplicating it.

### Managed users already get a default schedule

`OAuthClientsService` creates a default schedule for a managed user when
a `timeZone` is passed at creation (`modules/oauth-clients/services/oauth-clients-users.service.ts:89-90`),
and VOICERO's 2.5 provisioning already passes `timeZone`. So the schedule
leg is get-or-create, never duplicate: the endpoint returns the existing
default schedule when one exists and creates one only when it does not.
VOICERO records the returned schedule id either way (see the 2.8 VOICERO
half on branch `launch/2.8-voicero-wiring`).

### Suspension enforcement on public paths (with task 2.7)

`OrganizationsRepository.isEventTypeOrgSuspended(eventTypeId)` resolves
ownership and reads the org's suspension flag:

- Team event type → the team itself if it is an org, else its parent org.
- User event type → the event type's profile org, else the owner's
  `organizationId` column.
- Returns `false` when the event type does not exist, is not org-owned,
  or the org has no settings row. That fail-open is correct, not a
  bypass: there is nothing to suspend in those cases.

Enforcement points:

| Path | Behaviour when suspended |
| --- | --- |
| `GET /v2/slots/available` (0904) | Returns empty slots (`{ slots: {} }`). Graceful, and does not reveal the suspension state to anonymous callers. |
| `POST /v2/slots/reserve` + `updateReservedSlot` (0904) | `403 Forbidden`. |
| `POST /v2/bookings` (0813 `createBooking`) | `403 Forbidden`, thrown immediately after the event-type resolution — before the scheduling-type branching, so regular, recurring, and seated bookings are all covered. This is the ultimate gate. |

Deliberately NOT gated: cancellations (an attendee must always be able
to cancel) and reschedules (moving an existing booking, not creating a
new business relationship). This is a product decision, recorded here.

## Connected calendars (verified, no fork build needed)

A managed user's access token drives the standard calendar connect flow:

1. `GET /v2/calendars/google/connect` with the managed user's Bearer
   token. The `redirect` handler allows `API_KEY`, `ACCESS_TOKEN`, and
   `THIRD_PARTY_ACCESS_TOKEN` (`platform/calendars/controllers/calendars.controller.ts:167-169`).
2. The OAuth state carries the caller's access token
   (`gcal.service.ts:69-74`), so the `save` callback attributes the
   credentials to the token's user — the managed user.
3. Credentials are per-user (`Credential.userId`); the Google OAuth app
   credentials are instance-level (`calendarsService.getAppKeys`), shared
   across businesses. Per-user tokens are what isolate businesses.

The remaining calendar handlers (`check`, `getBusyTimes`, `getCalendars`,
`createIcsFeed`, `syncCredentials`, `deleteCalendarCredentials`) are
scoped `APPS_READ` / `APPS_WRITE` per the task 2.6 fix.

## Tests

- `organization-wiring.service.spec.ts` — 11 tests: get-or-create both
  branches, auth matrix (admin / org admin / org member / outsider),
  timezone validation, unknown-user 404 / non-member 400, unknown-org 404.
- `slots.service.spec.ts` — 4 new tests (12 total with the 8 pre-existing):
  suspended → empty slots without computing availability; unsuspended →
  availability computed; reserveSlot rejects / proceeds.
- `bookings.service.spec.ts` — 3 tests, first spec for this service: a
  MANAGED event type throws `BadRequestException` immediately AFTER the
  gate, so reaching that error proves the gate passed.
- `organization-wiring.controller.e2e-spec.ts` — written, not run (needs
  Postgres; runs on VPS A at 1.9).

RED-proofs: neutering the bookings gate fails exactly the 2 denial
tests; neutering the slots availability branch fails exactly the
suspended-slots test. Both restored and re-greened.

## Residuals

- The 0415 bookings path uses separate `regularBookingService` /
  `recurringBookingService` (not the 0813 service) and is NOT gated. It
  is a legacy version (`@DocsExcludeController(true)`); gating it is a
  Phase 4 candidate.
- The web booking page (apps/web) is not gated either — same Phase 4
  candidate, grouped with the 0415 path.
- `isEventTypeOrgSuspended` is read-only and uncached; the booking and
  slots paths each add one small query per request. Acceptable at this
  scale; revisit if slot traffic grows.
