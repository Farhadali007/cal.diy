import { z } from "zod";

/**
 * The OrganizationSettings fields editable from the org settings UI.
 * Suspension fields are intentionally excluded (platform-admin via API v2
 * only) and dSyncData is out of scope (SCIM).
 */
export const ZOrganizationSettingsFieldsSchema = z.object({
  orgAutoAcceptEmail: z.string().optional(),
  lockEventTypeCreationForUsers: z.boolean().optional(),
  adminGetsNoSlotsNotification: z.boolean().optional(),
  allowSEOIndexing: z.boolean().optional(),
  orgAutoJoinOnSignup: z.boolean().optional(),
  isAdminAPIEnabled: z.boolean().optional(),
  disableAttendeeConfirmationEmail: z.boolean().optional(),
  disableAttendeeCancellationEmail: z.boolean().optional(),
  disableAttendeeRescheduledEmail: z.boolean().optional(),
  disableAttendeeRequestEmail: z.boolean().optional(),
  disableAttendeeReassignedEmail: z.boolean().optional(),
  disableAttendeeAwaitingPaymentEmail: z.boolean().optional(),
  disableAttendeeRescheduleRequestEmail: z.boolean().optional(),
  disableAttendeeLocationChangeEmail: z.boolean().optional(),
  disableAttendeeNewEventEmail: z.boolean().optional(),
});

export type TOrganizationSettingsFields = z.infer<typeof ZOrganizationSettingsFieldsSchema>;

export const organizationSettingsSelect = {
  organizationId: true,
  orgAutoAcceptEmail: true,
  lockEventTypeCreationForUsers: true,
  adminGetsNoSlotsNotification: true,
  allowSEOIndexing: true,
  orgAutoJoinOnSignup: true,
  isAdminAPIEnabled: true,
  disableAttendeeConfirmationEmail: true,
  disableAttendeeCancellationEmail: true,
  disableAttendeeRescheduledEmail: true,
  disableAttendeeRequestEmail: true,
  disableAttendeeReassignedEmail: true,
  disableAttendeeAwaitingPaymentEmail: true,
  disableAttendeeRescheduleRequestEmail: true,
  disableAttendeeLocationChangeEmail: true,
  disableAttendeeNewEventEmail: true,
} as const;

/** Schema defaults, returned when an org has no settings row yet. */
export const getDefaultOrganizationSettings = (organizationId: number) => ({
  organizationId,
  orgAutoAcceptEmail: "",
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
});
