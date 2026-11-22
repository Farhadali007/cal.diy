import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MembershipsRepository } from "../../memberships/memberships.repository";
import { OrganizationsRepository } from "../index/organizations.repository";
import { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Org-level suspension (VOICERO Calendar Engine, task 2.7).
 *
 * While suspended, an org's OAuth client credentials are rejected at auth
 * (ApiAuthStrategy), so all API access for the business stops. The platform
 * admin API key is never blocked — it is the recovery path.
 *
 * Authorization (deliberate):
 * - Suspend/resume: instance ADMIN, or an accepted OWNER/ADMIN member of
 *   the org's MANAGER org (the agency). An unmanaged org can only be
 *   suspended by an instance ADMIN.
 * - The suspended org's OWN admins can NOT suspend or resume it. Suspension
 *   is an enforcement act by the platform/agency; if the org could lift its
 *   own suspension it would be toothless. A business owner pausing their own
 *   business is a different feature (disable event types / OOO), not this.
 * - Read status: instance ADMIN, any accepted member of the manager org, or
 *   any accepted member of the org itself.
 *
 * No cascade: suspending a manager org does NOT suspend its managed orgs.
 * Each business is suspended independently — one agency suspension must not
 * silently kill every business under it.
 *
 * A missing OrganizationSettings row (legacy orgs) reads as "not suspended"
 * but cannot be suspended until the row exists — the service throws
 * NotFound rather than fabricating a settings row with an invented
 * orgAutoAcceptEmail.
 */
@Injectable()
export class OrganizationSuspensionService {
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

  private async requireSuspensionAccess(user: UserWithProfile, organizationId: number) {
    if (this.isInstanceAdmin(user)) {
      return;
    }
    const link = await this.organizationsRepository.findManagedOrganizationLink(organizationId);
    if (!link) {
      throw new ForbiddenException("Only a platform admin can suspend an unmanaged organization");
    }
    const isManagerAdmin = await this.membershipsRepository.isUserOrganizationAdmin(
      user.id,
      link.managerOrganizationId
    );
    if (!isManagerAdmin) {
      throw new ForbiddenException(
        "Only a platform admin or an admin of the managing organization can do this"
      );
    }
  }

  private async requireStatusAccess(user: UserWithProfile, organizationId: number) {
    if (this.isInstanceAdmin(user)) {
      return;
    }
    const membership = await this.membershipsRepository.findMembershipByOrgId(organizationId, user.id);
    if (membership?.accepted) {
      return;
    }
    const link = await this.organizationsRepository.findManagedOrganizationLink(organizationId);
    if (link) {
      const managerMembership = await this.membershipsRepository.findMembershipByOrgId(
        link.managerOrganizationId,
        user.id
      );
      if (managerMembership?.accepted) {
        return;
      }
    }
    throw new ForbiddenException("Only members of the organization or its managing organization can do this");
  }

  async getSuspension(user: UserWithProfile, organizationId: number) {
    await this.requireOrg(organizationId);
    await this.requireStatusAccess(user, organizationId);
    const suspension = await this.organizationsRepository.fetchOrgSuspension(organizationId);
    return {
      organizationId,
      suspended: suspension?.suspended ?? false,
      suspendedAt: suspension?.suspendedAt ?? null,
      suspendedReason: suspension?.suspendedReason ?? null,
      suspendedById: suspension?.suspendedById ?? null,
    };
  }

  async updateSuspension(
    user: UserWithProfile,
    organizationId: number,
    input: { suspended: boolean; reason?: string }
  ) {
    await this.requireOrg(organizationId);
    await this.requireSuspensionAccess(user, organizationId);

    const reason = input.reason?.trim() || null;
    if (input.suspended && !reason) {
      throw new BadRequestException("A reason is required when suspending an organization");
    }

    const existing = await this.organizationsRepository.fetchOrgSuspension(organizationId);
    if (!existing) {
      throw new NotFoundException(
        `Organization ${organizationId} has no settings row; suspension cannot be recorded`
      );
    }

    const updated = await this.organizationsRepository.updateOrgSuspension(organizationId, {
      suspended: input.suspended,
      suspendedAt: input.suspended ? new Date() : null,
      suspendedReason: reason,
      suspendedById: input.suspended ? user.id : null,
    });
    return {
      organizationId,
      suspended: updated.suspended,
      suspendedAt: updated.suspendedAt,
      suspendedReason: updated.suspendedReason,
      suspendedById: updated.suspendedById,
    };
  }
}
