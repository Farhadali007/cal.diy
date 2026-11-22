import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

import { organizationsRouter } from "@calcom/trpc/server/routers/viewer/organizations/_router";

import ProfileView from "~/settings/organizations/profile-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("profile"),
    (t) => t("organization_profile_description"),
    undefined,
    undefined,
    "/settings/organizations/profile"
  );

const Page = async () => {
  const organizationsCaller = await createRouterCaller(organizationsRouter);
  const org = await organizationsCaller.getCurrentOrg();
  if (!org || !org.isOrgAdmin) {
    redirect("/event-types");
  }

  return <ProfileView org={org} />;
};

export default Page;
