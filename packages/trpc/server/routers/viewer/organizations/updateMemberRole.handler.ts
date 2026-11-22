import prisma from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { organizationMemberSelect, requireNotLastOwner } from "./organizationMembers";
import type { TUpdateMemberRoleInputSchema } from "./updateMemberRole.schema";

type UpdateMemberRoleOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TUpdateMemberRoleInputSchema;
};

export const updateMemberRoleHandler = async ({ ctx, input }: UpdateMemberRoleOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  if (input.role === MembershipRole.OWNER) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "OWNER cannot be assigned through member management",
    });
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: input.memberUserId, teamId: org.id } },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  }
  await requireNotLastOwner(org.id, membership);
  return prisma.membership.update({
    where: { id: membership.id },
    data: { role: input.role },
    select: organizationMemberSelect,
  });
};
