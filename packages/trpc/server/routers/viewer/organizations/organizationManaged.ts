import prisma from "@calcom/prisma";
import { TRPCError } from "@trpc/server";

export const managedOrganizationLinkSelect = {
  managedOrganizationId: true,
  managerOrganizationId: true,
  createdAt: true,
  managedOrganization: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
    },
  },
} as const;

/**
 * Walks the manager chain above startOrgId. Throws when the walk reaches
 * targetOrgId (linking would close a cycle) or exceeds maxDepth (a chain
 * that long indicates corrupt data, not a real agency hierarchy).
 * Mirrors API v2 OrganizationOwnershipService.assertNoManagementCycle.
 */
export async function assertNoManagementCycle(
  startOrgId: number,
  targetOrgId: number,
  maxDepth = 50
): Promise<void> {
  let currentId = startOrgId;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentId === targetOrgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Linking these organizations would create a management cycle",
      });
    }
    const link = await prisma.managedOrganization.findUnique({
      where: { managedOrganizationId: currentId },
      select: { managerOrganizationId: true },
    });
    if (!link) return;
    currentId = link.managerOrganizationId;
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Management chain is too deep to verify safety",
  });
}
