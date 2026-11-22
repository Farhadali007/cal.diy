import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMBER_USER_ID,
  createCtx,
  getErrorCode,
  memberRow,
  membershipRow,
  orgRow,
  userRowWithOrg,
} from "./organizations.test-helpers";

const {
  mockUserFindUnique,
  mockTeamFindUnique,
  mockMembershipFindUnique,
  mockMembershipFindMany,
  mockMembershipCount,
  mockMembershipUpdate,
  mockMembershipDelete,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTeamFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockMembershipFindMany: vi.fn(),
  mockMembershipCount: vi.fn(),
  mockMembershipUpdate: vi.fn(),
  mockMembershipDelete: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    team: { findUnique: (...args: unknown[]) => mockTeamFindUnique(...args) },
    membership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      findMany: (...args: unknown[]) => mockMembershipFindMany(...args),
      count: (...args: unknown[]) => mockMembershipCount(...args),
      update: (...args: unknown[]) => mockMembershipUpdate(...args),
      delete: (...args: unknown[]) => mockMembershipDelete(...args),
    },
  },
}));

import { listMembersHandler } from "./listMembers.handler";
import { removeMemberHandler } from "./removeMember.handler";
import { updateMemberRoleHandler } from "./updateMemberRole.handler";

type FindUniqueArgs = { where: { userId_teamId: { userId: number; teamId: number } } };

describe("organizations router - members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(userRowWithOrg());
    mockTeamFindUnique.mockResolvedValue(orgRow());
    // Default: the caller is an org admin; the target member is a MEMBER.
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID
        ? { id: 100, role: MembershipRole.MEMBER }
        : membershipRow({ role: "ADMIN" })
    );
  });

  it("listMembers returns the org members", async () => {
    mockMembershipFindMany.mockResolvedValue([memberRow()]);
    const result = await listMembersHandler({ ctx: createCtx() });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userId: MEMBER_USER_ID, role: "MEMBER" });
    expect(mockMembershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 1 } })
    );
  });

  it("updateMemberRole promotes a member to admin", async () => {
    mockMembershipUpdate.mockResolvedValue(memberRow({ role: "ADMIN" }));
    const result = await updateMemberRoleHandler({
      ctx: createCtx(),
      input: { memberUserId: MEMBER_USER_ID, role: MembershipRole.ADMIN },
    });
    expect(result).toMatchObject({ userId: MEMBER_USER_ID, role: "ADMIN" });
    expect(mockMembershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: { role: MembershipRole.ADMIN } })
    );
  });

  it("updateMemberRole rejects assigning OWNER with BAD_REQUEST", async () => {
    const code = await getErrorCode(() =>
      updateMemberRoleHandler({
        ctx: createCtx(),
        input: { memberUserId: MEMBER_USER_ID, role: MembershipRole.OWNER },
      })
    );
    expect(code).toBe("BAD_REQUEST");
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });

  it("updateMemberRole rejects an unknown member with NOT_FOUND", async () => {
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID ? null : membershipRow({ role: "ADMIN" })
    );
    const code = await getErrorCode(() =>
      updateMemberRoleHandler({
        ctx: createCtx(),
        input: { memberUserId: MEMBER_USER_ID, role: MembershipRole.ADMIN },
      })
    );
    expect(code).toBe("NOT_FOUND");
  });

  it("updateMemberRole rejects demoting the last OWNER with CONFLICT", async () => {
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID
        ? { id: 100, role: MembershipRole.OWNER }
        : membershipRow({ role: "ADMIN" })
    );
    mockMembershipCount.mockResolvedValue(1);
    const code = await getErrorCode(() =>
      updateMemberRoleHandler({
        ctx: createCtx(),
        input: { memberUserId: MEMBER_USER_ID, role: MembershipRole.ADMIN },
      })
    );
    expect(code).toBe("CONFLICT");
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });

  it("updateMemberRole allows demoting an OWNER when another OWNER remains", async () => {
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID
        ? { id: 100, role: MembershipRole.OWNER }
        : membershipRow({ role: "ADMIN" })
    );
    mockMembershipCount.mockResolvedValue(2);
    mockMembershipUpdate.mockResolvedValue(memberRow({ role: "ADMIN" }));
    const result = await updateMemberRoleHandler({
      ctx: createCtx(),
      input: { memberUserId: MEMBER_USER_ID, role: MembershipRole.ADMIN },
    });
    expect(result).toMatchObject({ role: "ADMIN" });
  });

  it("removeMember rejects removing the last OWNER with CONFLICT", async () => {
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID
        ? { id: 100, role: MembershipRole.OWNER }
        : membershipRow({ role: "ADMIN" })
    );
    mockMembershipCount.mockResolvedValue(1);
    const code = await getErrorCode(() =>
      removeMemberHandler({ ctx: createCtx(), input: { memberUserId: MEMBER_USER_ID } })
    );
    expect(code).toBe("CONFLICT");
    expect(mockMembershipDelete).not.toHaveBeenCalled();
  });

  it("removeMember deletes a plain member", async () => {
    mockMembershipDelete.mockResolvedValue(memberRow());
    const result = await removeMemberHandler({
      ctx: createCtx(),
      input: { memberUserId: MEMBER_USER_ID },
    });
    expect(result).toMatchObject({ id: 100, userId: MEMBER_USER_ID });
    expect(mockMembershipDelete).toHaveBeenCalledWith({ where: { id: 100 } });
  });

  it("removeMember rejects an unknown member with NOT_FOUND", async () => {
    mockMembershipFindUnique.mockImplementation(({ where }: FindUniqueArgs) =>
      where.userId_teamId.userId === MEMBER_USER_ID ? null : membershipRow({ role: "ADMIN" })
    );
    const code = await getErrorCode(() =>
      removeMemberHandler({ ctx: createCtx(), input: { memberUserId: MEMBER_USER_ID } })
    );
    expect(code).toBe("NOT_FOUND");
  });
});
