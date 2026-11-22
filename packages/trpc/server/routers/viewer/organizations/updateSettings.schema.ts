import type { z } from "zod";
import { ZOrganizationSettingsFieldsSchema } from "./organizationSettings";

export const ZUpdateSettingsInputSchema = ZOrganizationSettingsFieldsSchema;

export type TUpdateSettingsInputSchema = z.infer<typeof ZUpdateSettingsInputSchema>;
