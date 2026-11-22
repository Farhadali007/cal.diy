import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";
import { getCurrentOrgForUser, isUserOrgAdmin } from "./organizationAccess";

type GetCurrentOrgOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
};

export const getCurrentOrgHandler = async ({ ctx }: GetCurrentOrgOptions) => {
  const org = await getCurrentOrgForUser(ctx.user);
  if (!org) return null;
  return {
    ...org,
    isOrgAdmin: await isUserOrgAdmin(ctx.user, org.id),
  };
};
