import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SettingsLayoutProps } from "./SettingsLayoutAppDirClient";
import SettingsLayoutAppDirClient from "./SettingsLayoutAppDirClient";

export default async function SettingsLayoutAppDir(props: SettingsLayoutProps) {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  const userId = session?.user?.id;
  if (!userId) {
    return redirect("/auth/login");
  }

  // Nav display only; the org pages and tRPC procedures enforce access.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      movedToProfile: { select: { organizationId: true } },
      profiles: { select: { organizationId: true } },
    },
  });
  const mainOrgId =
    user?.movedToProfile?.organizationId ??
    user?.profiles.find((profile) => profile.organizationId === user.organizationId)
      ?.organizationId ??
    user?.profiles[0]?.organizationId ??
    user?.organizationId ??
    null;
  let canUpdateOrganization = user?.role === UserPermissionRole.ADMIN;
  if (!canUpdateOrganization && mainOrgId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_teamId: { userId, teamId: mainOrgId } },
      select: { accepted: true, role: true },
    });
    canUpdateOrganization =
      !!membership?.accepted &&
      (membership.role === MembershipRole.OWNER || membership.role === MembershipRole.ADMIN);
  }

  return (
    <SettingsLayoutAppDirClient
      {...props}
      teamFeatures={{}}
      permissions={{
        canUpdateOrganization,
      }}
    />
  );
}
