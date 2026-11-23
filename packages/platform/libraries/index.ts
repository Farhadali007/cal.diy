import { randomUUID } from "node:crypto";
import { getBookingForReschedule } from "@calcom/features/bookings/lib/get-booking";
import getAllUserBookings from "@calcom/features/bookings/lib/getAllUserBookings";
import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import getBookingInfo from "@calcom/features/bookings/lib/getBookingInfo";
import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import handleMarkNoShow from "@calcom/features/handleMarkNoShow";
import { getTranslation } from "@calcom/i18n/server";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import { slugify } from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { CreationSource, MembershipRole } from "@calcom/prisma/enums";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import { paymentDataSelect } from "@calcom/prisma/selects/payment";

export { slugify } from "@calcom/lib/slugify";
export { slugifyLenient } from "@calcom/lib/slugify-lenient";
export { getBookingForReschedule };

export { getWebhookProducer } from "@calcom/features/di/webhooks/containers/webhook";
export { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
export {
  DEFAULT_WEBHOOK_VERSION,
  WebhookVersion,
} from "@calcom/features/webhooks/lib/interface/IWebhookRepository";
export type { IWebhookProducerService } from "@calcom/features/webhooks/lib/interface/WebhookProducerService";
export {
  AttributeType,
  CreationSource,
  MembershipRole,
  PeriodType,
  SchedulingType,
  TimeUnit,
  WebhookTriggerEvents,
} from "@calcom/prisma/enums";
export type { CalendarEvent, EventBusyDate } from "@calcom/types/Calendar";

export { handleMarkNoShow };

export type {
  BookingCreateBody,
  BookingResponse,
} from "@calcom/features/bookings/types";
export type { ConnectedCalendar } from "@calcom/features/calendars/lib/CalendarManager";
export {
  getBusyCalendarTimes,
  updateEvent,
} from "@calcom/features/calendars/lib/CalendarManager";
export type { ConnectedDestinationCalendars } from "@calcom/features/calendars/lib/getConnectedDestinationCalendars";
export { getConnectedDestinationCalendarsAndEnsureDefaultsInDb } from "@calcom/features/calendars/lib/getConnectedDestinationCalendars";
export type { CityTimezones } from "@calcom/features/cityTimezones/cityTimezonesHandler";
export { cityTimezonesHandler } from "@calcom/features/cityTimezones/cityTimezonesHandler";
export { ENABLE_ASYNC_TASKER, MINUTES_TO_BOOK } from "@calcom/lib/constants";
export { TRPCError } from "@trpc/server";

export { getAllUserBookings };
export { getBookingInfo };
export { handleCancelBooking };

export { dynamicEvent } from "@calcom/features/eventtypes/lib/defaultEvents";
export { parseBookingLimit } from "@calcom/lib/intervalLimits/isBookingLimits";
export { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
export {
  bookingMetadataSchema,
  teamMetadataSchema,
  userMetadata,
} from "@calcom/prisma/zod-utils";

export { symmetricEncrypt, symmetricDecrypt };

export { getTranslation };

export { validateCustomEventName } from "@calcom/features/eventtypes/lib/eventNaming";

export type TeamQuery = Prisma.TeamGetPayload<{
  select: {
    id: true;
    credentials: {
      select: typeof import("@calcom/prisma/selects/credential").credentialForCalendarServiceSelect;
    };
    name: true;
    logoUrl: true;
    members: {
      select: {
        role: true;
      };
    };
  };
}>;

export { credentialForCalendarServiceSelect };
export { paymentDataSelect };
export { confirmHandler as confirmBookingHandler } from "@calcom/trpc/server/routers/viewer/bookings/confirm.handler";
export { getBookingFieldsWithSystemFields };

export { sendLocationChangeEmailsAndSMS } from "@calcom/emails/email-manager";
export { checkAdminOrOwner } from "@calcom/features/auth/lib/checkAdminOrOwner";
export { verifyCodeUnAuthenticated } from "@calcom/features/auth/lib/verifyCodeUnAuthenticated";
export { sendEmailVerificationByCode } from "@calcom/features/auth/lib/verifyEmail";
export { BookingReferenceRepository } from "@calcom/features/bookingReference/repositories/BookingReferenceRepository";
export { getCalendarLinks } from "@calcom/features/bookings/lib/getCalendarLinks";
export { BookingAccessService } from "@calcom/features/bookings/services/BookingAccessService";
export { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
export type { OrgMembershipLookup } from "@calcom/features/di/modules/OrgMembershipLookup";
export type { OAuth2Tokens } from "@calcom/features/oauth/services/OAuthService";
export { OAuthService } from "@calcom/features/oauth/services/OAuthService";
export { generateSecret } from "@calcom/features/oauth/utils/generateSecret";
export { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
export { SelectedCalendarRepository } from "@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository";
export type { Tasker } from "@calcom/features/tasker/tasker";
export { getTasker } from "@calcom/features/tasker/tasker-factory";
export { buildCalEventFromBooking } from "@calcom/lib/buildCalEventFromBooking";
export { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
export { verifyCodeChallenge } from "@calcom/lib/pkce";
export { encryptServiceAccountKey } from "@calcom/lib/server/serviceAccountKey";
export { validateUrlForSSRFSync } from "@calcom/lib/ssrfProtection";
export type { TraceContext } from "@calcom/lib/tracing";
export { distributedTracing } from "@calcom/lib/tracing/factory";
export {
  type BookingWithUserAndEventDetails,
  bookingWithUserAndEventDetailsSelect,
} from "@calcom/prisma/selects/booking";
export { checkEmailVerificationRequired } from "@calcom/trpc/server/routers/publicViewer/checkIfUserEmailVerificationRequired.handler";
export type { CredentialForCalendarService } from "@calcom/types/Credential";

// === Stubs for deleted EE features still imported by API v2 ===

// Round-robin reassignment removed (EE feature) — stubs for API v2
export async function roundRobinManualReassignment(_args: {
  bookingId: number;
  newUserId: number;
  orgId?: number | null;
  reassignReason?: string;
  reassignedById?: number;
  emailsEnabled?: boolean;
  platformClientParams?: unknown;
  actionSource?: string;
  reassignedByUuid?: string;
}): Promise<void> {
  // No-op in community edition
}

export async function roundRobinReassignment(_args: {
  bookingId: number;
  orgId?: number | null;
  emailsEnabled?: boolean;
  platformClientParams?: unknown;
  reassignedById?: number;
  actionSource?: string;
  reassignedByUuid?: string;
}): Promise<void> {
  // No-op in community edition
}

// createApiKeyHandler removed (EE feature) — stub for API v2
export async function createApiKeyHandler(_args: {
  ctx: { user: { id: number } };
  input: {
    note?: string | null;
    neverExpires?: boolean;
    expiresAt?: Date | null;
    teamId?: number;
  };
}): Promise<string> {
  throw new Error("API key creation is not available in community edition");
}

// getClientSecretFromPayment removed (EE feature) — stub for API v2
export function getClientSecretFromPayment(payment: { data: Record<string, unknown> }): string | null {
  const data = payment.data;
  if (data && typeof data === "object" && "client_secret" in data) {
    return data.client_secret as string;
  }
  return null;
}

// verifyCodeAuthenticated removed (EE feature) — stub for API v2
export async function verifyCodeAuthenticated(_args: {
  user: { id: number; email?: string; [key: string]: unknown };
  email: string;
  code: string;
}): Promise<boolean> {
  return false;
}

// VOICERO: community-edition implementation of the EE-removed
// createNewUsersConnectToOrgIfExists, scoped to the platform-managed-user
// path used by API v2 (OAuthClientUsersService.createOAuthClientUser).
// Creates (or connects) one user per invitation, adds an accepted org
// membership, and creates the org profile. Invitation emails, verification
// flows, sub-team invites, and auto-accept domain rules are out of scope:
// the API v2 caller is an authenticated OAuth client acting for the org and
// passes autoAccept for every invitation, so memberships are accepted
// unconditionally here. Retry-safe: re-running for an existing email
// connects that user instead of failing.
export async function createNewUsersConnectToOrgIfExists(args: {
  invitations: { usernameOrEmail: string; role: string }[];
  creationSource?: string;
  teamId: number;
  isOrg: boolean;
  parentId: number | null;
  autoAcceptEmailDomain: string;
  orgConnectInfoByUsernameOrEmail: Record<string, { orgId: number; autoAccept: boolean }>;
  isPlatformManaged?: boolean;
  timeFormat?: number;
  weekStart?: string;
  timeZone?: string;
  language?: string;
}): Promise<{ id: number; email: string; username: string }[]> {
  function deriveUsernameFromEmail(email: string): string {
    // Mirrors the username derivation in OAuthClientUsersService.updateOAuthClientUser.
    const [emailUser, emailDomain = ""] = email.split("@");
    const [domainName, TLD] = emailDomain.split(".");
    if (TLD) {
      return slugify(`${emailUser}-${domainName}-${TLD}`);
    }
    return slugify(`${emailUser}-${domainName}`);
  }

  async function ensureAvailableUsername(base: string, organizationId: number | null): Promise<string> {
    // User @@unique([username, organizationId]) and Profile @@unique([username, organizationId]).
    let candidate = base;
    for (let attempt = 2; attempt <= 100; attempt++) {
      const userConflict = await prisma.user.findFirst({
        where: { username: candidate, organizationId },
        select: { id: true },
      });
      let profileConflict: { id: number } | null = null;
      if (organizationId !== null) {
        profileConflict = await prisma.profile.findFirst({
          where: { username: candidate, organizationId },
          select: { id: true },
        });
      }
      if (!userConflict && !profileConflict) return candidate;
      candidate = `${base}-${attempt}`;
    }
    throw new Error(`Could not find an available username for base "${base}"`);
  }

  const created: { id: number; email: string; username: string }[] = [];
  for (const invitation of args.invitations) {
    const email = invitation.usernameOrEmail;
    const roleByName: Record<string, MembershipRole> = {
      ADMIN: MembershipRole.ADMIN,
      OWNER: MembershipRole.OWNER,
    };
    const role = roleByName[invitation.role] ?? MembershipRole.MEMBER;
    const creationSourceByName: Record<string, CreationSource> = {
      [CreationSource.API_V1]: CreationSource.API_V1,
      [CreationSource.API_V2]: CreationSource.API_V2,
      [CreationSource.WEBAPP]: CreationSource.WEBAPP,
    };
    const creationSource = args.creationSource ? creationSourceByName[args.creationSource] : undefined;
    let organizationId: number | null = null;
    if (args.isOrg) {
      organizationId = args.teamId;
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true },
    });

    let username: string;
    let userId: number;
    if (existing) {
      // Connect the existing user; only assign a username when they have none.
      userId = existing.id;
      username =
        existing.username ?? (await ensureAvailableUsername(deriveUsernameFromEmail(email), organizationId));
      if (!existing.username) {
        await prisma.user.update({ where: { id: existing.id }, data: { username } });
      }
    } else {
      username = await ensureAvailableUsername(deriveUsernameFromEmail(email), organizationId);
      const user = await prisma.user.create({
        data: {
          email,
          username,
          // The API v2 caller overwrites the name immediately after creation.
          name: email.split("@")[0],
          timeZone: args.timeZone ?? "Europe/London",
          weekStart: args.weekStart ?? "Sunday",
          timeFormat: args.timeFormat ?? 12,
          locale: args.language,
          organizationId: organizationId ?? undefined,
          isPlatformManaged: args.isPlatformManaged ?? false,
          creationSource,
          // Platform-managed users authenticate via OAuth tokens, never via
          // email/password, so no email verification round-trip applies.
          emailVerified: new Date(),
        },
        select: { id: true },
      });
      userId = user.id;
    }

    await prisma.membership.upsert({
      where: { userId_teamId: { userId, teamId: args.teamId } },
      update: { accepted: true, role },
      create: { userId, teamId: args.teamId, role, accepted: true },
    });

    if (args.isOrg) {
      await prisma.profile.upsert({
        where: { userId_organizationId: { userId, organizationId: args.teamId } },
        update: { username },
        create: {
          uid: randomUUID(),
          userId,
          organizationId: args.teamId,
          username,
        },
      });
    }

    created.push({ id: userId, email, username });
  }
  return created;
}

// sendVerificationCode removed (EE feature) — stub for API v2
export async function sendVerificationCode(_phoneNumber: string): Promise<void> {
  throw new Error("Phone verification is not available in community edition");
}

// verifyPhoneNumber removed (EE feature) — stub for API v2
export async function verifyPhoneNumber(
  _phoneNumber: string,
  _code: string,
  _userId: number,
  _teamId?: number
): Promise<boolean> {
  throw new Error("Phone verification is not available in community edition");
}
