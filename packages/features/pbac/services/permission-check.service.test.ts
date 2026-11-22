import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionCheckService } from "./permission-check.service";

function setup() {
  const db = {
    membership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const service = new PermissionCheckService(db as unknown as PrismaClient);
  return { db, service };
}

describe("PermissionCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkPermission", () => {
    it("allows an ADMIN member when ADMIN is in fallbackRoles", async () => {
      const { db, service } = setup();
      db.membership.findFirst.mockResolvedValue({ role: MembershipRole.ADMIN });

      const result = await service.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.delete",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toBe(true);
      expect(db.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, teamId: 10, accepted: true },
        select: { role: true },
      });
    });

    it("denies a MEMBER when only ADMIN/OWNER are in fallbackRoles", async () => {
      const { db, service } = setup();
      db.membership.findFirst.mockResolvedValue({ role: MembershipRole.MEMBER });

      const result = await service.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.delete",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toBe(false);
    });

    it("allows a MEMBER when MEMBER is in fallbackRoles", async () => {
      const { db, service } = setup();
      db.membership.findFirst.mockResolvedValue({ role: MembershipRole.MEMBER });

      const result = await service.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.read",
        fallbackRoles: [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toBe(true);
    });

    it("denies a non-member", async () => {
      const { db, service } = setup();
      db.membership.findFirst.mockResolvedValue(null);

      const result = await service.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "eventType.read",
        fallbackRoles: [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toBe(false);
    });

    it("denies when fallbackRoles is empty without querying", async () => {
      const { db, service } = setup();

      const result = await service.checkPermission({
        userId: 1,
        teamId: 10,
        permission: "team.read",
        fallbackRoles: [],
      });

      expect(result).toBe(false);
      expect(db.membership.findFirst).not.toHaveBeenCalled();
    });

    it("denies a missing teamId without querying", async () => {
      const { db, service } = setup();

      const result = await service.checkPermission({
        userId: 1,
        teamId: 0,
        permission: "eventType.create",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toBe(false);
      expect(db.membership.findFirst).not.toHaveBeenCalled();
    });

    it("hasPermission delegates to checkPermission", async () => {
      const { db, service } = setup();
      db.membership.findFirst.mockResolvedValue({ role: MembershipRole.OWNER });

      const result = await service.hasPermission({
        userId: 1,
        teamId: 10,
        permission: "booking.readTeamBookings",
        fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
      });

      expect(result).toBe(true);
    });
  });

  describe("getTeamIdsWithPermission", () => {
    it("returns only the team ids with a matching accepted membership", async () => {
      const { db, service } = setup();
      db.membership.findMany.mockResolvedValue([{ teamId: 10 }, { teamId: 12 }]);

      const result = await service.getTeamIdsWithPermission({
        userId: 1,
        permission: "eventType.update",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });

      expect(result).toEqual([10, 12]);
      expect(db.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
        },
        select: { teamId: true },
      });
    });

    it("restricts to the org and its direct child teams when orgId is given", async () => {
      const { db, service } = setup();
      db.membership.findMany.mockResolvedValue([{ teamId: 20 }]);

      const result = await service.getTeamIdsWithPermission({
        userId: 1,
        permission: "booking.read",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
        orgId: 20,
      });

      expect(result).toEqual([20]);
      expect(db.membership.findMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          accepted: true,
          role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
          team: { OR: [{ id: 20 }, { parentId: 20 }] },
        },
        select: { teamId: true },
      });
    });

    it("returns an empty list when fallbackRoles is empty without querying", async () => {
      const { db, service } = setup();

      const result = await service.getTeamIdsWithPermission({
        userId: 1,
        permission: "team.update",
        fallbackRoles: [],
      });

      expect(result).toEqual([]);
      expect(db.membership.findMany).not.toHaveBeenCalled();
    });
  });
});
