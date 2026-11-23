import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipsRepository } from "../../memberships/memberships.repository";
import { OrganizationsRepository } from "../index/organizations.repository";
import type { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Agency -> business ownership mapping, stored in the (previously unused)
 * ManagedOrganization table: a manager org (the VOICERO agency) links
 * managed orgs (its businesses). One manager per managed org
 * (managedOrganizationId is @unique); a manager may manage many orgs.
 *
 * VOICERO hierarchy: the agency itself is an org (created via
 * POST /v2/organizations with metadata { voiceroAgencyId }), each business
 * is an org (metadata { voiceroBusinessId }), and this service links them.
 * The VOICERO -> Cal.diy direction (which Cal.diy org id belongs to which
 * business) lives in VOICERO's database (Phase 3); this table is the
 * Cal.diy-side ownership record and the enforcement point for
 * agency-scoped access.
 *
 * Authorization: linking/unlinking needs instance ADMIN or an accepted
 * OWNER/ADMIN membership in the MANAGER org. Listing needs instance ADMIN
 * or any accepted membership in the manager org. Reading a managed org's
 * manager needs instance ADMIN or membership in the managed org.
 * No endpoint lets a user act on an org they have no relationship with.
 */
@Injectable()
export class OrganizationOwnershipService {
  constructor(
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository
  ) {}

  private async requireOrg(organizationId: number): Promise<Team> {
    const org = await this.organizationsRepository.findById({ id: organizationId });
    if (!org || !org.isOrganization || org.parentId !== null) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }
    return org;
  }

  private isInstanceAdmin(user: UserWithProfile) {
    return user.role === UserPermissionRole.ADMIN;
  }

  private async requireManagerAccess(user: UserWithProfile, managerOrganizationId: number) {
    if (this.isInstanceAdmin(user)) {
      return;
    }
    const isOrgAdmin = await this.membershipsRepository.isUserOrganizationAdmin(
      user.id,
      managerOrganizationId
    );
    if (!isOrgAdmin) {
      throw new ForbiddenException("Only an admin of the managing organization can do this");
    }
  }

  private async requireOrgMembership(user: UserWithProfile, organizationId: number) {
    if (this.isInstanceAdmin(user)) {
      return;
    }
    const membership = await this.membershipsRepository.findMembershipByOrgId(organizationId, user.id);
    if (!membership?.accepted) {
      throw new ForbiddenException("Only members of the organization can do this");
    }
  }

  /**
   * Walks the manager chain above startOrgId. Throws when the walk reaches
   * targetOrgId (linking would close a cycle) or exceeds maxDepth (a chain
   * that long indicates corrupt data, not a real agency hierarchy).
   */
  private async assertNoManagementCycle(startOrgId: number, targetOrgId: number, maxDepth = 50) {
    let currentId: number | null = startOrgId;
    for (let depth = 0; depth < maxDepth; depth++) {
      if (currentId === targetOrgId) {
        throw new BadRequestException("Linking these organizations would create a management cycle");
      }
      const link = await this.organizationsRepository.findManagedOrganizationLink(currentId);
      if (!link) {
        return;
      }
      currentId = link.managerOrganizationId;
    }
    throw new BadRequestException("Management chain is too deep to verify safety");
  }

  async linkManagedOrganization(
    user: UserWithProfile,
    managerOrganizationId: number,
    managedOrganizationId: number
  ) {
    await this.requireOrg(managerOrganizationId);
    await this.requireOrg(managedOrganizationId);
    await this.requireManagerAccess(user, managerOrganizationId);

    if (managerOrganizationId === managedOrganizationId) {
      throw new BadRequestException("An organization cannot manage itself");
    }

    const existing = await this.organizationsRepository.findManagedOrganizationLink(managedOrganizationId);
    if (existing) {
      throw new ConflictException(
        `Organization ${managedOrganizationId} is already managed by organization ${existing.managerOrganizationId}`
      );
    }

    await this.assertNoManagementCycle(managerOrganizationId, managedOrganizationId);

    await this.organizationsRepository.createManagedOrganizationLink(
      managerOrganizationId,
      managedOrganizationId
    );
    // Re-read with the org summaries for the response.
    const link = await this.organizationsRepository.findManagedOrganizationLink(managedOrganizationId);
    if (!link) {
      throw new NotFoundException(`Organization ${managedOrganizationId} is not managed by any organization`);
    }
    return link;
  }

  async unlinkManagedOrganization(
    user: UserWithProfile,
    managerOrganizationId: number,
    managedOrganizationId: number
  ) {
    await this.requireOrg(managerOrganizationId);
    await this.requireOrg(managedOrganizationId);
    await this.requireManagerAccess(user, managerOrganizationId);

    const link = await this.organizationsRepository.findManagedOrganizationLink(managedOrganizationId);
    if (!link || link.managerOrganizationId !== managerOrganizationId) {
      throw new NotFoundException(
        `Organization ${managedOrganizationId} is not managed by organization ${managerOrganizationId}`
      );
    }

    await this.organizationsRepository.deleteManagedOrganizationLink(managedOrganizationId);
    return link;
  }

  async listManagedOrganizations(user: UserWithProfile, managerOrganizationId: number) {
    await this.requireOrg(managerOrganizationId);
    await this.requireOrgMembership(user, managerOrganizationId);
    return this.organizationsRepository.findManagedOrganizationLinks(managerOrganizationId);
  }

  async getManagerOrganization(user: UserWithProfile, managedOrganizationId: number) {
    const managed = await this.requireOrg(managedOrganizationId);
    await this.requireOrgMembership(user, managed.id);
    const link = await this.organizationsRepository.findManagedOrganizationLink(managedOrganizationId);
    if (!link) {
      throw new NotFoundException(`Organization ${managedOrganizationId} is not managed by any organization`);
    }
    return this.requireOrg(link.managerOrganizationId);
  }
}
