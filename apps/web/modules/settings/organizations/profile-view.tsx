"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, Label, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { TimezoneSelect } from "@calcom/web/modules/timezone/components/TimezoneSelect";
import { zodResolver } from "@hookform/resolvers/zod";
import { revalidateSettingsOrgProfile } from "app/cache/path/settings/organizations";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

type OrgProfile = NonNullable<RouterOutputs["viewer"]["organizations"]["getCurrentOrg"]>;

const profileFormSchema = z.object({
  name: z.string().min(1),
  timeZone: z.string().min(1),
});

type FormValues = z.infer<typeof profileFormSchema>;

const ProfileView = ({ org }: { org: OrgProfile }) => {
  const {
    t,
    i18n: { language },
  } = useLocale();
  const utils = trpc.useUtils();
  const formMethods = useForm<FormValues>({
    defaultValues: { name: org.name, timeZone: org.timeZone },
    resolver: zodResolver(profileFormSchema),
  });
  const {
    formState: { isDirty },
  } = formMethods;

  const updateOrgMutation = trpc.viewer.organizations.updateOrg.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.getCurrentOrg.invalidate();
      revalidateSettingsOrgProfile();
      formMethods.reset(formMethods.getValues());
      showToast(t("settings_updated_successfully"), "success");
    },
    onError: () => {
      showToast(t("error_updating_settings"), "error");
    },
  });

  const suspensionDetails = [
    org.suspendedReason ? `${t("organization_suspended_reason")}: ${org.suspendedReason}` : null,
    org.suspendedAt
      ? t("suspended_on", { date: new Date(org.suspendedAt).toLocaleDateString(language) })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SettingsHeader
      title={t("profile")}
      description={t("organization_profile_description")}
      borderInShellHeader={true}>
      <Form
        form={formMethods}
        handleSubmit={(values) => {
          updateOrgMutation.mutate(values);
        }}>
        <div className="border-subtle stack-y-6 rounded-b-lg border border-t-0 px-4 py-8 sm:px-6">
          {org.suspended && (
            <Alert
              severity="warning"
              title={t("organization_suspended")}
              message={suspensionDetails || undefined}
            />
          )}
          <TextField label={t("organization_name")} {...formMethods.register("name")} />
          <TextField label={t("organization_slug")} value={org.slug ?? ""} disabled />
          <div>
            <Label>{t("timezone")}</Label>
            <Controller
              name="timeZone"
              control={formMethods.control}
              render={({ field: { value, onChange } }) => (
                <TimezoneSelect
                  id="timezone"
                  value={value}
                  onChange={(event) => {
                    if (event) onChange(event.value);
                  }}
                />
              )}
            />
          </div>
        </div>
        <SectionBottomActions>
          <Button
            type="submit"
            color="primary"
            disabled={!isDirty}
            loading={updateOrgMutation.isPending}>
            {t("update")}
          </Button>
        </SectionBottomActions>
      </Form>
    </SettingsHeader>
  );
};

export default ProfileView;
