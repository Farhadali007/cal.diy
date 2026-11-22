import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

/**
 * Virtual mock is required because OrganizationsRepository (imported for the
 * DI token) has runtime imports from @calcom/platform-libraries whose dist
 * is not built in a fresh checkout. Same pattern as
 * unified-calendars-freebusy.service.spec.ts.
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
import { OrganizationOwnershipService } from "./organization-ownership.service";
import type { UserWithProfile } from "@/modules/users/users.repository";

describe("OrganizationOwnershipService", () => {
  const adminUser = { id: 1, role: UserPermissionRole.ADMIN } as UserWithProfile;
  const agencyAdminUser = { id: 2, role: UserPermissionRole.USER } as UserWithProfile;
  const agencyMemberUser = { id: 3, role: UserPermissionRole.USER } as UserWithProfile;
  const outsiderUser = { id: 4, role: UserPermissionRole.USER } as UserWithProfile;

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

  function setup() {
    const organizationsRepository = {
      findById: jest.fn(),
      findManagedOrganizationLink: jest.fn(),
      findManagedOrganizationLinks: jest.fn(),
      createManagedOrganizationLink: jest.fn(),
      deleteManagedOrganizationLink: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        OrganizationsRepository,
        | "findById"
        | "findManagedOrganizationLink"
        | "findManagedOrganizationLinks"
        | "createManagedOrganizationLink"
        | "deleteManagedOrganizationLink"
      >
    >;
    const membershipsRepository = {
      isUserOrganizationAdmin: jest.fn(),
      findMembershipByOrgId: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<MembershipsRepository, "isUserOrganizationAdmin" | "findMembershipByOrgId">
    >;
    const service = new OrganizationOwnershipService(
      organizationsRepository as unknown as OrganizationsRepository,
      membershipsRepository as unknown as MembershipsRepository
    );
    return { organizationsRepository, membershipsRepository, service };
  }

  function orgsExist(orgs: jest.Mocked<Pick<OrganizationsRepository, "findById">>) {
    orgs.findById.mockImplementation(async ({ id }: { id: number }) => {
      if (id === 10) return agencyOrg;
      if (id === 11) return businessOrg;
      if (id === 12) return teamRow;
      return null;
    });
  }

  it("links a managed organization for an instance admin", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    // Existing-check (11) -> null; cycle walk (10) -> null; re-read (11) -> link.
    organizationsRepository.findManagedOrganizationLink.mockImplementation(async (id: number) => {
      if (id === 11 && organizationsRepository.createManagedOrganizationLink.mock.calls.length > 0)
        return linkRow as never;
      return null;
    });
    organizationsRepository.createManagedOrganizationLink.mockResolvedValue({} as never);

    const result = await service.linkManagedOrganization(adminUser, 10, 11);

    expect(result).toEqual(linkRow);
    expect(organizationsRepository.createManagedOrganizationLink).toHaveBeenCalledWith(10, 11);
    expect(membershipsRepository.isUserOrganizationAdmin).not.toHaveBeenCalled();
  });

  it("links for an admin of the manager org who is not an instance admin", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    organizationsRepository.findManagedOrganizationLink.mockImplementation(async (id: number) => {
      if (id === 11 && organizationsRepository.createManagedOrganizationLink.mock.calls.length > 0)
        return linkRow as never;
      return null;
    });
    organizationsRepository.createManagedOrganizationLink.mockResolvedValue({} as never);

    const result = await service.linkManagedOrganization(agencyAdminUser, 10, 11);

    expect(result).toEqual(linkRow);
    expect(membershipsRepository.isUserOrganizationAdmin).toHaveBeenCalledWith(2, 10);
    expect(organizationsRepository.createManagedOrganizationLink).toHaveBeenCalledWith(10, 11);
  });

  it("rejects linking for a non-admin outsider with 403", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);

    await expect(service.linkManagedOrganization(outsiderUser, 10, 11)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(organizationsRepository.createManagedOrganizationLink).not.toHaveBeenCalled();
  });

  it("rejects self-management with 400", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);

    await expect(service.linkManagedOrganization(adminUser, 10, 10)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("returns 409 when the org is already managed", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);
    organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow as never);

    await expect(service.linkManagedOrganization(adminUser, 10, 11)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(organizationsRepository.createManagedOrganizationLink).not.toHaveBeenCalled();
  });

  it("returns 400 when linking would create a management cycle", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);
    // 11 is unmanaged; 10 is managed by 11, so 10 managing 11 would cycle.
    organizationsRepository.findManagedOrganizationLink.mockImplementation(async (id: number) => {
      if (id === 10)
        return {
          managerOrganizationId: 11,
          managedOrganizationId: 10,
        } as never;
      return null;
    });

    await expect(service.linkManagedOrganization(adminUser, 10, 11)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(organizationsRepository.createManagedOrganizationLink).not.toHaveBeenCalled();
  });

  it("returns 404 when either side is not an organization", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);

    await expect(service.linkManagedOrganization(adminUser, 12, 11)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service.linkManagedOrganization(adminUser, 10, 99)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("unlinks for an admin and returns the removed link", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);
    organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow as never);
    organizationsRepository.deleteManagedOrganizationLink.mockResolvedValue({} as never);

    const result = await service.unlinkManagedOrganization(adminUser, 10, 11);

    expect(result).toEqual(linkRow);
    expect(organizationsRepository.deleteManagedOrganizationLink).toHaveBeenCalledWith(11);
  });

  it("returns 404 when unlinking a link owned by a different manager", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);
    organizationsRepository.findManagedOrganizationLink.mockResolvedValue({
      ...linkRow,
      managerOrganizationId: 99,
    } as never);

    await expect(service.unlinkManagedOrganization(adminUser, 10, 11)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(organizationsRepository.deleteManagedOrganizationLink).not.toHaveBeenCalled();
  });

  it("lists managed organizations for a member of the manager org", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      accepted: true,
    } as never);
    organizationsRepository.findManagedOrganizationLinks.mockResolvedValue([linkRow] as never);

    const result = await service.listManagedOrganizations(agencyMemberUser, 10);

    expect(result).toEqual([linkRow]);
  });

  it("rejects listing for an outsider with 403", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);

    await expect(service.listManagedOrganizations(outsiderUser, 10)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(organizationsRepository.findManagedOrganizationLinks).not.toHaveBeenCalled();
  });

  it("returns the manager organization for a member of the managed org", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      accepted: true,
    } as never);
    organizationsRepository.findManagedOrganizationLink.mockResolvedValue(linkRow as never);

    const result = await service.getManagerOrganization(agencyMemberUser, 11);

    expect(result).toEqual(agencyOrg);
  });

  it("returns 404 for the manager of an unmanaged organization", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      accepted: true,
    } as never);
    organizationsRepository.findManagedOrganizationLink.mockResolvedValue(null);

    await expect(service.getManagerOrganization(agencyMemberUser, 11)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
