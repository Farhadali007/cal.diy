import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { IANAZone } from "luxon";
import { MembershipsRepository } from "../../memberships/memberships.repository";
import { OrganizationsRepository } from "../index/organizations.repository";
import { CreateOrganizationEventTypeInputDto, CreateOrganizationScheduleInputDto } from "../inputs/organization-wiring.input";
import { EventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/event-types.service";
import { InputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/input-event-types.service";
import { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";
import { UserWithProfile, UsersRepository } from "@/modules/users/users.repository";

/**
 * Per-business wiring (VOICERO Calendar Engine, task 2.8).
 *
 * The scheduling engine exists; what was missing is creating its resources
 * FOR a business's managed user instead of for the calling admin. The
 * generic event-type endpoint always creates for the authenticated user,
 * so VOICERO's provisioning (2.5) created the default event type under the
 * platform admin key. These org-scoped endpoints run as a provisioning act
 * (instance ADMIN or org OWNER/ADMIN) but create the resources owned by a
 * specified accepted member of the org — normally the managed user.
 *
 * Schedules: managed-user creation already creates a default schedule when
 * a timeZone is passed (upstream behavior), and VOICERO's provisioning
 * passes one — so the schedule endpoint is GET-OR-CREATE: it returns the
 * user's existing default schedule when one exists and only creates when
 * none does. Never creates a duplicate default schedule.
 *
 * Authorization: instance ADMIN or an accepted OWNER/ADMIN member of the
 * org. The manager org acts through the platform admin key for provisioning;
 * ongoing wiring management is the business's own job.
 */
@Injectable()
export class OrganizationWiringService {
  constructor(
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly schedulesService: SchedulesService_2024_06_11,
    private readonly eventTypesService: EventTypesService_2024_06_14,
    private readonly inputEventTypesService: InputEventTypesService_2024_06_14
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

  private async requireWiringAccess(user: UserWithProfile, organizationId: number) {
    if (this.isInstanceAdmin(user)) {
      return;
    }
    const isOrgAdmin = await this.membershipsRepository.isUserOrganizationAdmin(user.id, organizationId);
    if (!isOrgAdmin) {
      throw new ForbiddenException("Only a platform admin or an admin of the organization can do this");
    }
  }

  /** Returns the target user with profile, or throws when the user does not exist or is not an accepted member of the org. */
  private async requireOrgMember(organizationId: number, userId: number): Promise<UserWithProfile> {
    const target = await this.usersRepository.findByIdWithProfile(userId);
    if (!target) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const membership = await this.membershipsRepository.findMembershipByOrgId(organizationId, userId);
    if (!membership?.accepted) {
      throw new BadRequestException(`User ${userId} is not an accepted member of organization ${organizationId}`);
    }
    return target;
  }

  async getOrCreateDefaultSchedule(
    user: UserWithProfile,
    organizationId: number,
    input: CreateOrganizationScheduleInputDto
  ) {
    await this.requireOrg(organizationId);
    await this.requireWiringAccess(user, organizationId);
    await this.requireOrgMember(organizationId, input.userId);

    if (!IANAZone.isValidZone(input.timeZone)) {
      throw new BadRequestException(`"${input.timeZone}" is not a valid IANA timezone`);
    }

    const existing = await this.schedulesService.getUserScheduleDefault(input.userId);
    if (existing) {
      return existing;
    }
    return this.schedulesService.createUserDefaultSchedule(input.userId, input.timeZone);
  }

  async createEventTypeForMember(
    user: UserWithProfile,
    organizationId: number,
    input: CreateOrganizationEventTypeInputDto
  ) {
    await this.requireOrg(organizationId);
    await this.requireWiringAccess(user, organizationId);
    const targetUser = await this.requireOrgMember(organizationId, input.userId);

    const transformedBody = await this.inputEventTypesService.transformAndValidateCreateEventTypeInput(
      targetUser,
      {
        title: input.title,
        slug: input.slug,
        lengthInMinutes: input.length,
        description: input.description,
        scheduleId: input.scheduleId,
      }
    );
    return this.eventTypesService.createUserEventType(targetUser, transformedBody);
  }
}
