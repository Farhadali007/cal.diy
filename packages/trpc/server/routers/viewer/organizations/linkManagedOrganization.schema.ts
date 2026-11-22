import { z } from "zod";

export const ZLinkManagedOrganizationInputSchema = z.object({
  slug: z.string().min(1),
});

export type TLinkManagedOrganizationInputSchema = z.infer<typeof ZLinkManagedOrganizationInputSchema>;
