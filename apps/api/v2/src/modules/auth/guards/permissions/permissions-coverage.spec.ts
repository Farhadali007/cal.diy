/**
 * Permission-coverage regression tests (task 2.6 — secure API access).
 *
 * These tests read decorator metadata off the CalendarsController — no HTTP
 * calls, no database. They lock in the 2.6 fix: a zero-permission OAuth
 * client must not be able to manage the org owner's connected calendars.
 * Removing a @Permissions decorator or the PermissionsGuard from any of
 * these handlers reopens that gap.
 *
 * NOTE on scope: the public booking handlers (create/get/reschedule/cancel)
 * and the optional-auth event-type list intentionally carry NO @Permissions
 * — adding one would make PermissionsGuard throw for unauthenticated
 * requests and break public bookings. That reasoning is recorded with
 * file:line evidence in docs/SECURE-API-ACCESS.md; it is NOT covered by
 * this spec because importing the bookings controllers pulls in repository
 * classes that extend @calcom/platform-libraries exports (unresolvable
 * in Jest without a built dist).
 */
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/app-store", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/bookings", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/calendars", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/conferencing", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/emails", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/errors", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/event-types", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/organizations", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/private-links", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/repositories", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/schedules", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/slots", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/tasker", () => ({}), { virtual: true });

import { APPS_READ, APPS_WRITE } from "@calcom/platform-constants";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { CalendarsController } from "@/platform/calendars/controllers/calendars.controller";

const reflector = new Reflector();

type ControllerMethod = (...args: never[]) => unknown;

function requiredPermissions(controller: object, method: string): readonly number[] | undefined {
  const handler = (controller as Record<string, ControllerMethod>)[method];
  return reflector.get(Permissions, handler);
}

function handlerGuards(controller: object, method: string): unknown[] {
  const handler = (controller as Record<string, ControllerMethod>)[method];
  return reflector.get(GUARDS_METADATA, handler) ?? [];
}

describe("API v2 permission coverage (task 2.6)", () => {
  describe("CalendarsController — permission-scoped (2.6 fix)", () => {
    const proto = CalendarsController.prototype;
    const cases: [string, number][] = [
      ["createIcsFeed", APPS_WRITE],
      ["checkIcsFeed", APPS_READ],
      ["getBusyTimes", APPS_READ],
      ["getCalendars", APPS_READ],
      ["check", APPS_READ],
      ["syncCredentials", APPS_WRITE],
      ["deleteCalendarCredentials", APPS_WRITE],
    ];

    it.each(cases)("%s requires permission %s", (method, permission) => {
      expect(requiredPermissions(proto, method)).toEqual([permission]);
    });

    it.each(cases)(" %s runs PermissionsGuard", (method) => {
      expect(handlerGuards(proto, method)).toContain(PermissionsGuard);
    });
  });

  describe("CalendarsController — intentionally unscoped", () => {
    const proto = CalendarsController.prototype;

    it("redirect (connect) has no @Permissions — ApiAuthGuardOnlyAllow already excludes OAuth client credentials", () => {
      expect(requiredPermissions(proto, "redirect")).toBeUndefined();
    });

    it("save (OAuth callback) has no @Permissions — unauthenticated by design, the state token authenticates the flow", () => {
      expect(requiredPermissions(proto, "save")).toBeUndefined();
    });
  });
});
