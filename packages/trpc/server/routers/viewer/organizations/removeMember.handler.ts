import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { requireNotLastOwner } from "./organizationMembers";
import type { TRemoveMemberInputSchema } from "./removeMember.schema";

type RemoveMemberOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TRemoveMemberInputSchema;
};

export const removeMemberHandler = async ({ ctx, input }: RemoveMemberOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId: input.memberUserId, teamId: org.id } },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  }
  await requireNotLastOwner(org.id, membership);
  await prisma.membership.delete({ where: { id: membership.id } });
  return { id: membership.id, userId: input.memberUserId };
};
