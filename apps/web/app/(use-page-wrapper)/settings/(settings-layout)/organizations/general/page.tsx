import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

import { organizationsRouter } from "@calcom/trpc/server/routers/viewer/organizations/_router";

import GeneralView from "~/settings/organizations/general-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("general"),
    (t) => t("org_general_settings_description"),
    undefined,
    undefined,
    "/settings/organizations/general"
  );

const Page = async () => {
  const organizationsCaller = await createRouterCaller(organizationsRouter);
  const org = await organizationsCaller.getCurrentOrg();
  if (!org || !org.isOrgAdmin) {
    redirect("/event-types");
  }
  const settings = await organizationsCaller.getSettings();

  return <GeneralView settings={settings} />;
};

export default Page;
