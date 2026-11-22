import prisma from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";

const isOrgAdminRole = (role: MembershipRole) =>
  role === MembershipRole.OWNER || role === MembershipRole.ADMIN;

export type OrganizationSessionUser = NonNullable<TrpcSessionUser>;

export const isInstanceAdmin = (user: OrganizationSessionUser) =>
  user.role === UserPermissionRole.ADMIN;

/**
 * The user's main org, resolved the same way API v2 does
 * (UsersService.getUserMainOrgId): main profile first, then the legacy
 * user.organizationId fallback.
 */
export async function getUserMainOrgId(userId: number): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      movedToProfile: { select: { organizationId: true } },
      profiles: { select: { organizationId: true } },
    },
  });
  if (!user) return null;
  const mainProfile =
    user.movedToProfile ??
    user.profiles.find((profile) => profile.organizationId === user.organizationId) ??
    user.profiles[0];
  return mainProfile?.organizationId ?? user.organizationId ?? null;
}

export type CurrentOrg = {
  id: number;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  timeZone: string;
  suspended: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
};

/** The user's main org, or null when the user belongs to no organization. */
export async function getCurrentOrgForUser(
  user: OrganizationSessionUser
): Promise<CurrentOrg | null> {
  const orgId = await getUserMainOrgId(user.id);
  if (!orgId) return null;
  const org = await prisma.team.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      timeZone: true,
      isOrganization: true,
      parentId: true,
      organizationSettings: {
        select: { suspended: true, suspendedAt: true, suspendedReason: true },
      },
    },
  });
  if (!org || !org.isOrganization || org.parentId !== null) return null;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    timeZone: org.timeZone,
    suspended: org.organizationSettings?.suspended ?? false,
    suspendedAt: org.organizationSettings?.suspendedAt ?? null,
    suspendedReason: org.organizationSettings?.suspendedReason ?? null,
  };
}

export async function isUserOrgAdmin(
  user: OrganizationSessionUser,
  orgId: number
): Promise<boolean> {
  if (isInstanceAdmin(user)) return true;
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: orgId } },
    select: { accepted: true, role: true },
  });
  return !!membership?.accepted && isOrgAdminRole(membership.role);
}

/**
 * Resolves the caller's current org and requires org-admin access.
 * Outsiders get NOT_FOUND so org existence never leaks; accepted members
 * without an admin role get FORBIDDEN.
 */
export async function requireCurrentOrgAdmin(
  user: OrganizationSessionUser
): Promise<CurrentOrg> {
  const org = await getCurrentOrgForUser(user);
  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  }
  if (isInstanceAdmin(user)) return org;
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: org.id } },
    select: { accepted: true, role: true },
  });
  if (!membership?.accepted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  }
  if (!isOrgAdminRole(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization admins can do this",
    });
  }
  return org;
}
