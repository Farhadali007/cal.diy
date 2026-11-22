import { MembershipRole } from "@calcom/prisma/enums";
import { z } from "zod";

export const ZUpdateMemberRoleInputSchema = z.object({
  memberUserId: z.number().int().positive(),
  // OWNER is accepted by the schema and rejected by the handler with a
  // specific BAD_REQUEST, mirroring API v2.
  role: z.nativeEnum(MembershipRole),
});

export type TUpdateMemberRoleInputSchema = z.infer<typeof ZUpdateMemberRoleInputSchema>;
