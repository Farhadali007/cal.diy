import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { getDefaultOrganizationSettings, organizationSettingsSelect } from "./organizationSettings";

type GetSettingsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
};

export const getSettingsHandler = async ({ ctx }: GetSettingsOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: org.id },
    select: organizationSettingsSelect,
  });
  return settings ?? getDefaultOrganizationSettings(org.id);
};
