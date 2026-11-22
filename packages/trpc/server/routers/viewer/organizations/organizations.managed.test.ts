import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORG_ID,
  TARGET_ORG_ID,
  createCtx,
  getErrorCode,
  managedLinkRow,
  membershipRow,
  orgRow,
  userRowWithOrg,
} from "./organizations.test-helpers";

const {
  mockUserFindUnique,
  mockTeamFindUnique,
  mockTeamFindFirst,
  mockMembershipFindUnique,
  mockManagedFindUnique,
  mockManagedFindMany,
  mockManagedCreate,
  mockManagedDelete,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTeamFindUnique: vi.fn(),
  mockTeamFindFirst: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockManagedFindUnique: vi.fn(),
  mockManagedFindMany: vi.fn(),
  mockManagedCreate: vi.fn(),
  mockManagedDelete: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    team: {
      findUnique: (...args: unknown[]) => mockTeamFindUnique(...args),
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
    membership: { findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args) },
    managedOrganization: {
      findUnique: (...args: unknown[]) => mockManagedFindUnique(...args),
      findMany: (...args: unknown[]) => mockManagedFindMany(...args),
      create: (...args: unknown[]) => mockManagedCreate(...args),
      delete: (...args: unknown[]) => mockManagedDelete(...args),
    },
  },
}));

import { linkManagedOrganizationHandler } from "./linkManagedOrganization.handler";
import { listManagedOrganizationsHandler } from "./listManagedOrganizations.handler";
import { unlinkManagedOrganizationHandler } from "./unlinkManagedOrganization.handler";

describe("organizations router - managed organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(userRowWithOrg());
    mockTeamFindUnique.mockResolvedValue(orgRow());
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "ADMIN" }));
    mockTeamFindFirst.mockResolvedValue({ id: TARGET_ORG_ID, name: "Beta", slug: "beta" });
  });

  it("listManagedOrganizations returns the managed orgs", async () => {
    mockManagedFindMany.mockResolvedValue([managedLinkRow()]);
    const result = await listManagedOrganizationsHandler({ ctx: createCtx() });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ managedOrganizationId: TARGET_ORG_ID });
    expect(mockManagedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { managerOrganizationId: ORG_ID } })
    );
  });

  it("linkManagedOrganization links by slug", async () => {
    mockManagedFindUnique
      .mockResolvedValueOnce(null) // not already managed
      .mockResolvedValueOnce(null) // no manager above the current org (cycle walk)
      .mockResolvedValueOnce(managedLinkRow()); // re-read after create
    const result = await linkManagedOrganizationHandler({ ctx: createCtx(), input: { slug: "beta" } });
    expect(result).toMatchObject({ managedOrganizationId: TARGET_ORG_ID });
    expect(mockManagedCreate).toHaveBeenCalledWith({
      data: { managerOrganizationId: ORG_ID, managedOrganizationId: TARGET_ORG_ID },
    });
  });

  it("linkManagedOrganization rejects an unknown slug with NOT_FOUND", async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    const code = await getErrorCode(() =>
      linkManagedOrganizationHandler({ ctx: createCtx(), input: { slug: "nope" } })
    );
    expect(code).toBe("NOT_FOUND");
    expect(mockManagedCreate).not.toHaveBeenCalled();
  });

  it("linkManagedOrganization rejects a self-link with BAD_REQUEST", async () => {
    mockTeamFindFirst.mockResolvedValue({ id: ORG_ID, name: "Acme", slug: "acme" });
    const code = await getErrorCode(() =>
      linkManagedOrganizationHandler({ ctx: createCtx(), input: { slug: "acme" } })
    );
    expect(code).toBe("BAD_REQUEST");
    expect(mockManagedCreate).not.toHaveBeenCalled();
  });

  it("linkManagedOrganization rejects an already-managed org with CONFLICT", async () => {
    mockManagedFindUnique.mockResolvedValue({ managerOrganizationId: 99 });
    const code = await getErrorCode(() =>
      linkManagedOrganizationHandler({ ctx: createCtx(), input: { slug: "beta" } })
    );
    expect(code).toBe("CONFLICT");
    expect(mockManagedCreate).not.toHaveBeenCalled();
  });

  it("linkManagedOrganization rejects a link that would close a cycle with BAD_REQUEST", async () => {
    // The current org is already managed by the target org: linking back
    // would create a cycle.
    mockManagedFindUnique
      .mockResolvedValueOnce(null) // not already managed
      .mockResolvedValueOnce({ managerOrganizationId: TARGET_ORG_ID }); // cycle walk
    const code = await getErrorCode(() =>
      linkManagedOrganizationHandler({ ctx: createCtx(), input: { slug: "beta" } })
    );
    expect(code).toBe("BAD_REQUEST");
    expect(mockManagedCreate).not.toHaveBeenCalled();
  });

  it("unlinkManagedOrganization deletes the link", async () => {
    mockManagedFindUnique.mockResolvedValue(managedLinkRow());
    mockManagedDelete.mockResolvedValue(managedLinkRow());
    const result = await unlinkManagedOrganizationHandler({
      ctx: createCtx(),
      input: { managedOrganizationId: TARGET_ORG_ID },
    });
    expect(result).toMatchObject({ managedOrganizationId: TARGET_ORG_ID });
    expect(mockManagedDelete).toHaveBeenCalledWith({
      where: { managedOrganizationId: TARGET_ORG_ID },
    });
  });

  it("unlinkManagedOrganization rejects a missing link with NOT_FOUND", async () => {
    mockManagedFindUnique.mockResolvedValue(null);
    const code = await getErrorCode(() =>
      unlinkManagedOrganizationHandler({
        ctx: createCtx(),
        input: { managedOrganizationId: TARGET_ORG_ID },
      })
    );
    expect(code).toBe("NOT_FOUND");
    expect(mockManagedDelete).not.toHaveBeenCalled();
  });

  it("unlinkManagedOrganization rejects a link owned by another manager with NOT_FOUND", async () => {
    mockManagedFindUnique.mockResolvedValue(managedLinkRow({ managerOrganizationId: 99 }));
    const code = await getErrorCode(() =>
      unlinkManagedOrganizationHandler({
        ctx: createCtx(),
        input: { managedOrganizationId: TARGET_ORG_ID },
      })
    );
    expect(code).toBe("NOT_FOUND");
    expect(mockManagedDelete).not.toHaveBeenCalled();
  });
});
