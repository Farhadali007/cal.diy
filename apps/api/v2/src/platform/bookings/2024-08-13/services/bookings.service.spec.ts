import { BadRequestException, ForbiddenException } from "@nestjs/common";

/**
 * Focused spec for the task 2.8 suspension gate in
 * BookingsService_2024_08_13.createBooking: no new bookings for a suspended
 * org. Only the gate is covered here — the full booking flow has no unit
 * spec, and building one is out of scope for this task.
 *
 * Trick used for the "gate passes" case: a MANAGED event type throws
 * BadRequestException immediately AFTER the gate, so reaching that error
 * proves the gate passed without running the rest of the booking flow.
 *
 * Virtual mocks are required because the service's module graph reaches
 * @calcom/platform-libraries, whose dist is not built in a fresh checkout.
 * The graph is deep (input/output services, regular/recurring booking
 * services, platform-bookings service, prisma repositories), so every
 * subpath is mocked with a Proxy that returns a dummy class for any
 * export — enough for the modules to LOAD (extends/new at import time).
 * No platform-libraries code runs in these tests: the gate is exercised
 * before any booking-flow code is reached.
 */
const mockPlatformLibrariesModule = () => {
  const Dummy = class {};
  return new Proxy(
    { __esModule: true },
    {
      get: (target, prop) =>
        prop in target ? (target as Record<string | symbol, unknown>)[prop] : Dummy,
    }
  );
};
jest.mock("@calcom/platform-libraries", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/app-store", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/bookings", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/calendars", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/conferencing", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/emails", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/errors", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/event-types", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/organizations", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/private-links", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/repositories", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/schedules", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/slots", () => mockPlatformLibrariesModule(), { virtual: true });
jest.mock("@calcom/platform-libraries/tasker", () => mockPlatformLibrariesModule(), { virtual: true });

import { BookingsService_2024_08_13 } from "./bookings.service";
import { ErrorsBookingsService_2024_08_13 } from "./errors.service";
import type { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import type { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";

describe("BookingsService_2024_08_13.createBooking — org suspension (tasks 2.7/2.8)", () => {
  function setup() {
    const eventTypesRepository = {
      getEventTypeByIdWithOwnerAndTeam: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<EventTypesRepository_2024_06_14, "getEventTypeByIdWithOwnerAndTeam">
    >;
    const organizationsRepository = {
      isEventTypeOrgSuspended: jest.fn(),
    } as unknown as jest.Mocked<Pick<OrganizationsRepository, "isEventTypeOrgSuspended">>;
    const service = new BookingsService_2024_08_13(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      eventTypesRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ErrorsBookingsService_2024_08_13(),
      {} as never,
      {} as never,
      {} as never,
      organizationsRepository as never
    );
    return { eventTypesRepository, organizationsRepository, service };
  }

  const managedEventType = {
    id: 123,
    schedulingType: "MANAGED",
    team: null,
    bookingRequiresAuthentication: false,
  };
  const regularEventType = {
    id: 124,
    schedulingType: null,
    team: null,
    bookingRequiresAuthentication: false,
  };

  it("rejects a booking for a suspended org", async () => {
    const { eventTypesRepository, organizationsRepository, service } = setup();
    eventTypesRepository.getEventTypeByIdWithOwnerAndTeam.mockResolvedValue(managedEventType as never);
    organizationsRepository.isEventTypeOrgSuspended.mockResolvedValue(true);
    await expect(
      service.createBooking({} as never, { eventTypeId: 123 } as never, undefined as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createBooking({} as never, { eventTypeId: 123 } as never, undefined as never)
    ).rejects.toThrow(/suspended/i);
    expect(organizationsRepository.isEventTypeOrgSuspended).toHaveBeenCalledWith(123);
  });

  it("rejects regardless of scheduling type", async () => {
    const { eventTypesRepository, organizationsRepository, service } = setup();
    eventTypesRepository.getEventTypeByIdWithOwnerAndTeam.mockResolvedValue(regularEventType as never);
    organizationsRepository.isEventTypeOrgSuspended.mockResolvedValue(true);
    await expect(
      service.createBooking({} as never, { eventTypeId: 124 } as never, undefined as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("passes the gate for an unsuspended org (reaches the MANAGED check)", async () => {
    const { eventTypesRepository, organizationsRepository, service } = setup();
    eventTypesRepository.getEventTypeByIdWithOwnerAndTeam.mockResolvedValue(managedEventType as never);
    organizationsRepository.isEventTypeOrgSuspended.mockResolvedValue(false);
    // MANAGED event types cannot be booked — this error is thrown AFTER the
    // suspension gate, so reaching it proves the gate passed.
    await expect(
      service.createBooking({} as never, { eventTypeId: 123 } as never, undefined as never)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
