import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCtx,
  getErrorCode,
  membershipRow,
  orgRow,
  userRowWithOrg,
  userRowWithoutOrg,
} from "./organizations.test-helpers";

const { mockUserFindUnique, mockTeamFindUnique, mockTeamUpdate, mockMembershipFindUnique } =
  vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockTeamFindUnique: vi.fn(),
    mockTeamUpdate: vi.fn(),
    mockMembershipFindUnique: vi.fn(),
  }));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    team: {
      findUnique: (...args: unknown[]) => mockTeamFindUnique(...args),
      update: (...args: unknown[]) => mockTeamUpdate(...args),
    },
    membership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      findMany: vi.fn(),
    },
    organizationSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    managedOrganization: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { getCurrentOrgHandler } from "./getCurrentOrg.handler";
import { listMembersHandler } from "./listMembers.handler";
import { updateOrgHandler } from "./updateOrg.handler";
import { updateSettingsHandler } from "./updateSettings.handler";

describe("organizations router - auth matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(userRowWithOrg());
    mockTeamFindUnique.mockResolvedValue(orgRow());
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "ADMIN" }));
    mockTeamUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 1,
      name: data.name ?? "Acme",
      slug: "acme",
      logoUrl: null,
      timeZone: data.timeZone ?? "Europe/London",
    }));
  });

  it("getCurrentOrg returns null when the user has no org", async () => {
    mockUserFindUnique.mockResolvedValue(userRowWithoutOrg());
    const result = await getCurrentOrgHandler({ ctx: createCtx() });
    expect(result).toBeNull();
  });

  it("getCurrentOrg returns the org with isOrgAdmin for an org admin", async () => {
    const result = await getCurrentOrgHandler({ ctx: createCtx() });
    expect(result).toMatchObject({ id: 1, name: "Acme", slug: "acme", isOrgAdmin: true });
  });

  it("getCurrentOrg reports isOrgAdmin false for a plain member", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "MEMBER" }));
    const result = await getCurrentOrgHandler({ ctx: createCtx() });
    expect(result).toMatchObject({ id: 1, isOrgAdmin: false });
  });

  it("updateOrg rejects an outsider with NOT_FOUND", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const code = await getErrorCode(() =>
      updateOrgHandler({ ctx: createCtx(), input: { name: "New Name" } })
    );
    expect(code).toBe("NOT_FOUND");
    expect(mockTeamUpdate).not.toHaveBeenCalled();
  });

  it("updateOrg rejects a pending member with NOT_FOUND", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ accepted: false, role: "ADMIN" }));
    const code = await getErrorCode(() =>
      updateOrgHandler({ ctx: createCtx(), input: { name: "New Name" } })
    );
    expect(code).toBe("NOT_FOUND");
  });

  it("updateOrg rejects a plain member with FORBIDDEN", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "MEMBER" }));
    const code = await getErrorCode(() =>
      updateOrgHandler({ ctx: createCtx(), input: { name: "New Name" } })
    );
    expect(code).toBe("FORBIDDEN");
    expect(mockTeamUpdate).not.toHaveBeenCalled();
  });

  it("updateOrg allows an org admin", async () => {
    const result = await updateOrgHandler({ ctx: createCtx(), input: { name: "New Name" } });
    expect(result).toMatchObject({ id: 1, name: "New Name" });
    expect(mockTeamUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { name: "New Name" } })
    );
  });

  it("updateOrg allows an instance admin who is only a plain member", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "MEMBER" }));
    const result = await updateOrgHandler({
      ctx: createCtx({ role: "ADMIN" }),
      input: { name: "New Name" },
    });
    expect(result).toMatchObject({ id: 1, name: "New Name" });
  });

  it("listMembers rejects a plain member with FORBIDDEN", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "MEMBER" }));
    const code = await getErrorCode(() => listMembersHandler({ ctx: createCtx() }));
    expect(code).toBe("FORBIDDEN");
  });

  it("updateSettings rejects a plain member with FORBIDDEN", async () => {
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "MEMBER" }));
    const code = await getErrorCode(() =>
      updateSettingsHandler({ ctx: createCtx(), input: { allowSEOIndexing: true } })
    );
    expect(code).toBe("FORBIDDEN");
  });
});
