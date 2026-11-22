import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import type { TUnlinkManagedOrganizationInputSchema } from "./unlinkManagedOrganization.schema";

type UnlinkManagedOrganizationOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TUnlinkManagedOrganizationInputSchema;
};

export const unlinkManagedOrganizationHandler = async ({
  ctx,
  input,
}: UnlinkManagedOrganizationOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  const link = await prisma.managedOrganization.findUnique({
    where: { managedOrganizationId: input.managedOrganizationId },
    select: { managedOrganizationId: true, managerOrganizationId: true, createdAt: true },
  });
  if (!link || link.managerOrganizationId !== org.id) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Organization ${input.managedOrganizationId} is not managed by organization ${org.id}`,
    });
  }
  await prisma.managedOrganization.delete({
    where: { managedOrganizationId: input.managedOrganizationId },
  });
  return link;
};
