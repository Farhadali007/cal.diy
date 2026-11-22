import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWebhookFindUnique = vi.fn();
const mockEventTypeFindUnique = vi.fn();
const mockMembershipFindUnique = vi.fn();

vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    webhook: {
      findUnique: (...args: unknown[]) => mockWebhookFindUnique(...args),
    },
    eventType: {
      findUnique: (...args: unknown[]) => mockEventTypeFindUnique(...args),
    },
    membership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
  };
  return { default: mockPrisma, prisma: mockPrisma };
});

import { assertWebhookAccess } from "./util";

describe("assertWebhookAccess", () => {
  const memberUser = { id: 1, role: "USER" } as const;
  const otherUser = { id: 2, role: "USER" } as const;
  const adminUser = { id: 3, role: "ADMIN" } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipFindUnique.mockResolvedValue(null);
  });

  it("allows access when there is no input", async () => {
    await expect(assertWebhookAccess({ user: memberUser })).resolves.toBeUndefined();
  });

  it("throws NOT_FOUND when the webhook does not exist", async () => {
    mockWebhookFindUnique.mockResolvedValue(null);
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "missing" } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws UNAUTHORIZED when the eventTypeId does not match the webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: 1,
      teamId: null,
      eventTypeId: 10,
    });
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "w1", eventTypeId: 11 } })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows the owning user to access their own webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: 1,
      teamId: null,
      eventTypeId: null,
    });
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "w1" } })
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN for a non-owner accessing a user webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: 1,
      teamId: null,
      eventTypeId: null,
    });
    await expect(assertWebhookAccess({ user: otherUser, input: { webhookId: "w1" } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  // CVE-2026-112043: team-scoped webhooks (teamId set, userId null, no eventTypeId)
  // previously passed with no ownership check at all.
  it("throws FORBIDDEN for a non-member accessing a team webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: 7,
      eventTypeId: null,
    });
    await expect(assertWebhookAccess({ user: otherUser, input: { webhookId: "w1" } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: 2, teamId: 7 } },
    });
  });

  it("allows a team member to access a team webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: 7,
      eventTypeId: null,
    });
    mockMembershipFindUnique.mockResolvedValue({ id: 100 });
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "w1" } })
    ).resolves.toBeUndefined();
  });

  it("allows the creator of a team webhook even without a membership row", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: 1,
      teamId: 7,
      eventTypeId: null,
    });
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "w1" } })
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN for a non-member creating a webhook scoped to a team", async () => {
    await expect(assertWebhookAccess({ user: otherUser, input: { teamId: 7 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows a team member to create a webhook scoped to their team", async () => {
    mockMembershipFindUnique.mockResolvedValue({ id: 100 });
    await expect(assertWebhookAccess({ user: memberUser, input: { teamId: 7 } })).resolves.toBeUndefined();
  });

  it("allows a team member to access a webhook on a team event type", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: null,
      eventTypeId: 10,
    });
    mockEventTypeFindUnique.mockResolvedValue({ id: 10, userId: null, teamId: 7 });
    mockMembershipFindUnique.mockResolvedValue({ id: 100 });
    await expect(
      assertWebhookAccess({ user: memberUser, input: { webhookId: "w1" } })
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN for a non-member accessing a webhook on a team event type", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: null,
      eventTypeId: 10,
    });
    mockEventTypeFindUnique.mockResolvedValue({ id: 10, userId: null, teamId: 7 });
    await expect(assertWebhookAccess({ user: otherUser, input: { webhookId: "w1" } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for a non-admin accessing an ownerless (platform) webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: null,
      eventTypeId: null,
    });
    await expect(assertWebhookAccess({ user: otherUser, input: { webhookId: "w1" } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows an admin to access an ownerless (platform) webhook", async () => {
    mockWebhookFindUnique.mockResolvedValue({
      id: "w1",
      userId: null,
      teamId: null,
      eventTypeId: null,
    });
    await expect(
      assertWebhookAccess({ user: adminUser, input: { webhookId: "w1" } })
    ).resolves.toBeUndefined();
  });
});
