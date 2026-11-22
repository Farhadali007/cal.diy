import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZUpdateOrgInputSchema } from "./updateOrg.schema";

export const organizationsRouter = router({
  getCurrentOrg: authedProcedure.query(async ({ ctx }) => {
    const handler = (await import("./getCurrentOrg.handler")).getCurrentOrgHandler;
    return handler({ ctx });
  }),
  updateOrg: authedProcedure.input(ZUpdateOrgInputSchema).mutation(async ({ ctx, input }) => {
    const handler = (await import("./updateOrg.handler")).updateOrgHandler;
    return handler({ ctx, input });
  }),
});
