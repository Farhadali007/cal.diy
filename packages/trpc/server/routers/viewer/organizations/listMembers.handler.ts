import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { organizationMemberSelect } from "./organizationMembers";

type ListMembersOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
};

export const listMembersHandler = async ({ ctx }: ListMembersOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  return prisma.membership.findMany({
    where: { teamId: org.id },
    select: organizationMemberSelect,
    orderBy: { createdAt: "asc" },
  });
};
