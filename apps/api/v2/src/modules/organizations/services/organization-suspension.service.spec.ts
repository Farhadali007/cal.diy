import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

/**
 * Virtual mock is required because OrganizationsRepository (imported for the
 * DI token) has runtime imports from @calcom/platform-libraries whose dist
 * is not built in a fresh checkout. Same pattern as
 * organization-ownership.service.spec.ts.
 */
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    credentialForCalendarServiceSelect: {},
  }),
  { virtual: true }
);

import type { MembershipsRepository } from "../../memberships/memberships.repository";
import type { OrganizationsRepository } from "../index/organizations.repository";
import { OrganizationSuspensionService } from "./organization-suspension.service";
import type { UserWithProfile } from "@/modules/users/users.repository";

describe("OrganizationSuspensionService", () => {
  const adminUser = { id: 1, role: UserPermissionRole.ADMIN } as UserWithProfile;
  const agencyAdminUser = { id: 2, role: UserPermissionRole.USER } as UserWithProfile;
  const agencyMemberUser = { id: 3, role: UserPermissionRole.USER } as UserWithProfile;
  const businessAdminUser = { id: 4, role: UserPermissionRole.USER } as UserWithProfile;
  const businessMemberUser = { id: 5, role: UserPermissionRole.USER } as UserWithProfile;
  const outsiderUser = { id: 6, role: UserPermissionRole.USER } as UserWithProfile;

  const agencyOrg = {
    id: 10,
    name: "Acme Agency",
    slug: "acme-agency",
    isOrganization: true,
    parentId: null,
  } as Team;
  const businessOrg = {
    id: 11,
    name: "Acme Dental",
    slug: "acme-dental",
    isOrganization: true,
    parentId: null,
  } as Team;
  const teamRow = {
    id: 12,
    name: "A Team",
    slug: "a-team",
    isOrganization: false,
    parentId: 10,
  } as Team;

  const linkRow = {
    managerOrganizationId: 10,
    managedOrganizationId: 11,
    createdAt: new Date(),
    managerOrganization: { id: 10, name: "Acme Agency", slug: "acme-agency" },
    managedOrganization: { id: 11, name: "Acme Dental", slug: "acme-dental" },
  };

  const unsuspendedRow = {
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
    suspendedById: null,
  };
  const suspendedRow = {
    suspended: true,
    suspendedAt: new Date("2026-11-22T00:00:00.000Z"),
    suspendedReason: "Payment overdue",
    suspendedById: 1,
  };

  function setup() {
    const organizationsRepository = {
      findById: jest.fn(),
      findManagedOrganizationLink: jest.fn(),
      fetchOrgSuspension: jest.fn(),
      updateOrgSuspension: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        OrganizationsRepository,
        "findById" | "findManagedOrganizationLink" | "fetchOrgSuspension" | "updateOrgSuspension"
      >
    >;
    const membershipsRepository = {
      isUserOrganizationAdmin: jest.fn(),
      findMembershipByOrgId: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<MembershipsRepository, "isUserOrganizationAdmin" | "findMembershipByOrgId">
    >;
    const service = new OrganizationSuspensionService(
      organizationsRepository as unknown as OrganizationsRepository,
      membershipsRepository as unknown as MembershipsRepository
    );
    return { organizationsRepository, membershipsRepository, service };
  }

  function orgsExist(repos: ReturnType<typeof setup>["organizationsRepository"]) {
    repos.findById.mockImplementation(async ({ id }: { id: number }) => {
      if (id === 10) return agencyOrg;
      if (id === 11) return businessOrg;
      if (id === 12) return teamRow;
      return null;
    });
  }

  describe("getSuspension", () => {
    it("instance admin reads the status", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(suspendedRow);
      const result = await service.getSuspension(adminUser, 11);
      expect(result).toEqual({ organizationId: 11, ...suspendedRow });
    });

    it("org member reads the status", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      membershipsRepository.findMembershipByOrgId.mockResolvedValue({ accepted: true } as never);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(unsuspendedRow);
      const result = await service.getSuspension(businessMemberUser, 11);
      expect(result.suspended).toBe(false);
    });

    it("manager-org member reads the status", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      membershipsRepository.findMembershipByOrgId.mockImplementation(async (orgId: number) =>
        orgId === 10 ? ({ accepted: true } as never) : null
      );
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(unsuspendedRow);
      const result = await service.getSuspension(agencyMemberUser, 11);
      expect(result.suspended).toBe(false);
    });

    it("outsider cannot read the status", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow);
      await expect(service.getSuspension(outsiderUser, 11)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("missing settings row reads as not suspended", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(null);
      const result = await service.getSuspension(adminUser, 11);
      expect(result).toEqual({
        organizationId: 11,
        suspended: false,
        suspendedAt: null,
        suspendedReason: null,
        suspendedById: null,
      });
    });

    it("unknown org → 404", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      await expect(service.getSuspension(adminUser, 99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("non-org team → 404", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      await expect(service.getSuspension(adminUser, 12)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateSuspension", () => {
    it("instance admin suspends with a reason", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(unsuspendedRow);
      organizationsRepository.updateOrgSuspension.mockResolvedValue(suspendedRow as never);
      const result = await service.updateSuspension(adminUser, 11, {
        suspended: true,
        reason: "Payment overdue",
      });
      expect(result.suspended).toBe(true);
      expect(organizationsRepository.updateOrgSuspension).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ suspended: true, suspendedReason: "Payment overdue", suspendedById: 1 })
      );
    });

    it("manager-org admin suspends a managed org", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow);
      membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(unsuspendedRow);
      organizationsRepository.updateOrgSuspension.mockResolvedValue({
        ...suspendedRow,
        suspendedById: 2,
      } as never);
      const result = await service.updateSuspension(agencyAdminUser, 11, {
        suspended: true,
        reason: "Abuse report",
      });
      expect(result.suspended).toBe(true);
      expect(result.suspendedById).toBe(2);
    });

    it("manager-org MEMBER cannot suspend", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow);
      membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);
      await expect(
        service.updateSuspension(agencyMemberUser, 11, { suspended: true, reason: "x" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("the org's OWN admin cannot suspend or resume it", async () => {
      const { organizationsRepository, membershipsRepository, service } = setup();
      orgsExist(organizationsRepository);
      // businessAdminUser IS an admin of org 11, but suspension requires the
      // MANAGER org (10) — isUserOrganizationAdmin is asked about org 10.
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow);
      membershipsRepository.isUserOrganizationAdmin.mockImplementation(
        async (_userId: number, orgId: number) => orgId === 11
      );
      await expect(
        service.updateSuspension(businessAdminUser, 11, { suspended: true, reason: "x" })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(membershipsRepository.isUserOrganizationAdmin).toHaveBeenCalledWith(4, 10);
    });

    it("unmanaged org can only be suspended by an instance admin", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.findManagedOrganizationLink.mockResolvedValue(null);
      await expect(
        service.updateSuspension(agencyAdminUser, 11, { suspended: true, reason: "x" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("suspending without a reason → 400", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      await expect(service.updateSuspension(adminUser, 11, { suspended: true })).rejects.toBeInstanceOf(
        BadRequestException
      );
      await expect(
        service.updateSuspension(adminUser, 11, { suspended: true, reason: "   " })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("resume clears reason, timestamp, and actor", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(suspendedRow);
      organizationsRepository.updateOrgSuspension.mockResolvedValue(unsuspendedRow as never);
      const result = await service.updateSuspension(adminUser, 11, { suspended: false });
      expect(result.suspended).toBe(false);
      expect(organizationsRepository.updateOrgSuspension).toHaveBeenCalledWith(11, {
        suspended: false,
        suspendedAt: null,
        suspendedReason: null,
        suspendedById: null,
      });
    });

    it("missing settings row → 404 on update (never fabricates a row)", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      organizationsRepository.fetchOrgSuspension.mockResolvedValue(null);
      await expect(
        service.updateSuspension(adminUser, 11, { suspended: true, reason: "x" })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(organizationsRepository.updateOrgSuspension).not.toHaveBeenCalled();
    });

    it("unknown org → 404", async () => {
      const { organizationsRepository, service } = setup();
      orgsExist(organizationsRepository);
      await expect(
        service.updateSuspension(adminUser, 99, { suspended: true, reason: "x" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
