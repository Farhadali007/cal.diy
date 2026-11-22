import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZLinkManagedOrganizationInputSchema } from "./linkManagedOrganization.schema";
import { ZRemoveMemberInputSchema } from "./removeMember.schema";
import { ZUnlinkManagedOrganizationInputSchema } from "./unlinkManagedOrganization.schema";
import { ZUpdateMemberRoleInputSchema } from "./updateMemberRole.schema";
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
  listMembers: authedProcedure.query(async ({ ctx }) => {
    const handler = (await import("./listMembers.handler")).listMembersHandler;
    return handler({ ctx });
  }),
  updateMemberRole: authedProcedure
    .input(ZUpdateMemberRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const handler = (await import("./updateMemberRole.handler")).updateMemberRoleHandler;
      return handler({ ctx, input });
    }),
  removeMember: authedProcedure.input(ZRemoveMemberInputSchema).mutation(async ({ ctx, input }) => {
    const handler = (await import("./removeMember.handler")).removeMemberHandler;
    return handler({ ctx, input });
  }),
  listManagedOrganizations: authedProcedure.query(async ({ ctx }) => {
    const handler = (await import("./listManagedOrganizations.handler"))
      .listManagedOrganizationsHandler;
    return handler({ ctx });
  }),
  linkManagedOrganization: authedProcedure
    .input(ZLinkManagedOrganizationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const handler = (await import("./linkManagedOrganization.handler"))
        .linkManagedOrganizationHandler;
      return handler({ ctx, input });
    }),
  unlinkManagedOrganization: authedProcedure
    .input(ZUnlinkManagedOrganizationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const handler = (await import("./unlinkManagedOrganization.handler"))
        .unlinkManagedOrganizationHandler;
      return handler({ ctx, input });
    }),
});
