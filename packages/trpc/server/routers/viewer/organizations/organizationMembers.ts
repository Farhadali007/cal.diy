import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";

export const organizationMemberSelect = {
  id: true,
  userId: true,
  role: true,
  accepted: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      avatarUrl: true,
    },
  },
} as const;

/** Mirrors API v2 OrganizationMembersService.requireNotLastOwner. */
export async function requireNotLastOwner(
  organizationId: number,
  membership: { role: MembershipRole }
): Promise<void> {
  if (membership.role !== MembershipRole.OWNER) return;
  const ownerCount = await prisma.membership.count({
    where: { teamId: organizationId, accepted: true, role: MembershipRole.OWNER },
  });
  if (ownerCount <= 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Cannot remove or demote the last OWNER of the organization",
    });
  }
}
