import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { assertNoManagementCycle, managedOrganizationLinkSelect } from "./organizationManaged";
import type { TLinkManagedOrganizationInputSchema } from "./linkManagedOrganization.schema";

type LinkManagedOrganizationOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TLinkManagedOrganizationInputSchema;
};

export const linkManagedOrganizationHandler = async ({
  ctx,
  input,
}: LinkManagedOrganizationOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  const target = await prisma.team.findFirst({
    where: { slug: input.slug, isOrganization: true, parentId: null },
    select: { id: true, name: true, slug: true },
  });
  if (!target) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Organization with slug "${input.slug}" not found`,
    });
  }
  if (target.id === org.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An organization cannot manage itself",
    });
  }
  const existing = await prisma.managedOrganization.findUnique({
    where: { managedOrganizationId: target.id },
    select: { managerOrganizationId: true },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Organization ${target.id} is already managed by organization ${existing.managerOrganizationId}`,
    });
  }
  await assertNoManagementCycle(org.id, target.id);
  await prisma.managedOrganization.create({
    data: { managerOrganizationId: org.id, managedOrganizationId: target.id },
  });
  const link = await prisma.managedOrganization.findUnique({
    where: { managedOrganizationId: target.id },
    select: managedOrganizationLinkSelect,
  });
  if (!link) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Organization ${target.id} is not managed by any organization`,
    });
  }
  return link;
};
