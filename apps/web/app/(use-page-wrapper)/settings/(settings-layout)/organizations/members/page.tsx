import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

import { organizationsRouter } from "@calcom/trpc/server/routers/viewer/organizations/_router";

import MembersView from "~/settings/organizations/members-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("members"),
    (t) => t("organization_members_description"),
    undefined,
    undefined,
    "/settings/organizations/members"
  );

const Page = async () => {
  const organizationsCaller = await createRouterCaller(organizationsRouter);
  const org = await organizationsCaller.getCurrentOrg();
  if (!org || !org.isOrgAdmin) {
    redirect("/event-types");
  }
  const members = await organizationsCaller.listMembers();

  return <MembersView members={members} />;
};

export default Page;
