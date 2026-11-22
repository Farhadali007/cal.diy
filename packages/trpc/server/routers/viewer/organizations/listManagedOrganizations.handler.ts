import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { managedOrganizationLinkSelect } from "./organizationManaged";

type ListManagedOrganizationsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
};

export const listManagedOrganizationsHandler = async ({ ctx }: ListManagedOrganizationsOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  return prisma.managedOrganization.findMany({
    where: { managerOrganizationId: org.id },
    select: managedOrganizationLinkSelect,
    orderBy: { createdAt: "asc" },
  });
};
