import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import type { TUpdateOrgInputSchema } from "./updateOrg.schema";

type UpdateOrgOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TUpdateOrgInputSchema;
};

export const updateOrgHandler = async ({ ctx, input }: UpdateOrgOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  return prisma.team.update({
    where: { id: org.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      timeZone: true,
    },
  });
};
