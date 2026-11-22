import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { authedProcedure } from "../../../procedures/authedProcedure";
import { createEventPbacProcedure, ensureEmailOrPhoneNumberIsPresent } from "../util";

describe("createEventPbacProcedure", () => {
  const mockPrisma = {
    eventType: {
      findUnique: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaClient;

  // The team permission check reads the caller's membership from ctx.prisma.
  const mockMembership = (role: MembershipRole | null) => {
    mockPrisma.membership.findFirst = vi.fn().mockResolvedValue(role ? { role } : null);
  };

  const mockCtx = {
    user: { id: 1, profile: { upId: "user-1" } },
    session: { user: { id: 1 } },
    prisma: mockPrisma,
  };

  const mockNext = vi.fn().mockResolvedValue({ ctx: mockCtx });

  // Helper to get the custom middleware (after authedProcedure)
  const getMiddleware = (procedure: ReturnType<typeof authedProcedure>) => {
    // The last middleware is our custom one
    return procedure._def.middlewares[procedure._def.middlewares.length - 1];
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("personal events", () => {
    const personalEvent = {
      id: 1,
      userId: 1,
      teamId: null,
      users: [{ id: 1 }],
      team: null,
    };

    it("should allow owner to access their personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should allow assigned user to access personal event", async () => {
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 1 }, { id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny non-owner/non-assigned user from accessing personal event", async () => {
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("should deny team member from accessing another user's personal event", async () => {
      // User 1 trying to access user 2's personal event
      mockPrisma.eventType.findUnique = vi
        .fn()
        .mockResolvedValue({ ...personalEvent, userId: 2, users: [{ id: 2 }] });

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 1 },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Permission required: eventType.update");
    });

    it("should only allow assigning self to personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 1, users: [1] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny assigning other users to personal event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(personalEvent);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 1, users: [1, 2] },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });
  });

  describe("team events - with permission", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      },
    };

    it("should allow team admin with permission to access team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update", [
        MembershipRole.ADMIN,
        MembershipRole.OWNER,
      ]);
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should allow org admin without team membership to access team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue({
        ...teamEvent,
        team: { parentId: 20, members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }] },
      });
      mockPrisma.membership.findFirst = vi
        .fn()
        .mockImplementation(async ({ where }: { where: { teamId: number } }) =>
          where.teamId === 20 ? { role: MembershipRole.ADMIN } : null
        );

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);
      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("team events - without permission", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      },
    };

    const runMiddleware = async (procedure: ReturnType<typeof createEventPbacProcedure>) => {
      const middleware = getMiddleware(procedure);
      return middleware({
        ctx: mockCtx,
        input: { id: 2 },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });
    };

    it("should deny a non-member from accessing a team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(null);

      const result = runMiddleware(
        createEventPbacProcedure("eventType.update", [MembershipRole.ADMIN, MembershipRole.OWNER])
      );

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Permission required: eventType.update");
    });

    it("should deny a plain MEMBER when the fallback roles are ADMIN/OWNER", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.MEMBER);

      const result = runMiddleware(
        createEventPbacProcedure("eventType.update", [MembershipRole.ADMIN, MembershipRole.OWNER])
      );

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Permission required: eventType.update");
    });

    it("should allow a MEMBER when MEMBER is in the fallback roles", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.MEMBER);

      await expect(
        runMiddleware(
          createEventPbacProcedure("eventType.read", [
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
            MembershipRole.MEMBER,
          ])
        )
      ).resolves.not.toThrow();
    });

    it("should deny an org MEMBER via the parent-org fallback", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue({
        ...teamEvent,
        team: { parentId: 20, members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }] },
      });
      mockPrisma.membership.findFirst = vi
        .fn()
        .mockImplementation(async ({ where }: { where: { teamId: number } }) =>
          where.teamId === 20 ? { role: MembershipRole.MEMBER } : null
        );

      const result = runMiddleware(createEventPbacProcedure("eventType.update"));

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Permission required: eventType.update");
    });
  });

  describe("team events - user assignment validation", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      },
    };

    it("should allow assigning team members to team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2, users: [1, 2, 3] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should deny assigning non-team members to team event", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [1, 2, 999] },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should deny assigning org members who are not in the team", async () => {
      // Team admin (user 1) has permission but tries to assign org member (user 50) who's not in team
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [1, 50] }, // User 50 is an org member but not team member
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should deny assigning only non-team members even if user has permission", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 2, users: [100, 200, 300] }, // All users not in team
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toThrow("Cannot assign event to users outside of team membership");
    });

    it("should allow empty users array", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2, users: [] },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should not validate users when not provided", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("event not found", () => {
    it("should throw NOT_FOUND when event does not exist", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(null);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      const result = middleware({
        ctx: mockCtx,
        input: { id: 999 },
        next: mockNext,
        path: "test",
        type: "mutation",
        getRawInput: async () => ({}),
        meta: undefined,
      });

      await expect(result).rejects.toThrow(TRPCError);
      await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("input validation", () => {
    it("should accept eventTypeId as alternative to id", async () => {
      const event = {
        id: 1,
        userId: 1,
        teamId: null,
        users: [{ id: 1 }],
        team: null,
      };
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(event);

      const procedure = createEventPbacProcedure("eventType.update");
      const middleware = getMiddleware(procedure);

      await expect(
        middleware({
          ctx: mockCtx,
          input: { eventTypeId: 1 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();

      expect(mockPrisma.eventType.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });
  });

  describe("different permissions and fallback roles", () => {
    const teamEvent = {
      id: 2,
      userId: null,
      teamId: 10,
      users: [],
      team: {
        members: [{ userId: 1 }],
      },
    };

    it("should allow access with custom permission string", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.ADMIN);

      const procedure = createEventPbacProcedure("eventType.delete");
      const middleware = getMiddleware(procedure);
      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });

    it("should allow access with custom fallback roles", async () => {
      mockPrisma.eventType.findUnique = vi.fn().mockResolvedValue(teamEvent);
      mockMembership(MembershipRole.OWNER);

      const procedure = createEventPbacProcedure("eventType.create", [MembershipRole.OWNER]);
      const middleware = getMiddleware(procedure);
      await expect(
        middleware({
          ctx: mockCtx,
          input: { id: 2 },
          next: mockNext,
          path: "test",
          type: "mutation",
          getRawInput: async () => ({}),
          meta: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("ensureEmailOrPhoneNumberIsPresent", () => {
    it("should throw error when both email and phone are hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_and_phone_both_hidden",
        })
      );
    });

    it("should throw error when neither email nor phone is required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_or_phone_required",
        })
      );
    });

    it("should throw error when email is hidden and phone is not required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_phone_required_when_email_hidden",
        })
      );
    });

    it("should throw error when phone is hidden and email is not required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(TRPCError);
      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).toThrow(
        expect.objectContaining({
          code: "BAD_REQUEST",
          message: "booking_fields_email_required_when_phone_hidden",
        })
      );
    });

    it("should pass when email is visible and required while phone is hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: false,
          hidden: true,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });

    it("should pass when phone is visible and required while email is hidden", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: false,
          hidden: true,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });

    it("should pass when both email and phone are visible and required", () => {
      const fields = [
        {
          name: "email",
          type: "email" as const,
          required: true,
          hidden: false,
        },
        {
          name: "attendeePhoneNumber",
          type: "phone" as const,
          required: true,
          hidden: false,
        },
      ];

      expect(() => ensureEmailOrPhoneNumberIsPresent(fields)).not.toThrow();
    });
  });
});
