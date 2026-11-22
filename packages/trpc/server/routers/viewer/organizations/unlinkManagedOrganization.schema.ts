import { z } from "zod";

export const ZUnlinkManagedOrganizationInputSchema = z.object({
  managedOrganizationId: z.number().int().positive(),
});

export type TUnlinkManagedOrganizationInputSchema = z.infer<
  typeof ZUnlinkManagedOrganizationInputSchema
>;
