"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsOrgManagedOrganizations } from "app/cache/path/settings/organizations";
import { useState } from "react";

type ManagedOrgLink = RouterOutputs["viewer"]["organizations"]["listManagedOrganizations"][number];

const ManagedOrgRow = ({ link }: { link: ManagedOrgLink }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  const unlinkMutation = trpc.viewer.organizations.unlinkManagedOrganization.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.listManagedOrganizations.invalidate();
      revalidateSettingsOrgManagedOrganizations();
      showToast(t("organization_unlinked"), "success");
    },
    onError: (error) => {
      showToast(error.message || t("error_unlinking_organization"), "error");
    },
  });

  const managed = link.managedOrganization;

  return (
    <div className="flex flex-wrap items-center gap-3 border-subtle border-b px-4 py-3 last:border-b-0 sm:flex-nowrap sm:px-6">
      <Avatar
        size="md"
        imageSrc={getPlaceholderAvatar(managed.logoUrl, managed.name)}
        alt={managed.name}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-default text-sm">{managed.name}</p>
        <p className="truncate text-sm text-subtle">{managed.slug}</p>
      </div>
      <Button color="minimal" onClick={() => setUnlinkDialogOpen(true)}>
        {t("unlink_organization")}
      </Button>
      <Dialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <ConfirmationDialogContent
          variety="danger"
          title={t("unlink_organization_confirm_title")}
          confirmBtnText={t("unlink_organization")}
          loadingText={t("unlink_organization")}
          isPending={unlinkMutation.isPending}
          onConfirm={() => {
            unlinkMutation.mutate({ managedOrganizationId: managed.id });
            setUnlinkDialogOpen(false);
          }}>
          <div className="mt-2">
            <p className="text-subtle text-sm">
              {t("unlink_organization_confirm_description", { name: managed.name })}
            </p>
          </div>
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};

const ManagedOrganizationsView = ({ managed }: { managed: ManagedOrgLink[] }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [slug, setSlug] = useState("");

  const linkMutation = trpc.viewer.organizations.linkManagedOrganization.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.listManagedOrganizations.invalidate();
      revalidateSettingsOrgManagedOrganizations();
      setSlug("");
      showToast(t("organization_linked"), "success");
    },
    onError: (error) => {
      showToast(error.message || t("error_linking_organization"), "error");
    },
  });

  return (
    <SettingsHeader
      title={t("managed_organizations")}
      description={t("managed_organizations_description")}
      borderInShellHeader={true}>
      <div className="border-subtle rounded-b-lg border border-t-0">
        <div className="border-subtle border-b px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <TextField
                label={t("organization_slug")}
                hint={t("link_organization_description")}
                placeholder={t("organization_slug_placeholder")}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </div>
            <Button
              color="primary"
              disabled={!slug.trim()}
              loading={linkMutation.isPending}
              onClick={() => linkMutation.mutate({ slug: slug.trim() })}>
              {t("link_organization")}
            </Button>
          </div>
        </div>
        {managed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-subtle sm:px-6">{t("no_managed_organizations")}</p>
        ) : (
          managed.map((link) => (
            <ManagedOrgRow key={link.managedOrganizationId} link={link} />
          ))
        )}
      </div>
    </SettingsHeader>
  );
};

export default ManagedOrganizationsView;
