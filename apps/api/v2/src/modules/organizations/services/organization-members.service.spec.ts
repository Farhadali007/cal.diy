import type { Team } from "@calcom/prisma/client";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/client";
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
import { OrganizationMembersService } from "./organization-members.service";
import type { UserWithProfile } from "@/modules/users/users.repository";

describe("OrganizationMembersService", () => {
  const adminUser = { id: 1, role: UserPermissionRole.ADMIN } as UserWithProfile;
  const orgAdminUser = { id: 2, role: UserPermissionRole.USER } as UserWithProfile;
  const orgMemberUser = { id: 3, role: UserPermissionRole.USER } as UserWithProfile;
  const outsiderUser = { id: 4, role: UserPermissionRole.USER } as UserWithProfile;

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
    parentId: 11,
  } as Team;

  const staffUser = {
    id: 42,
    email: "staff@acme-dental.com",
    name: "Dana Staff",
    username: "dana-staff",
  };
  const memberRow = {
    id: 7,
    userId: 42,
    role: MembershipRole.MEMBER,
    accepted: true,
    createdAt: new Date(),
    user: staffUser,
  };

  function setup() {
    const organizationsRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<Pick<OrganizationsRepository, "findById">>;
    const membershipsRepository = {
      isUserOrganizationAdmin: jest.fn(),
      findMembershipByOrgId: jest.fn(),
      findMembershipsByOrgId: jest.fn(),
      findMembershipWithUser: jest.fn(),
      createMembership: jest.fn(),
      updateMembershipRole: jest.fn(),
      deleteMembership: jest.fn(),
      countOwnersByOrgId: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        MembershipsRepository,
        | "isUserOrganizationAdmin"
        | "findMembershipByOrgId"
        | "findMembershipsByOrgId"
        | "findMembershipWithUser"
        | "createMembership"
        | "updateMembershipRole"
        | "deleteMembership"
        | "countOwnersByOrgId"
      >
    >;
    const usersRepository = {
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<import("@/modules/users/users.repository").UsersRepository, "findByEmail">
    >;
    const service = new OrganizationMembersService(
      organizationsRepository as unknown as OrganizationsRepository,
      membershipsRepository as unknown as MembershipsRepository,
      usersRepository as unknown as import("@/modules/users/users.repository").UsersRepository
    );
    return { organizationsRepository, membershipsRepository, usersRepository, service };
  }

  function orgsExist(orgs: jest.Mocked<Pick<OrganizationsRepository, "findById">>) {
    orgs.findById.mockImplementation(async ({ id }: { id: number }) => {
      if (id === 11) return businessOrg;
      if (id === 12) return teamRow;
      return null;
    });
  }

  it("lists members for an instance admin", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.findMembershipsByOrgId.mockResolvedValue([memberRow] as never);

    const result = await service.listMembers(adminUser, 11);

    expect(result).toEqual([memberRow]);
    expect(membershipsRepository.isUserOrganizationAdmin).not.toHaveBeenCalled();
  });

  it("lists members for an admin of the organization", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipsByOrgId.mockResolvedValue([memberRow] as never);

    const result = await service.listMembers(orgAdminUser, 11);

    expect(result).toEqual([memberRow]);
    expect(membershipsRepository.isUserOrganizationAdmin).toHaveBeenCalledWith(2, 11);
  });

  it("rejects listing for a plain member with 403", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);

    await expect(service.listMembers(orgMemberUser, 11)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipsRepository.findMembershipsByOrgId).not.toHaveBeenCalled();
  });

  it("returns 404 when listing members of a non-organization team", async () => {
    const { organizationsRepository, service } = setup();
    orgsExist(organizationsRepository);

    await expect(service.listMembers(adminUser, 12)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("adds an existing user as MEMBER, auto-accepted", async () => {
    const { organizationsRepository, membershipsRepository, usersRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    usersRepository.findByEmail.mockResolvedValue(staffUser as never);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);
    membershipsRepository.createMembership.mockResolvedValue({} as never);
    membershipsRepository.findMembershipWithUser.mockResolvedValue(memberRow as never);

    const result = await service.addMember(orgAdminUser, 11, {
      email: "staff@acme-dental.com",
      role: MembershipRole.MEMBER,
    });

    expect(result).toEqual(memberRow);
    expect(membershipsRepository.createMembership).toHaveBeenCalledWith(11, 42, MembershipRole.MEMBER, true);
  });

  it("returns 404 when adding an unknown email", async () => {
    const { organizationsRepository, membershipsRepository, usersRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      service.addMember(orgAdminUser, 11, { email: "ghost@example.com", role: MembershipRole.MEMBER })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipsRepository.createMembership).not.toHaveBeenCalled();
  });

  it("returns 409 when adding a user who is already a member", async () => {
    const { organizationsRepository, membershipsRepository, usersRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    usersRepository.findByEmail.mockResolvedValue(staffUser as never);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(memberRow as never);

    await expect(
      service.addMember(orgAdminUser, 11, {
        email: "staff@acme-dental.com",
        role: MembershipRole.MEMBER,
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(membershipsRepository.createMembership).not.toHaveBeenCalled();
  });

  it("returns 400 when adding with the OWNER role", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);

    await expect(
      service.addMember(orgAdminUser, 11, {
        email: "staff@acme-dental.com",
        role: MembershipRole.OWNER,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects adding for an outsider with 403", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);

    await expect(
      service.addMember(outsiderUser, 11, {
        email: "staff@acme-dental.com",
        role: MembershipRole.MEMBER,
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("updates a member's role", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(memberRow as never);
    membershipsRepository.updateMembershipRole.mockResolvedValue({
      ...memberRow,
      role: MembershipRole.ADMIN,
    } as never);

    const result = await service.updateMemberRole(orgAdminUser, 11, 42, {
      role: MembershipRole.ADMIN,
    });

    expect(result.role).toBe(MembershipRole.ADMIN);
    expect(membershipsRepository.updateMembershipRole).toHaveBeenCalledWith(11, 42, MembershipRole.ADMIN);
    expect(membershipsRepository.countOwnersByOrgId).not.toHaveBeenCalled();
  });

  it("returns 409 when demoting the last OWNER", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      ...memberRow,
      role: MembershipRole.OWNER,
    } as never);
    membershipsRepository.countOwnersByOrgId.mockResolvedValue(1);

    await expect(
      service.updateMemberRole(orgAdminUser, 11, 42, { role: MembershipRole.ADMIN })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(membershipsRepository.updateMembershipRole).not.toHaveBeenCalled();
  });

  it("allows demoting an OWNER when another OWNER remains", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      ...memberRow,
      role: MembershipRole.OWNER,
    } as never);
    membershipsRepository.countOwnersByOrgId.mockResolvedValue(2);
    membershipsRepository.updateMembershipRole.mockResolvedValue({
      ...memberRow,
      role: MembershipRole.ADMIN,
    } as never);

    const result = await service.updateMemberRole(orgAdminUser, 11, 42, {
      role: MembershipRole.ADMIN,
    });

    expect(result.role).toBe(MembershipRole.ADMIN);
  });

  it("returns 404 when updating a non-member", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);

    await expect(
      service.updateMemberRole(orgAdminUser, 11, 99, { role: MembershipRole.ADMIN })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns 400 when updating to the OWNER role", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);

    await expect(
      service.updateMemberRole(orgAdminUser, 11, 42, { role: MembershipRole.OWNER })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("removes a member", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(memberRow as never);
    membershipsRepository.deleteMembership.mockResolvedValue(memberRow as never);

    const result = await service.removeMember(orgAdminUser, 11, 42);

    expect(result).toEqual(memberRow);
    expect(membershipsRepository.deleteMembership).toHaveBeenCalledWith(11, 42);
  });

  it("returns 409 when removing the last OWNER", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue({
      ...memberRow,
      role: MembershipRole.OWNER,
    } as never);
    membershipsRepository.countOwnersByOrgId.mockResolvedValue(1);

    await expect(service.removeMember(orgAdminUser, 11, 42)).rejects.toBeInstanceOf(ConflictException);
    expect(membershipsRepository.deleteMembership).not.toHaveBeenCalled();
  });

  it("returns 404 when removing a non-member", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(true);
    membershipsRepository.findMembershipByOrgId.mockResolvedValue(null);

    await expect(service.removeMember(orgAdminUser, 11, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects removing for an outsider with 403", async () => {
    const { organizationsRepository, membershipsRepository, service } = setup();
    orgsExist(organizationsRepository);
    membershipsRepository.isUserOrganizationAdmin.mockResolvedValue(false);

    await expect(service.removeMember(outsiderUser, 11, 42)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
