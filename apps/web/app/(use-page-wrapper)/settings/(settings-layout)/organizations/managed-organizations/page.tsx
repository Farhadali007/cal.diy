import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

import { organizationsRouter } from "@calcom/trpc/server/routers/viewer/organizations/_router";

import ManagedOrganizationsView from "~/settings/organizations/managed-organizations-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("managed_organizations"),
    (t) => t("managed_organizations_description"),
    undefined,
    undefined,
    "/settings/organizations/managed-organizations"
  );

const Page = async () => {
  const organizationsCaller = await createRouterCaller(organizationsRouter);
  const org = await organizationsCaller.getCurrentOrg();
  if (!org || !org.isOrgAdmin) {
    redirect("/event-types");
  }
  const managed = await organizationsCaller.listManagedOrganizations();

  return <ManagedOrganizationsView managed={managed} />;
};

export default Page;
