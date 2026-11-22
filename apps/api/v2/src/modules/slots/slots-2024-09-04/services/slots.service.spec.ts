import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

/**
 * Virtual mocks are required because SlotsService_2024_09_04's Nest DI
 * metadata pulls AvailableSlotsService at runtime, and that file imports
 * @calcom/platform-libraries/slots, whose dist is not built in a fresh
 * checkout. Same pattern as permissions-coverage.spec.ts. Without these the
 * suite cannot load in this checkout (pre-existing environment limitation,
 * not a regression — the import chain is unchanged from baseline).
 */
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    SchedulingType: { ROUND_ROBIN: "ROUND_ROBIN", COLLECTIVE: "COLLECTIVE", MANAGED: "MANAGED" },
  }),
  { virtual: true }
);
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

/**
 * The real AvailableSlotsService extends platform-libraries classes and
 * pulls a deep repository graph at import time. The spec never instantiates
 * it (the TestingModule provides its own mock), so stub the module.
 */
jest.mock("@/lib/services/available-slots.service", () => ({
  AvailableSlotsService: class MockAvailableSlotsService {},
}));

import { SlotsService_2024_09_04 } from "./slots.service";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { AvailableSlotsService } from "@/lib/services/available-slots.service";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { MembershipsService } from "@/modules/memberships/services/memberships.service";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { SlotsInputService_2024_09_04 } from "@/modules/slots/slots-2024-09-04/services/slots-input.service";
import { SlotsOutputService_2024_09_04 } from "@/modules/slots/slots-2024-09-04/services/slots-output.service";
import { SlotsRepository_2024_09_04 } from "@/modules/slots/slots-2024-09-04/slots.repository";
import { TeamsRepository } from "@/modules/teams/teams/teams.repository";

