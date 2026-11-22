import { MembershipRole, Prisma } from "@calcom/prisma/client";
import { Injectable } from "@nestjs/common";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { StripeService } from "@/modules/stripe/stripe.service";

@Injectable()
export class OrganizationsRepository {
  constructor(
    private readonly dbRead: PrismaReadService,
    private readonly dbWrite: PrismaWriteService,
    private readonly stripeService: StripeService
  ) {}

  async findById(args: { id: number }) {
    return this.dbRead.prisma.team.findUnique({
      where: {
        id: args.id,
      },
    });
  }

  async findByIds(organizationIds: number[]) {
    return this.dbRead.prisma.team.findMany({
      where: {
        id: {
          in: organizationIds,
        },
        isOrganization: true,
      },
    });
  }

  async findTeamIdAndSlugFromClientId(clientId: string) {
    return this.dbRead.prisma.team.findFirstOrThrow({
      where: {
        platformOAuthClient: {
          some: {
            id: clientId,
          },
        },
      },
      select: {
        id: true,
        slug: true,
      },
    });
  }

  async findPlatformOrgFromUserId(userId: number) {
    return this.dbRead.prisma.team.findFirstOrThrow({
      where: {
        orgProfiles: {
          some: {
            userId: userId,
          },
        },
        isPlatform: true,
        isOrganization: true,
      },
      select: {
        id: true,
        isPlatform: true,
        isOrganization: true,
      },
    });
  }

  async findOrgUser(organizationId: number, userId: number) {
    return this.dbRead.prisma.user.findUnique({
      where: {
        id: userId,
        profiles: {
          some: {
            organizationId,
          },
        },
      },
    });
  }

  async findOrgTeamUser(organizationId: number, teamId: number, userId: number) {
    return this.dbRead.prisma.user.findUnique({
      where: {
        id: userId,
        profiles: {
          some: {
            organizationId,
          },
        },
        teams: {
          some: {
            teamId: teamId,
          },
        },
      },
    });
  }

  async fetchOrgAdminApiStatus(organizationId: number) {
    return this.dbRead.prisma.organizationSettings.findUnique({
      where: {
        organizationId,
      },
      select: {
        isAdminAPIEnabled: true,
      },
    });
  }

  // VOICERO Calendar Engine (task 2.7): org-level suspension state.
  // Returns null when the org has no settings row (legacy orgs) — callers
  // treat that as "not suspended".
  async fetchOrgSuspension(organizationId: number) {
    return this.dbRead.prisma.organizationSettings.findUnique({
      where: {
        organizationId,
      },
      select: {
        suspended: true,
        suspendedAt: true,
        suspendedReason: true,
        suspendedById: true,
      },
    });
  }

  async updateOrgSuspension(
    organizationId: number,
    data: { suspended: boolean; suspendedAt: Date | null; suspendedReason: string | null; suspendedById: number | null }
  ) {
    return this.dbWrite.prisma.organizationSettings.update({
      where: {
        organizationId,
      },
      data,
    });
  }

  // VOICERO Calendar Engine (task 2.8): is the org that owns this event
  // type suspended? Resolves ownership in order: team event type → the team
  // itself if it is an org, else its parent org; user event type → the
  // event type's profile org, else the owner's main org (user.organizationId).
  // Returns false when the event type does not exist, is not org-owned, or
  // the org has no settings row — those cases have no suspension state, so
  // failing open is correct, not a bypass.
  async isEventTypeOrgSuspended(eventTypeId: number): Promise<boolean> {
    const eventType = await this.dbRead.prisma.eventType.findUnique({
      where: {
        id: eventTypeId,
      },
      include: {
        team: {
          select: {
            id: true,
            parentId: true,
            isOrganization: true,
          },
        },
        profile: {
          select: {
            organizationId: true,
          },
        },
        owner: {
          select: {
            organizationId: true,
          },
        },
      },
    });
    if (!eventType) {
      return false;
    }
    let organizationId: number | null = null;
    if (eventType.team) {
      organizationId = eventType.team.isOrganization ? eventType.team.id : eventType.team.parentId;
    } else if (eventType.profile) {
      organizationId = eventType.profile.organizationId;
    } else {
      organizationId = eventType.owner?.organizationId ?? null;
    }
    if (!organizationId) {
      return false;
    }
    const settings = await this.dbRead.prisma.organizationSettings.findUnique({
      where: {
        organizationId,
      },
      select: {
        suspended: true,
      },
    });
    return settings?.suspended ?? false;
  }

