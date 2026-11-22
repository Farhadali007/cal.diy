import { prisma } from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { TRPCError } from "@trpc/server";
import authedProcedure from "../../../procedures/authedProcedure";
import { webhookIdAndEventTypeIdSchema } from "./types";

type WebhookAccessInput = {
  id?: string;
  webhookId?: string;
  eventTypeId?: number;
  teamId?: number;
};

async function isTeamMember(userId: number, teamId: number): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return !!membership;
}

async function assertEventTypeAccess(userId: number, eventTypeId: number) {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    select: { id: true, userId: true, teamId: true },
  });

  if (!eventType) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (eventType.teamId) {
    // Team event type: any team member (or the creator) may manage its webhooks.
    if (!(await isTeamMember(userId, eventType.teamId)) && eventType.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
  } else if (eventType.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

// CVE-2026-112043: team-scoped webhooks (teamId set, userId null, no eventTypeId)
// previously passed this procedure with no ownership check at all, so any
// authenticated user could read, edit, delete or trigger any team's webhooks — and
// create webhooks scoped to teams they don't belong to. Every scope now requires
// proof of ownership: the owning user, a member of the owning team, or (for
// ownerless platform webhooks) an admin.
export async function assertWebhookAccess({
  user,
  input,
}: {
  user: Pick<NonNullable<TrpcSessionUser>, "id" | "role">;
  input?: WebhookAccessInput;
}) {
  if (!input) return;

  const { id, webhookId, eventTypeId, teamId } = input;
  const lookupId = id || webhookId;

  if (lookupId) {
    // Check if user is authorized to access webhook
    const webhook = await prisma.webhook.findUnique({
      where: { id: lookupId },
      select: {
        id: true,
        userId: true,
        teamId: true,
        eventTypeId: true,
      },
    });

    if (!webhook) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (eventTypeId && eventTypeId !== webhook.eventTypeId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (webhook.eventTypeId) {
      await assertEventTypeAccess(user.id, webhook.eventTypeId);
    } else if (webhook.teamId) {
      if (!(await isTeamMember(user.id, webhook.teamId)) && webhook.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    } else if (webhook.userId) {
      if (webhook.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
    } else if (user.role !== "ADMIN") {
      // Ownerless webhook (e.g. platform webhook): admins only.
      throw new TRPCError({ code: "FORBIDDEN" });
    }
  } else if (eventTypeId) {
    await assertEventTypeAccess(user.id, eventTypeId);
  } else if (teamId) {
    // Creating (or listing) webhooks scoped to a team requires membership of that team.
    if (!(await isTeamMember(user.id, teamId))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
  }
}

export const createWebhookProcedure = () => {
  return authedProcedure.input(webhookIdAndEventTypeIdSchema.optional()).use(async ({ ctx, input, next }) => {
    await assertWebhookAccess({ user: ctx.user, input });

    return next();
  });
};

export const webhookProcedure = createWebhookProcedure();