describe("SlotsService_2024_09_04", () => {
  let service: SlotsService_2024_09_04;
  let eventTypesRepository: EventTypesRepository_2024_06_14;
  let availableSlotsService: AvailableSlotsService;
  let slotsInputService: SlotsInputService_2024_09_04;
  let slotsOutputService: SlotsOutputService_2024_09_04;
  let slotsRepository: SlotsRepository_2024_09_04;
  let organizationsRepository: OrganizationsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotsService_2024_09_04,
        {
          provide: SlotsInputService_2024_09_04,
          useValue: {
            transformGetSlotsQuery: jest.fn(),
            transformRoutingGetSlotsQuery: jest.fn(),
          },
        },
        {
          provide: EventTypesRepository_2024_06_14,
          useValue: {
            getEventTypeById: jest.fn(),
            getEventTypeWithHosts: jest.fn(),
          },
        },
        {
          provide: SlotsRepository_2024_09_04,
          useValue: {
            findActiveOverlappingBooking: jest.fn(),
            getOverlappingSlotReservation: jest.fn(),
            createSlot: jest.fn(),
          },
        },
        {
          provide: SlotsOutputService_2024_09_04,
          useValue: {
            getAvailableSlots: jest.fn().mockResolvedValue({
              slots: {
                "2024-01-15": [{ time: "2024-01-15T10:00:00.000Z" }, { time: "2024-01-15T11:00:00.000Z" }],
              },
            }),
            getReservationSlotCreated: jest.fn().mockImplementation((slot: unknown) => slot),
          },
        },
        {
          provide: OrganizationsRepository,
          useValue: {
            isEventTypeOrgSuspended: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AvailableSlotsService,
          useValue: {
            getAvailableSlots: jest.fn(),
          },
        },
        {
          provide: MembershipsService,
          useValue: {},
        },
        {
          provide: MembershipsRepository,
          useValue: {},
        },
        {
          provide: TeamsRepository,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SlotsService_2024_09_04>(SlotsService_2024_09_04);
    slotsInputService = module.get<SlotsInputService_2024_09_04>(SlotsInputService_2024_09_04);
    eventTypesRepository = module.get<EventTypesRepository_2024_06_14>(EventTypesRepository_2024_06_14);
    availableSlotsService = module.get<AvailableSlotsService>(AvailableSlotsService);
    slotsOutputService = module.get<SlotsOutputService_2024_09_04>(SlotsOutputService_2024_09_04);
    slotsRepository = module.get<SlotsRepository_2024_09_04>(SlotsRepository_2024_09_04);
    organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);

    jest.clearAllMocks();
    // Default: org not suspended (pre-existing behavior). Suspension tests
    // override this per test; clearAllMocks keeps implementations, so reset
    // the default explicitly to avoid leaking a `true` between tests.
    (organizationsRepository.isEventTypeOrgSuspended as jest.Mock).mockResolvedValue(false);
  });

  describe("getAvailableSlotsWithRouting", () => {
    const sharedTestData = {
      eventTypeId: 123,
      start: "2024-01-15T00:00:00.000Z",
      end: "2024-01-16T00:00:00.000Z",
      timeZone: "America/New_York",
      mockEventType: {
        id: 123,
        slug: "test-event",
        teamId: null, // Not a team event
        length: 30,
      },
      mockSlotsResponse: {
        slots: {},
      },
      baseInputQuery: {
        type: "byEventTypeId" as const,
        isTeamEvent: false,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        duration: undefined,
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
      },
      routingParams: {
        routedTeamMemberIds: [456, 789],
        skipContactOwner: true,
        teamMemberEmail: "test@example.com",
      },
    };

    beforeEach(() => {
      // Setup shared mocks
      (eventTypesRepository.getEventTypeById as jest.Mock).mockResolvedValue(sharedTestData.mockEventType);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue(
        sharedTestData.mockSlotsResponse
      );
    });

    it("should call getAvailableSlots with correct routing parameters", async () => {
      const inputQuery = {
        ...sharedTestData.baseInputQuery,
        ...sharedTestData.routingParams,
      };

      // Mock the transform method to return the expected transformed query
      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        ...sharedTestData.routingParams,
      };
      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);

      await service.getAvailableSlotsWithRouting({
        ...inputQuery,
      });

      const { start: _1, end: _2, type: _3, ...queryWithoutStartEndAndType } = sharedTestData.baseInputQuery;

      expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: {
          ...queryWithoutStartEndAndType,
          startTime: "2024-01-15T00:00:00.000Z",
          endTime: "2024-01-16T23:59:59.000Z",
          ...sharedTestData.routingParams,
        },
        ctx: {},
      });
    });
  });

  describe("getAvailableSlotsWithRouting - Error Scenarios", () => {
    const baseInputQuery = {
      type: "byEventTypeId" as const,
      eventTypeId: 123,
      start: "2024-01-15T00:00:00.000Z",
      end: "2024-01-16T00:00:00.000Z",
      timeZone: "America/New_York",
    };

    it("should handle when event type is not found", async () => {
      const notFoundError = new NotFoundException("Event Type not found");
      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockRejectedValue(notFoundError);

      await expect(
        service.getAvailableSlotsWithRouting({
          ...baseInputQuery,
          teamMemberEmail: "test@example.com",
        })
      ).rejects.toThrow(NotFoundException);

      expect(slotsInputService.transformRoutingGetSlotsQuery).toHaveBeenCalledWith({
        ...baseInputQuery,
        teamMemberEmail: "test@example.com",
      });
    });

    it("should handle invalid time range error and throw BadRequestException", async () => {
      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-16T00:00:00.000Z",
        endTime: "2024-01-15T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        routedTeamMemberIds: null,
        skipContactOwner: false,
        teamMemberEmail: null,
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockRejectedValue(
        new Error("Invalid time range given - start time must be before end time")
      );

      await expect(service.getAvailableSlotsWithRouting(baseInputQuery)).rejects.toThrow(BadRequestException);

      await expect(service.getAvailableSlotsWithRouting(baseInputQuery)).rejects.toThrow(
        "Invalid time range given - check the 'start' and 'end' query parameters."
      );
    });

    it("should re-throw non-time-range errors without modification", async () => {
      const genericError = new Error("Database connection failed");
      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        routedTeamMemberIds: null,
        skipContactOwner: false,
        teamMemberEmail: null,
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockRejectedValue(genericError);

      await expect(service.getAvailableSlotsWithRouting(baseInputQuery)).rejects.toThrow(genericError);
    });

    it("should handle non-Error objects thrown by dependencies", async () => {
      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        routedTeamMemberIds: null,
        skipContactOwner: false,
        teamMemberEmail: null,
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      const nonErrorObject = { message: "Something went wrong", code: "UNKNOWN_ERROR" };
      (availableSlotsService.getAvailableSlots as jest.Mock).mockRejectedValue(nonErrorObject);

      await expect(service.getAvailableSlotsWithRouting(baseInputQuery)).rejects.toEqual(nonErrorObject);
    });
  });

  describe("getAvailableSlotsWithRouting - Edge Cases", () => {
    it("should handle null and undefined routing parameters", async () => {
      const input = {
        type: "byEventTypeId" as const,
        eventTypeId: 123,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        timeZone: "America/New_York",
        teamMemberEmail: undefined,
        routedTeamMemberIds: undefined,
        skipContactOwner: undefined,
      };

      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        teamMemberEmail: null,
        routedTeamMemberIds: null,
        skipContactOwner: false,
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue({ slots: {} });

      await service.getAvailableSlotsWithRouting(input);

      expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: expect.objectContaining({
          teamMemberEmail: null,
          routedTeamMemberIds: null,
          skipContactOwner: false,
        }),
        ctx: {},
      });
    });

    it("should handle empty routedTeamMemberIds array", async () => {
      const input = {
        type: "byEventTypeId" as const,
        eventTypeId: 123,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        timeZone: "America/New_York",
        routedTeamMemberIds: [],
      };

      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        routedTeamMemberIds: [],
        skipContactOwner: false,
        teamMemberEmail: null,
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue({ slots: {} });

      await service.getAvailableSlotsWithRouting(input);

      expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: expect.objectContaining({
          routedTeamMemberIds: [],
        }),
        ctx: {},
      });
    });

    it("should handle all routing parameters being provided", async () => {
      const input = {
        type: "byEventTypeId" as const,
        eventTypeId: 123,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        timeZone: "America/New_York",
        routedTeamMemberIds: [1, 2, 3],
        skipContactOwner: true,
        teamMemberEmail: "team@example.com",
      };

      const transformedQuery = {
        isTeamEvent: false,
        startTime: "2024-01-15T00:00:00.000Z",
        endTime: "2024-01-16T23:59:59.000Z",
        eventTypeId: 123,
        eventTypeSlug: "test-event",
        usernameList: [],
        timeZone: "America/New_York",
        orgSlug: null,
        rescheduleUid: null,
        routedTeamMemberIds: [1, 2, 3],
        skipContactOwner: true,
        teamMemberEmail: "team@example.com",
      };

      (slotsInputService.transformRoutingGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue({ slots: {} });

      await service.getAvailableSlotsWithRouting(input);

      expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: expect.objectContaining({
          routedTeamMemberIds: [1, 2, 3],
          skipContactOwner: true,
          teamMemberEmail: "team@example.com",
        }),
        ctx: {},
      });
    });
  });

  describe("org suspension (tasks 2.7/2.8)", () => {
    const transformedQuery = {
      isTeamEvent: false,
      startTime: "2024-01-15T00:00:00.000Z",
      endTime: "2024-01-16T23:59:59.000Z",
      eventTypeId: 123,
      eventTypeSlug: "test-event",
      usernameList: [],
      timeZone: "America/New_York",
      orgSlug: null,
      rescheduleUid: null,
    };

    it("getAvailableSlots returns empty slots for a suspended org without computing availability", async () => {
      (slotsInputService.transformGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (organizationsRepository.isEventTypeOrgSuspended as jest.Mock).mockResolvedValue(true);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue({
        slots: { "2024-01-15": [{ time: "2024-01-15T10:00:00.000Z" }] },
      });

      await service.getAvailableSlots({
        eventTypeId: 123,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        timeZone: "America/New_York",
      } as never);

      expect(organizationsRepository.isEventTypeOrgSuspended).toHaveBeenCalledWith(123);
      expect(availableSlotsService.getAvailableSlots).not.toHaveBeenCalled();
      expect(slotsOutputService.getAvailableSlots).toHaveBeenCalledWith(
        { slots: {} },
        123,
        undefined,
        undefined,
        "America/New_York"
      );
    });

    it("getAvailableSlots computes availability for an unsuspended org", async () => {
      (slotsInputService.transformGetSlotsQuery as jest.Mock).mockResolvedValue(transformedQuery);
      (availableSlotsService.getAvailableSlots as jest.Mock).mockResolvedValue({
        slots: { "2024-01-15": [{ time: "2024-01-15T10:00:00.000Z" }] },
      });

      await service.getAvailableSlots({
        eventTypeId: 123,
        start: "2024-01-15T00:00:00.000Z",
        end: "2024-01-16T00:00:00.000Z",
        timeZone: "America/New_York",
      } as never);

      expect(availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: transformedQuery,
        ctx: {},
      });
    });

    it("reserveSlot rejects a suspended org", async () => {
      (eventTypesRepository.getEventTypeWithHosts as jest.Mock).mockResolvedValue({
        id: 123,
        length: 30,
        userId: 7,
        seatsPerTimeSlot: null,
        schedulingType: null,
      });
      (organizationsRepository.isEventTypeOrgSuspended as jest.Mock).mockResolvedValue(true);

      await expect(
        service.reserveSlot({
          eventTypeId: 123,
          slotStart: "2024-01-15T10:00:00.000Z",
        } as never)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(slotsRepository.findActiveOverlappingBooking).not.toHaveBeenCalled();
    });

    it("reserveSlot proceeds for an unsuspended org", async () => {
      (eventTypesRepository.getEventTypeWithHosts as jest.Mock).mockResolvedValue({
        id: 123,
        length: 30,
        userId: 7,
        seatsPerTimeSlot: null,
        schedulingType: null,
      });
      (slotsRepository.findActiveOverlappingBooking as jest.Mock).mockResolvedValue(null);
      (slotsRepository.getOverlappingSlotReservation as jest.Mock).mockResolvedValue(null);
      (slotsRepository.createSlot as jest.Mock).mockResolvedValue({ uid: "slot-1" });

      const result = await service.reserveSlot({
        eventTypeId: 123,
        slotStart: "2024-01-15T10:00:00.000Z",
      } as never);

      expect(result).toEqual({ uid: "slot-1" });
      expect(slotsRepository.createSlot).toHaveBeenCalled();
    });
  });
});
