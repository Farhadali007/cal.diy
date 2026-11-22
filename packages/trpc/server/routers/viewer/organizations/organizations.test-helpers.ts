import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import type { Session } from "next-auth";

export const ORG_ID = 1;
export const ADMIN_USER_ID = 10;
export const MEMBER_USER_ID = 11;
export const TARGET_ORG_ID = 2;

export const orgRow = (overrides: Record<string, unknown> = {}) => ({
  id: ORG_ID,
  name: "Acme",
  slug: "acme",
  logoUrl: null,
  timeZone: "Europe/London",
  isOrganization: true,
  parentId: null,
  organizationSettings: { suspended: false, suspendedAt: null, suspendedReason: null },
  ...overrides,
});

export const userRowWithOrg = (overrides: Record<string, unknown> = {}) => ({
  organizationId: ORG_ID,
  movedToProfile: null,
  profiles: [{ organizationId: ORG_ID }],
  ...overrides,
});

export const userRowWithoutOrg = () => ({
  organizationId: null,
  movedToProfile: null,
  profiles: [],
});

export const membershipRow = (overrides: Record<string, unknown> = {}) => ({
  accepted: true,
  role: "ADMIN",
  ...overrides,
});

export const sessionUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: ADMIN_USER_ID,
    role: "USER",
    email: "admin@acme.test",
    name: "Org Admin",
    ...overrides,
  }) as unknown as NonNullable<TrpcSessionUser>;

export const createCtx = (userOverrides: Record<string, unknown> = {}) => ({
  user: sessionUser(userOverrides),
  session: {} as unknown as Session,
});

export const settingsRow = (overrides: Record<string, unknown> = {}) => ({
  organizationId: ORG_ID,
  orgAutoAcceptEmail: "acme.test",
  lockEventTypeCreationForUsers: false,
  adminGetsNoSlotsNotification: false,
  allowSEOIndexing: false,
  orgAutoJoinOnSignup: true,
  isAdminAPIEnabled: false,
  disableAttendeeConfirmationEmail: false,
  disableAttendeeCancellationEmail: false,
  disableAttendeeRescheduledEmail: false,
  disableAttendeeRequestEmail: false,
  disableAttendeeReassignedEmail: false,
  disableAttendeeAwaitingPaymentEmail: false,
  disableAttendeeRescheduleRequestEmail: false,
  disableAttendeeLocationChangeEmail: false,
  disableAttendeeNewEventEmail: false,
  ...overrides,
});

export const memberRow = (overrides: Record<string, unknown> = {}) => ({
  id: 100,
  userId: MEMBER_USER_ID,
  role: "MEMBER",
  accepted: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  user: {
    id: MEMBER_USER_ID,
    email: "member@acme.test",
    name: "Member User",
    username: "member",
    avatarUrl: null,
  },
  ...overrides,
});

export const managedLinkRow = (overrides: Record<string, unknown> = {}) => ({
  managedOrganizationId: TARGET_ORG_ID,
  managerOrganizationId: ORG_ID,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  managedOrganization: { id: TARGET_ORG_ID, name: "Beta", slug: "beta", logoUrl: null },
  ...overrides,
});

/** Runs fn and returns the thrown TRPCError code, or null when it resolves. */
export const getErrorCode = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn();
    return null;
  } catch (error) {
    return (error as { code?: unknown }).code ?? null;
  }
};
