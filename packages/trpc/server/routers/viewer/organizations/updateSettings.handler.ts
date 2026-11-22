import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { requireCurrentOrgAdmin } from "./organizationAccess";
import { organizationSettingsSelect } from "./organizationSettings";
import type { TUpdateSettingsInputSchema } from "./updateSettings.schema";

type UpdateSettingsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    session: Session;
  };
  input: TUpdateSettingsInputSchema;
};

export const updateSettingsHandler = async ({ ctx, input }: UpdateSettingsOptions) => {
  const org = await requireCurrentOrgAdmin(ctx.user);
  if (Object.values(input).every((value) => value === undefined)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No settings provided" });
  }
  // Prisma skips undefined fields, so only provided fields change. The row is
  // created on first save; orgAutoAcceptEmail has no DB default, hence "".
  return prisma.organizationSettings.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      ...input,
      orgAutoAcceptEmail: input.orgAutoAcceptEmail ?? "",
    },
    update: input,
    select: organizationSettingsSelect,
  });
};
