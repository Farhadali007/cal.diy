import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZUpdateOrgInputSchema } from "./updateOrg.schema";
import { ZUpdateSettingsInputSchema } from "./updateSettings.schema";

export const organizationsRouter = router({
  getCurrentOrg: authedProcedure.query(async ({ ctx }) => {
    const handler = (await import("./getCurrentOrg.handler")).getCurrentOrgHandler;
    return handler({ ctx });
  }),
  updateOrg: authedProcedure.input(ZUpdateOrgInputSchema).mutation(async ({ ctx, input }) => {
    const handler = (await import("./updateOrg.handler")).updateOrgHandler;
    return handler({ ctx, input });
  }),
  getSettings: authedProcedure.query(async ({ ctx }) => {
    const handler = (await import("./getSettings.handler")).getSettingsHandler;
    return handler({ ctx });
  }),
  updateSettings: authedProcedure
    .input(ZUpdateSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const handler = (await import("./updateSettings.handler")).updateSettingsHandler;
      return handler({ ctx, input });
    }),
});
