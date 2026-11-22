import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

/**
 * Virtual mocks are required because the wiring service's Nest DI metadata
 * pulls EventTypesService_2024_06_14 / SchedulesService_2024_06_11 at
 * runtime, and those files import @calcom/platform-libraries, whose dist
 * is not built in a fresh checkout. Same pattern as
 * permissions-coverage.spec.ts.
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

import type { MembershipsRepository } from "../../memberships/memberships.repository";
import type { OrganizationsRepository } from "../index/organizations.repository";
import { OrganizationWiringService } from "./organization-wiring.service";
import type { EventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/event-types.service";
import type { InputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/input-event-types.service";
import type { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";
import type { UserWithProfile, UsersRepository } from "@/modules/users/users.repository";

describe("OrganizationWiringService", () => {
  const adminUser = { id: 1, role: UserPermissionRole.ADMIN } as UserWithProfile;
  const orgAdminUser = { id: 2, role: UserPermissionRole.USER } as UserWithProfile;
  const orgMemberUser = { id: 3, role: UserPermissionRole.USER } as UserWithProfile;
  const outsiderUser = { id: 4, role: UserPermissionRole.USER } as UserWithProfile;
  const managedUser = { id: 42, role: UserPermissionRole.USER, username: "acme-dental" } as UserWithProfile;

  const businessOrg = {
    id: 11,
    name: "Acme Dental",
    slug: "acme-dental",
    isOrganization: true,
    parentId: null,
  } as Team;

  const defaultSchedule = { id: 7, name: "Working Hours", timeZone: "Europe/Berlin", isDefault: true };

  function setup() {
    const organizationsRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<Pick<OrganizationsRepository, "findById">>;
    const membershipsRepository = {
      isUserOrganizationAdmin: jest.fn(),
      findMembershipByOrgId: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<MembershipsRepository, "isUserOrganizationAdmin" | "findMembershipByOrgId">
    >;
    const usersRepository = {
      findByIdWithProfile: jest.fn(),
    } as unknown as jest.Mocked<Pick<UsersRepository, "findByIdWithProfile">>;
    const schedulesService = {
      getUserScheduleDefault: jest.fn(),
      createUserDefaultSchedule: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<SchedulesService_2024_06_11, "getUserScheduleDefault" | "createUserDefaultSchedule">
    >;
    const eventTypesService = {
      createUserEventType: jest.fn(),
    } as unknown as jest.Mocked<Pick<EventTypesService_2024_06_14, "createUserEventType">>;
    const inputEventTypesService = {
      transformAndValidateCreateEventTypeInput: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<InputEventTypesService_2024_06_14, "transformAndValidateCreateEventTypeInput">
    >;
    const service = new OrganizationWiringService(
      organizationsRepository as unknown as OrganizationsRepository,
      membershipsRepository as unknown as MembershipsRepository,
      usersRepository as unknown as UsersRepository,
      schedulesService as unknown as SchedulesService_2024_06_11,
      eventTypesService as unknown as EventTypesService_2024_06_14,
      inputEventTypesService as unknown as InputEventTypesService_2024_06_14
    );
    return {
      organizationsRepository,
      membershipsRepository,
      usersRepository,
      schedulesService,
      eventTypesService,
      inputEventTypesService,
      service,
    };
  }

  function orgExists(repos: ReturnType<typeof setup>["organizationsRepository"]) {
    repos.findById.mockImplementation(async ({ id }: { id: number }) => (id === 11 ? businessOrg : null));
  }

  function memberIsAccepted(repos: ReturnType<typeof setup>) {
    repos.usersRepository.findByIdWithProfile.mockResolvedValue(managedUser);
    repos.membershipsRepository.findMembershipByOrgId.mockResolvedValue({ accepted: true } as never);
  }

  describe("getOrCreateDefaultSchedule", () => {
    it("returns the existing default schedule without creating a duplicate", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      repos.schedulesService.getUserScheduleDefault.mockResolvedValue(defaultSchedule as never);
      const result = await repos.service.getOrCreateDefaultSchedule(adminUser, 11, {
        userId: 42,
        timeZone: "Europe/Berlin",
      });
      expect(result).toEqual(defaultSchedule);
      expect(repos.schedulesService.createUserDefaultSchedule).not.toHaveBeenCalled();
    });

    it("creates a default schedule when none exists", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      repos.schedulesService.getUserScheduleDefault.mockResolvedValue(null);
      repos.schedulesService.createUserDefaultSchedule.mockResolvedValue(defaultSchedule as never);
      const result = await repos.service.getOrCreateDefaultSchedule(adminUser, 11, {
        userId: 42,
        timeZone: "Europe/Berlin",
      });
      expect(result).toEqual(defaultSchedule);
      expect(repos.schedulesService.createUserDefaultSchedule).toHaveBeenCalledWith(42, "Europe/Berlin");
    });

    it("org admin can wire schedules; org member cannot", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      repos.membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
      repos.schedulesService.getUserScheduleDefault.mockResolvedValue(defaultSchedule as never);
      await expect(
        repos.service.getOrCreateDefaultSchedule(orgAdminUser, 11, { userId: 42, timeZone: "Europe/Berlin" })
      ).resolves.toEqual(defaultSchedule);

      repos.membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);
      await expect(
        repos.service.getOrCreateDefaultSchedule(orgMemberUser, 11, { userId: 42, timeZone: "Europe/Berlin" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects an invalid IANA timezone", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      await expect(
        repos.service.getOrCreateDefaultSchedule(adminUser, 11, { userId: 42, timeZone: "Not/AZone" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repos.schedulesService.getUserScheduleDefault).not.toHaveBeenCalled();
    });

    it("unknown user → 404; non-member user → 400", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      repos.usersRepository.findByIdWithProfile.mockResolvedValue(null);
      await expect(
        repos.service.getOrCreateDefaultSchedule(adminUser, 11, { userId: 99, timeZone: "Europe/Berlin" })
      ).rejects.toBeInstanceOf(NotFoundException);

      repos.usersRepository.findByIdWithProfile.mockResolvedValue(managedUser);
      repos.membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);
      await expect(
        repos.service.getOrCreateDefaultSchedule(adminUser, 11, { userId: 42, timeZone: "Europe/Berlin" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("unknown org → 404", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      await expect(
        repos.service.getOrCreateDefaultSchedule(adminUser, 99, { userId: 42, timeZone: "Europe/Berlin" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("outsider cannot wire schedules", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      repos.membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);
      await expect(
        repos.service.getOrCreateDefaultSchedule(outsiderUser, 11, { userId: 42, timeZone: "Europe/Berlin" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("createEventTypeForMember", () => {
    const input = {
      userId: 42,
      title: "Consultation",
      slug: "consultation",
      length: 30,
      scheduleId: 7,
    };

    it("creates the event type owned by the managed user", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      const transformed = { title: "Consultation", slug: "consultation", length: 30 };
      repos.inputEventTypesService.transformAndValidateCreateEventTypeInput.mockResolvedValue(
        transformed as never
      );
      const created = { id: 99, ownerId: 42, title: "Consultation", slug: "consultation" };
      repos.eventTypesService.createUserEventType.mockResolvedValue(created as never);

      const result = await repos.service.createEventTypeForMember(adminUser, 11, input);

      expect(result).toEqual(created);
      expect(repos.inputEventTypesService.transformAndValidateCreateEventTypeInput).toHaveBeenCalledWith(
        managedUser,
        {
          title: "Consultation",
          slug: "consultation",
          lengthInMinutes: 30,
          description: undefined,
          scheduleId: 7,
        }
      );
      expect(repos.eventTypesService.createUserEventType).toHaveBeenCalledWith(managedUser, transformed);
    });

    it("org admin can wire event types; org member cannot", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      memberIsAccepted(repos);
      repos.membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
      repos.inputEventTypesService.transformAndValidateCreateEventTypeInput.mockResolvedValue({} as never);
      repos.eventTypesService.createUserEventType.mockResolvedValue({ id: 99 } as never);
      await expect(repos.service.createEventTypeForMember(orgAdminUser, 11, input)).resolves.toEqual({
        id: 99,
      });

      repos.membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);
      await expect(repos.service.createEventTypeForMember(orgMemberUser, 11, input)).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("unknown user → 404; non-member user → 400", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      repos.usersRepository.findByIdWithProfile.mockResolvedValue(null);
      await expect(repos.service.createEventTypeForMember(adminUser, 11, input)).rejects.toBeInstanceOf(
        NotFoundException
      );

      repos.usersRepository.findByIdWithProfile.mockResolvedValue(managedUser);
      repos.membershipsRepository.findMembershipByOrgId.mockResolvedValue({ accepted: false } as never);
      await expect(repos.service.createEventTypeForMember(adminUser, 11, input)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it("unknown org → 404", async () => {
      const repos = setup();
      orgExists(repos.organizationsRepository);
      await expect(repos.service.createEventTypeForMember(adminUser, 99, input)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });
});
