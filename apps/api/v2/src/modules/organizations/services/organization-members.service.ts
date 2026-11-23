import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipsRepository } from "../../memberships/memberships.repository";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import type {
  AddOrganizationMemberInputDto,
  UpdateOrganizationMemberInputDto,
} from "@/modules/organizations/inputs/organization-members.input";
import type { UserWithProfile } from "@/modules/users/users.repository";
import { UsersRepository } from "@/modules/users/users.repository";

/**
 * Org member management for the VOICERO-admin-driven staff flow (task 2.4).
 *
 * Design decision: VOICERO-admin-driven, not fork UI. No teams/org settings
 * pages exist in Cal.diy (the invite/member UI went with the EE removal), and
 * VOICERO's management surface is its own dashboard (Phase 3, task 3.8),
 * which consumes this API. Memberships created here are auto-accepted: there
 * is no invite-accept UI in the fork, so a pending-membership email round-trip
 * has no completable path — the business admin provisions staff directly.
 *
 * New users are NOT created here: staff accounts come from the managed-users
 * endpoint (which already creates the org membership as MEMBER). This API
 * attaches EXISTING users, lists members, changes roles, and removes members.
 * OWNER is never assignable through it (see the input DTOs); the org creator
 * holds OWNER from provisioning (task 2.1).
 */
@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  private isInstanceAdmin(user: UserWithProfile): boolean {
    return user.role === UserPermissionRole.ADMIN;
  }

  private async requireOrganization(organizationId: number) {
    const organization = await this.organizationsRepository.findById({ id: organizationId });
    if (!organization || !organization.isOrganization) {
      throw new NotFoundException(`Organization with id ${organizationId} not found`);
    }
    return organization;
  }

  private async requireOrgAdmin(user: UserWithProfile, organizationId: number): Promise<void> {
    if (this.isInstanceAdmin(user)) return;
    const isAdmin = await this.membershipsRepository.isUserOrganizationAdmin(user.id, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException(`User ${user.id} is not an admin of organization ${organizationId}`);
    }
  }

  private async requireMembership(organizationId: number, userId: number) {
    const membership = await this.membershipsRepository.findMembershipByOrgId(organizationId, userId);
    if (!membership) {
      throw new NotFoundException(`User ${userId} is not a member of organization ${organizationId}`);
    }
    return membership;
  }

  private async requireNotLastOwner(
    organizationId: number,
    membership: { role: MembershipRole }
  ): Promise<void> {
    if (membership.role !== MembershipRole.OWNER) return;
    const ownerCount = await this.membershipsRepository.countOwnersByOrgId(organizationId);
    if (ownerCount <= 1) {
      throw new ConflictException(`Cannot remove or demote the last OWNER of organization ${organizationId}`);
    }
  }

  async listMembers(user: UserWithProfile, organizationId: number) {
    await this.requireOrganization(organizationId);
    await this.requireOrgAdmin(user, organizationId);
    return this.membershipsRepository.findMembershipsByOrgId(organizationId);
  }

  async addMember(user: UserWithProfile, organizationId: number, input: AddOrganizationMemberInputDto) {
    await this.requireOrganization(organizationId);
    await this.requireOrgAdmin(user, organizationId);

    if (input.role === MembershipRole.OWNER) {
      throw new BadRequestException("OWNER cannot be assigned through member management");
    }

    const targetUser = await this.usersRepository.findByEmail(input.email);
    if (!targetUser) {
      throw new NotFoundException(`User with email ${input.email} not found`);
    }

    const existing = await this.membershipsRepository.findMembershipByOrgId(organizationId, targetUser.id);
    if (existing) {
      throw new ConflictException(
        `User ${targetUser.id} is already a member of organization ${organizationId}`
      );
    }

    await this.membershipsRepository.createMembership(organizationId, targetUser.id, input.role, true);
    // Re-read for the member shape (membership + shaped user) the list/update
    // paths return. Never return the findByEmail row itself: it carries the
    // full user record including the password hash.
    const member = await this.membershipsRepository.findMembershipWithUser(organizationId, targetUser.id);
    if (!member) {
      throw new NotFoundException(
        `Membership for user ${targetUser.id} in organization ${organizationId} not found after creation`
      );
    }
    return member;
  }

  async updateMemberRole(
    user: UserWithProfile,
    organizationId: number,
    memberUserId: number,
    input: UpdateOrganizationMemberInputDto
  ) {
    await this.requireOrganization(organizationId);
    await this.requireOrgAdmin(user, organizationId);

    if (input.role === MembershipRole.OWNER) {
      throw new BadRequestException("OWNER cannot be assigned through member management");
    }

    const membership = await this.requireMembership(organizationId, memberUserId);
    await this.requireNotLastOwner(organizationId, membership);
    return this.membershipsRepository.updateMembershipRole(organizationId, memberUserId, input.role);
  }

  async removeMember(user: UserWithProfile, organizationId: number, memberUserId: number) {
    await this.requireOrganization(organizationId);
    await this.requireOrgAdmin(user, organizationId);

    const membership = await this.requireMembership(organizationId, memberUserId);
    await this.requireNotLastOwner(organizationId, membership);
    return this.membershipsRepository.deleteMembership(organizationId, memberUserId);
  }
}