  async update(organizationId: number, data: Prisma.TeamUpdateInput) {
    return this.dbWrite.prisma.team.update({
      where: {
        id: organizationId,
        isOrganization: true,
      },
      data,
    });
  }

  async delete(organizationId: number) {
    return this.dbWrite.prisma.team.delete({
      where: {
        id: organizationId,
        isOrganization: true,
      },
    });
  }

  async findOrgBySlug(slug: string) {
    return this.dbRead.prisma.team.findFirst({
      where: {
        slug,
        parentId: null,
        isOrganization: true,
      },
    });
  }

  /**
   * Creates an organization atomically: the Team row (isOrganization=true,
   * parentId=null), its OrganizationSettings row, and an OWNER membership
   * for the provisioning user. Mirrors the shape used by
   * OrganizationRepositoryFixture.create in the e2e fixtures.
   *
   * isAdminAPIEnabled is true: VOICERO manages the org through this API
   * (provisioning, staff, event types), so the admin API must be enabled
   * from creation. orgAutoAcceptEmail defaults to "" (no auto-accept
   * domain); it only feeds username derivation, never access decisions.
   *
   * The data arg is TeamUncheckedCreateInput (not TeamCreateInput): the
   * create sets the scalar parentId=null, which the checked input type
   * does not accept (it only carries the `parent` relation).
   */
  async create(args: {
    data: Prisma.TeamUncheckedCreateInput;
    ownerUserId: number;
    orgAutoAcceptEmail: string;
  }) {
    return this.dbWrite.prisma.$transaction(async (prisma) => {
      const team = await prisma.team.create({
        data: {
          ...args.data,
          isOrganization: true,
          parentId: null,
        },
      });

      await prisma.organizationSettings.create({
        data: {
          organizationId: team.id,
          isAdminAPIEnabled: true,
          orgAutoAcceptEmail: args.orgAutoAcceptEmail,
        },
      });

      await prisma.membership.create({
        data: {
          teamId: team.id,
          userId: args.ownerUserId,
          role: MembershipRole.OWNER,
          accepted: true,
        },
      });

      return team;
    });
  }

  /**
   * The ManagedOrganization link for a managed org, if any. A managed org
   * has at most one manager (managedOrganizationId is @unique).
   */
  async findManagedOrganizationLink(managedOrganizationId: number) {
    return this.dbRead.prisma.managedOrganization.findUnique({
      where: { managedOrganizationId },
      select: {
        managerOrganizationId: true,
        managedOrganizationId: true,
        createdAt: true,
        managerOrganization: { select: { id: true, name: true, slug: true } },
        managedOrganization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /** All orgs managed by the given org, oldest link first. */
  async findManagedOrganizationLinks(managerOrganizationId: number) {
    return this.dbRead.prisma.managedOrganization.findMany({
      where: { managerOrganizationId },
      select: {
        managerOrganizationId: true,
        managedOrganizationId: true,
        createdAt: true,
        managedOrganization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createManagedOrganizationLink(managerOrganizationId: number, managedOrganizationId: number) {
    return this.dbWrite.prisma.managedOrganization.create({
      data: { managerOrganizationId, managedOrganizationId },
    });
  }

  async deleteManagedOrganizationLink(managedOrganizationId: number) {
    return this.dbWrite.prisma.managedOrganization.delete({
      where: { managedOrganizationId },
    });
  }
}
