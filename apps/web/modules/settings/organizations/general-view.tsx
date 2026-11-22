"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { SettingsToggle, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsOrgGeneral } from "app/cache/path/settings/organizations";
import { useState } from "react";

type OrgSettings = RouterOutputs["viewer"]["organizations"]["getSettings"];
type SettingsValues = Omit<OrgSettings, "organizationId">;
type BooleanSettingKey = {
  [K in keyof SettingsValues]: SettingsValues[K] extends boolean ? K : never;
}[keyof SettingsValues];

const ATTENDEE_EMAIL_TOGGLES: { key: BooleanSettingKey; labelKey: string }[] = [
  { key: "disableAttendeeConfirmationEmail", labelKey: "disable_attendee_confirmation_email" },
  { key: "disableAttendeeCancellationEmail", labelKey: "disable_attendee_cancellation_email" },
  { key: "disableAttendeeRescheduledEmail", labelKey: "disable_attendee_rescheduled_email" },
  { key: "disableAttendeeRequestEmail", labelKey: "disable_attendee_request_email" },
  { key: "disableAttendeeReassignedEmail", labelKey: "disable_attendee_reassigned_email" },
  {
    key: "disableAttendeeAwaitingPaymentEmail",
    labelKey: "disable_attendee_awaiting_payment_email",
  },
  {
    key: "disableAttendeeRescheduleRequestEmail",
    labelKey: "disable_attendee_reschedule_request_email",
  },
  { key: "disableAttendeeLocationChangeEmail", labelKey: "disable_attendee_location_change_email" },
  { key: "disableAttendeeNewEventEmail", labelKey: "disable_attendee_new_event_email" },
];

const toValues = (settings: OrgSettings): SettingsValues => {
  const { organizationId: _organizationId, ...values } = settings;
  return values;
};

const GeneralView = ({ settings }: { settings: OrgSettings }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [initialValues] = useState(() => toValues(settings));
  const [values, setValues] = useState<SettingsValues>(initialValues);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  const updateSettingsMutation = trpc.viewer.organizations.updateSettings.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.getSettings.invalidate();
      revalidateSettingsOrgGeneral();
      showToast(t("settings_updated_successfully"), "success");
    },
    onError: () => {
      showToast(t("error_updating_settings"), "error");
    },
  });

  const setBoolean = (key: BooleanSettingKey, checked: boolean) =>
    setValues((prev) => ({ ...prev, [key]: checked }));

  const generalToggles: { key: BooleanSettingKey; title: string; description: string }[] = [
    {
      key: "lockEventTypeCreationForUsers",
      title: t("lock_event_type_creation"),
      description: t("lock_event_type_creation_description"),
    },
    {
      key: "adminGetsNoSlotsNotification",
      title: t("admin_no_slots_notification"),
      description: t("admin_no_slots_notification_description"),
    },
    {
      key: "allowSEOIndexing",
      title: t("allow_seo_indexing"),
      description: t("allow_seo_indexing_description"),
    },
    {
      key: "orgAutoJoinOnSignup",
      title: t("org_auto_join_on_signup"),
      description: t("org_auto_join_on_signup_description"),
    },
    {
      key: "isAdminAPIEnabled",
      title: t("admin_api_enabled"),
      description: t("admin_api_enabled_description"),
    },
  ];

  return (
    <SettingsHeader
      title={t("general")}
      description={t("org_general_settings_description")}
      borderInShellHeader={true}>
      <div className="border-subtle stack-y-6 rounded-b-lg border border-t-0 px-4 py-8 sm:px-6">
        <TextField
          label={t("org_auto_accept_email")}
          hint={t("org_auto_accept_email_description")}
          value={values.orgAutoAcceptEmail}
          onChange={(event) =>
            setValues((prev) => ({ ...prev, orgAutoAcceptEmail: event.target.value }))
          }
        />
        {generalToggles.map(({ key, title, description }) => (
          <SettingsToggle
            key={key}
            title={title}
            description={description}
            checked={values[key]}
            onCheckedChange={(checked) => setBoolean(key, checked)}
          />
        ))}
        <div>
          <h3 className="font-semibold text-emphasis text-base">{t("attendee_emails")}</h3>
          <p className="text-sm text-subtle">{t("attendee_emails_description")}</p>
        </div>
        {ATTENDEE_EMAIL_TOGGLES.map(({ key, labelKey }) => (
          <SettingsToggle
            key={key}
            title={t(labelKey)}
            checked={values[key]}
            onCheckedChange={(checked) => setBoolean(key, checked)}
          />
        ))}
      </div>
      <SectionBottomActions>
        <Button
          color="primary"
          disabled={!isDirty}
          loading={updateSettingsMutation.isPending}
          onClick={() => updateSettingsMutation.mutate(values)}>
          {t("update")}
        </Button>
      </SectionBottomActions>
    </SettingsHeader>
  );
};

export default GeneralView;
