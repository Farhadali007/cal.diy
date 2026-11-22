import { Prisma, UserPermissionRole } from "@calcom/prisma/client";
import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { OrganizationsRepository } from "../index/organizations.repository";
import type { CreateOrganizationInputDto } from "../inputs/organizations.input";
import type { UserWithProfile } from "@/modules/users/users.repository";

@Injectable()
export class OrganizationsService {
  constructor(private readonly organizationsRepository: OrganizationsRepository) {}

  /**
   * Creates an organization: a Team with isOrganization=true and
   * parentId=null, its OrganizationSettings row, and an OWNER membership
   * for the calling admin — all in one transaction (see
   * OrganizationsRepository.create).
   *
   * Only instance admins may create organizations. Organization creation
   * is a provisioning act: VOICERO's backend calls this endpoint with an
   * admin API key when a new business subaccount is created (task 2.5).
   * Regular users must not be able to mint tenants.
   *
   * No Profile row is created for the caller here: profiles are per-org
   * user identities (username within the org) and belong to member
   * onboarding (tasks 2.4/2.5). The provisioning admin administers the
   * org via the API, not as an org-profile member.
   *
   * Slug conflicts return 409. The explicit pre-check covers the common
   * case; a concurrent duplicate racing the check hits the
   * @@unique([slug, parentId]) constraint and the global Prisma exception
   * filter maps P2002 to 409 as well.
   */
  async createOrganization(user: UserWithProfile, input: CreateOrganizationInputDto) {
    if (user.role !== UserPermissionRole.ADMIN) {
      throw new ForbiddenException("Only instance admins can create organizations");
    }

    const existing = await this.organizationsRepository.findOrgBySlug(input.slug);
    if (existing) {
      throw new ConflictException(`Organization slug "${input.slug}" is already taken`);
    }

    return this.organizationsRepository.create({
      data: {
        name: input.name,
        slug: input.slug,
        timeZone: input.timeZone,
        // DTO metadata is free-form JSON; Prisma needs InputJsonObject.
        // class-validator guarantees a plain object here, so the cast is
        // a type-level narrowing, not an unchecked value.
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
      ownerUserId: user.id,
      orgAutoAcceptEmail: input.orgAutoAcceptEmail ?? "",
    });
  }
}
