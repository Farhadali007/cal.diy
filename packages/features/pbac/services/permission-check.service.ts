import type { PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";

export type CheckPermissionParams = {
  userId: number;
  teamId: number;
  permission: string;
  fallbackRoles: MembershipRole[];
};

export type GetTeamIdsWithPermissionParams = {
  userId: number;
  permission: string;
  fallbackRoles: MembershipRole[];
  orgId?: number;
};

/**
 * Role-based permission checks for team and organization access.
 *
 * Cal.diy ships without the PBAC grant tables (they were part of the removed
 * EE code), so a permission resolves purely from the caller's ACCEPTED
 * membership role in the team against the fallbackRoles each call site
 * passes. The `permission` string is accepted for API compatibility with the
 * former grant-based service and is otherwise ignored: there is no grant
 * store to consult, and inventing per-permission role mappings here would
 * silently change what every call site authorizes.
 *
 * This replaces the always-true stubs the EE removal left inline in 18
 * files. Those stubs let any authenticated user pass any team permission
 * check — including reading, updating, deleting, and duplicating another
 * team's event types — so every one of them is a tenant-isolation hole.
 */
export class PermissionCheckService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async checkPermission({ userId, teamId, fallbackRoles }: CheckPermissionParams): Promise<boolean> {
    if (!userId || !teamId || fallbackRoles.length === 0) return false;
    const membership = await this.db.membership.findFirst({
      where: { userId, teamId, accepted: true },
      select: { role: true },
    });
    return !!membership && fallbackRoles.includes(membership.role);
  }

  async hasPermission(params: CheckPermissionParams): Promise<boolean> {
    return this.checkPermission(params);
  }

  async getTeamIdsWithPermission({
    userId,
    fallbackRoles,
    orgId,
  }: GetTeamIdsWithPermissionParams): Promise<number[]> {
    if (!userId || fallbackRoles.length === 0) return [];
    const memberships = await this.db.membership.findMany({
      where: {
        userId,
        accepted: true,
        role: { in: fallbackRoles },
        ...(orgId ? { team: { OR: [{ id: orgId }, { parentId: orgId }] } } : {}),
      },
      select: { teamId: true },
    });
    return memberships.map((membership) => membership.teamId);
  }
}
