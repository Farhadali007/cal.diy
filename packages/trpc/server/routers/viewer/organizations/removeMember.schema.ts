import { z } from "zod";

export const ZRemoveMemberInputSchema = z.object({
  memberUserId: z.number().int().positive(),
});

export type TRemoveMemberInputSchema = z.infer<typeof ZRemoveMemberInputSchema>;
