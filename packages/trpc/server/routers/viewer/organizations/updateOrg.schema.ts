import { z } from "zod";

export const ZUpdateOrgInputSchema = z.object({
  name: z.string().min(1).optional(),
  timeZone: z.string().min(1).optional(),
});

export type TUpdateOrgInputSchema = z.infer<typeof ZUpdateOrgInputSchema>;
